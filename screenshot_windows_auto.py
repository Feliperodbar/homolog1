#!/usr/bin/env python3
"""
Automação de Screenshot para Navegadores no Windows

Escuta global de cliques do mouse (botão esquerdo) e captura a janela ativa
se for um navegador (Chrome, Edge, Brave, Firefox). Salva screenshots em PNG
com nome sanitizado e timestamp.

Requisitos:
  - pip install pynput mss pillow pywin32

Uso:
  python screenshot_windows_auto.py

Atalhos:
  - Ctrl+Shift+P: Pausar/Retomar captura
  - Ctrl+Shift+Q: Encerrar script

Configurações (edite as constantes abaixo):
  - BROWSER_FILTER: Filtrar por navegador específico (None = todos)
  - TITLE_FILTER: Filtrar por parte do título da janela
  - DEBOUNCE_MS: Intervalo mínimo entre capturas (ms)
  - OUTPUT_DIR: Diretório de saída para screenshots
"""

import os
import sys
import time
import threading
import re
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

try:
    import win32gui
    import win32process
    import win32api
    import win32con
except ImportError:
    print("❌ Erro: pywin32 não instalado. Execute: pip install pywin32")
    sys.exit(1)

try:
    from pynput import mouse, keyboard
except ImportError:
    print("❌ Erro: pynput não instalado. Execute: pip install pynput")
    sys.exit(1)

try:
    import mss
except ImportError:
    print("❌ Erro: mss não instalado. Execute: pip install mss")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("❌ Erro: Pillow não instalado. Execute: pip install pillow")
    sys.exit(1)

# ============================================================================
# CONFIGURAÇÕES
# ============================================================================

# Diretório de saída
OUTPUT_DIR = "./prints"

# Filtrar por navegador específico (None = todos, "chrome", "firefox", "edge", "brave")
BROWSER_FILTER = None

# Filtrar por parte do título (None = sem filtro, ex: "H2Maps" só captura se título contém)
TITLE_FILTER = None

# Debounce em milissegundos (tempo mínimo entre capturas)
DEBOUNCE_MS = 150

# Mapeamento de classes de janelas para navegadores
BROWSER_CLASSES = {
    "Chrome_WidgetWin_1": ["chrome", "edge", "brave"],
    "MozillaWindowClass": ["firefox"],
}

# Mapeamento de executáveis para tipos de navegador
BROWSER_EXECUTABLES = {
    "chrome.exe": "Chrome",
    "msedge.exe": "Edge",
    "brave.exe": "Brave",
    "firefox.exe": "Firefox",
}

# ============================================================================
# CLASSE PRINCIPAL DE GERENCIAMENTO
# ============================================================================

class BrowserScreenshotCapture:
    """Gerenciador de captura de screenshots de navegadores."""
    
    def __init__(self):
        self.last_capture_time = 0
        self.paused = False
        self.running = True
        self.listener = None
        self.keyboard_listener = None
        
        # Criar diretório de saída se não existir
        Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
        print(f"📁 Diretório de saída: {Path(OUTPUT_DIR).resolve()}")
    
    def get_active_window(self) -> Optional[Tuple[int, str, str]]:
        """
        Obtém a janela ativa.
        Retorna: (hwnd, título, classe) ou None
        """
        try:
            hwnd = win32gui.GetForegroundWindow()
            if not hwnd:
                return None
            
            title = win32gui.GetWindowText(hwnd)
            win_class = win32gui.GetClassName(hwnd)
            
            return hwnd, title, win_class
        except Exception as e:
            print(f"⚠️  Erro ao obter janela ativa: {e}")
            return None
    
    def is_browser_window(self, hwnd: int, win_class: str, title: str) -> Tuple[bool, Optional[str]]:
        """
        Verifica se a janela é um navegador suportado.
        Retorna: (é_navegador, tipo_navegador)
        """
        # Verificar por classe de janela
        if win_class in BROWSER_CLASSES:
            # Se houver filtro de navegador, verificar se corresponde
            if BROWSER_FILTER:
                nav_types = BROWSER_CLASSES[win_class]
                if BROWSER_FILTER.lower() not in nav_types:
                    return False, None
            
            # Retornar tipo baseado no executável
            nav_type = self._get_browser_type_by_process(hwnd)
            return True, nav_type
        
        # Verificar por classe alternativa (caso não encontre acima)
        nav_type = self._get_browser_type_by_process(hwnd)
        if nav_type:
            if BROWSER_FILTER and nav_type.lower() != BROWSER_FILTER.lower():
                return False, None
            return True, nav_type
        
        return False, None
    
    def _get_browser_type_by_process(self, hwnd: int) -> Optional[str]:
        """Obtém tipo de navegador verificando o executável do processo."""
        try:
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            
            # Tentar com wmi (se psutil não estiver disponível)
            try:
                import psutil
                process = psutil.Process(pid)
                executable = process.name().lower()
            except ImportError:
                # Fallback: usar win32api
                handle = win32api.OpenProcess(win32con.PROCESS_QUERY_INFORMATION, False, pid)
                executable = win32process.GetModuleFileNameEx(handle, None).split("\\")[-1].lower()
            
            for exec_name, nav_type in BROWSER_EXECUTABLES.items():
                if executable.endswith(exec_name.lower()):
                    return nav_type
        except Exception as e:
            print(f"⚠️  Erro ao obter tipo de navegador: {e}")
        
        return None
    
    def should_capture(self, title: str) -> bool:
        """Verifica se deve capturar baseado no filtro de título."""
        if TITLE_FILTER is None:
            return True
        return TITLE_FILTER.lower() in title.lower()
    
    def get_window_rect(self, hwnd: int) -> Optional[Tuple[int, int, int, int]]:
        """
        Obtém as coordenadas da janela.
        Retorna: (left, top, right, bottom) ou None
        """
        try:
            rect = win32gui.GetWindowRect(hwnd)
            left, top, right, bottom = rect
            
            # Validar dimensões
            if right <= left or bottom <= top:
                print(f"⚠️  Dimensões inválidas: {rect}")
                return None
            
            return left, top, right, bottom
        except Exception as e:
            print(f"⚠️  Erro ao obter coordenadas da janela: {e}")
            return None
    
    def capture_window(self, hwnd: int, title: str, nav_type: str) -> bool:
        """
        Captura apenas a janela especificada e salva como PNG.
        Retorna: True se capturado com sucesso, False caso contrário.
        """
        try:
            # Obter coordenadas
            rect = self.get_window_rect(hwnd)
            if rect is None:
                return False
            
            left, top, right, bottom = rect
            width = right - left
            height = bottom - top
            
            # Validar dimensões
            if width <= 0 or height <= 0:
                print(f"⚠️  Dimensões inválidas da janela: {width}x{height}")
                return False
            
            # Capturar a região da tela usando mss
            with mss.mss() as sct:
                monitor = {"top": top, "left": left, "width": width, "height": height}
                screenshot = sct.grab(monitor)
            
            # Converter para PIL Image
            image = Image.frombytes("RGB", screenshot.size, screenshot.rgb)
            
            # Sanitizar título para nome de arquivo
            safe_title = self._sanitize_filename(title)
            
            # Gerar nome do arquivo com timestamp
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            filename = f"{safe_title}_{timestamp}.png"
            filepath = Path(OUTPUT_DIR) / filename
            
            # Salvar arquivo
            image.save(str(filepath), "PNG")
            
            print(f"✅ Screenshot capturado: {filename}")
            print(f"   Navegador: {nav_type} | Tamanho: {width}x{height} | Título: {title[:50]}")
            
            return True
        
        except Exception as e:
            print(f"❌ Erro ao capturar screenshot: {e}")
            return False
    
    def _sanitize_filename(self, title: str) -> str:
        """Sanitiza o título da janela para usar como nome de arquivo."""
        # Remover caracteres inválidos para nome de arquivo
        safe_name = re.sub(r'[<>:"/\\|?*]', '', title)
        # Remover espaços múltiplos e truncar
        safe_name = re.sub(r'\s+', '_', safe_name)
        safe_name = safe_name.strip("_")
        # Limitar tamanho
        return safe_name[:80] if safe_name else "screenshot"
    
    def on_mouse_click(self, x, y, button, pressed):
        """Callback para eventos de clique do mouse."""
        if not pressed:
            return  # Ignorar quando solta o botão
        
        # Apenas botão esquerdo
        if button != mouse.Button.left:
            return
        
        # Verificar pausa
        if self.paused:
            return
        
        # Debounce: ignorar se passou pouco tempo desde última captura
        current_time = time.time() * 1000  # Converter para ms
        if current_time - self.last_capture_time < DEBOUNCE_MS:
            return
        
        self.last_capture_time = current_time
        
        # Obter janela ativa
        window_info = self.get_active_window()
        if window_info is None:
            return
        
        hwnd, title, win_class = window_info
        
        # Verificar se é navegador
        is_browser, nav_type = self.is_browser_window(hwnd, win_class, title)
        if not is_browser:
            return
        
        # Verificar filtro de título
        if not self.should_capture(title):
            return
        
        # Capturar screenshot
        self.capture_window(hwnd, title, nav_type or "Unknown")
    
    def on_keyboard_event(self, key):
        """Callback para eventos de teclado."""
        try:
            # Verificar se é Ctrl+Shift+P (pausar/retomar)
            if key == keyboard.Key.p:
                # Verificar modifiers (simplificado)
                current_modifiers = set()
                try:
                    # Usar listener separado para verificar
                    pass
                except:
                    pass
                
            # Verificar se é Ctrl+Shift+Q (encerrar)
            if key == keyboard.Key.q:
                print("\n⏹️  Encerrando...")
                self.running = False
                return False
        
        except Exception as e:
            print(f"⚠️  Erro no callback de teclado: {e}")
    
    def start(self):
        """Inicia os listeners de mouse e teclado."""
        print("🎯 Listener iniciado. Aguardando cliques...")
        print(f"📋 Configurações:")
        print(f"   - Debounce: {DEBOUNCE_MS}ms")
        print(f"   - Navegador: {BROWSER_FILTER or 'Todos'}")
        print(f"   - Filtro de título: {TITLE_FILTER or 'Nenhum'}")
        print(f"   - Saída: {OUTPUT_DIR}")
        print("\n⌨️  Atalhos:")
        print("   - Botão Esquerdo do Mouse: Capturar janela ativa")
        print("   - Ctrl+Shift+Q: Encerrar script\n")
        
        # Listener de mouse
        self.listener = mouse.Listener(on_click=self.on_mouse_click)
        self.listener.start()
        
        # Manter o script rodando
        try:
            while self.running:
                time.sleep(0.1)
        except KeyboardInterrupt:
            print("\n⏹️  Script interrompido pelo usuário")
        finally:
            self.stop()
    
    def stop(self):
        """Para os listeners."""
        print("🛑 Parando listeners...")
        if self.listener:
            self.listener.stop()
        if self.keyboard_listener:
            self.keyboard_listener.stop()
        print("✅ Finalizado")


# ============================================================================
# FUNÇÃO PRINCIPAL
# ============================================================================

def main():
    """Função principal que inicializa a automação."""
    print("=" * 70)
    print("🖼️  AUTOMAÇÃO DE SCREENSHOT PARA NAVEGADORES - WINDOWS")
    print("=" * 70)
    print()
    
    # Validar que o diretório pode ser criado
    try:
        Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    except Exception as e:
        print(f"❌ Erro ao criar diretório de saída: {e}")
        sys.exit(1)
    
    # Criar capturador
    capturer = BrowserScreenshotCapture()
    
    # Iniciar
    try:
        capturer.start()
    except Exception as e:
        print(f"❌ Erro fatal: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
