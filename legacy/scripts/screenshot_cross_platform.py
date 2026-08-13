#!/usr/bin/env python3
"""
Cross-platform screenshot capture (Linux/macOS/Windows) without pywin32.

Features:
- Global mouse listener via pynput (captures on left button press)
- Captures monitor image using mss
- Modes: primary monitor, monitor under cursor, or all monitors
- Debounce to prevent duplicate captures
- Optional pointer highlight at click location
- PNG output with sanitized filename and timestamp

Dependencies: mss, pillow, pynput
"""
import os
import re
import sys
import time
import platform
from datetime import datetime

from typing import Optional, Tuple, Dict, List

try:
    import mss
    from mss.models import Monitor
except Exception as e:
    print(f"[erro] mss não instalado: {e}")
    sys.exit(1)

try:
    from PIL import Image, ImageDraw
except Exception as e:
    print(f"[erro] pillow (PIL) não instalado: {e}")
    sys.exit(1)

try:
    from pynput import mouse
    from pynput.mouse import Controller as MouseController
except Exception as e:
    print(f"[erro] pynput não instalado: {e}")
    sys.exit(1)

# =====================
# Configurações
# =====================
OUTPUT_DIR = os.environ.get("SCREENSHOT_OUTPUT_DIR", os.path.join(os.getcwd(), "prints"))
# \n primary: captura monitor primário
# \n cursor: captura monitor onde o cursor está no momento do clique
# \n all: captura todos os monitores (um arquivo por monitor)
CAPTURE_MODE = os.environ.get("SCREENSHOT_MODE", "cursor")  # "primary" | "cursor" | "all"

# Debounce em milissegundos (tempo mínimo entre capturas)
DEBOUNCE_MS = int(os.environ.get("SCREENSHOT_DEBOUNCE_MS", "200"))

# Desenhar destaque do clique (círculo) na posição do cursor
DRAW_POINTER = os.environ.get("SCREENSHOT_DRAW_POINTER", "1") in ("1", "true", "True")
POINTER_RADIUS = int(os.environ.get("SCREENSHOT_POINTER_RADIUS", "16"))  # raio do círculo
POINTER_COLOR = os.environ.get("SCREENSHOT_POINTER_COLOR", "#ff3b30")    # vermelho iOS-like
POINTER_STROKE = int(os.environ.get("SCREENSHOT_POINTER_STROKE", "3"))    # espessura do contorno

# Prefixo de nome de arquivo (opcional)
FILENAME_PREFIX = os.environ.get("SCREENSHOT_FILENAME_PREFIX", "screen")

# =====================
# Utilitários
# =====================

def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def timestamp() -> str:
    return datetime.now().strftime("%Y-%m-%d_%H-%M-%S")


def sanitize(s: str) -> str:
    s = re.sub(r"[\\/:*?\"<>|]", "_", s)
    s = re.sub(r"\s+", "_", s)
    return s[:100] if len(s) > 100 else s


# =====================
# Núcleo de captura
# =====================
class CrossPlatformScreenshot:
    def __init__(self,
                 output_dir: str = OUTPUT_DIR,
                 capture_mode: str = CAPTURE_MODE,
                 debounce_ms: int = DEBOUNCE_MS,
                 draw_pointer: bool = DRAW_POINTER):
        self.output_dir = output_dir
        self.capture_mode = capture_mode.lower()
        self.debounce_ms = debounce_ms
        self.draw_pointer = draw_pointer
        self._last_capture_ts = 0.0
        self._mouse = MouseController()
        ensure_dir(self.output_dir)

    def _get_monitors(self, sct: mss.MSS) -> List[Monitor]:
        # mss.monitors[0] = bounding box virtual geral; [1:] = monitores reais
        return sct.monitors

    def _monitor_under_cursor(self, monitors: List[Monitor]) -> Optional[Monitor]:
        x, y = self._mouse.position
        for i, mon in enumerate(monitors[1:], start=1):
            left = mon["left"]; top = mon["top"]
            width = mon["width"]; height = mon["height"]
            if left <= x < left + width and top <= y < top + height:
                return mon
        # fallback: primário
        return monitors[1] if len(monitors) > 1 else None

    def _draw_pointer(self, img: Image.Image, mon: Monitor, click_pos: Tuple[int, int]) -> None:
        if not self.draw_pointer:
            return
        x_global, y_global = click_pos
        # Converte posição global para coordenadas relativas ao monitor
        x = x_global - mon["left"]
        y = y_global - mon["top"]
        if x < 0 or y < 0 or x >= img.width or y >= img.height:
            return
        draw = ImageDraw.Draw(img)
        r = POINTER_RADIUS
        bbox = [(x - r, y - r), (x + r, y + r)]
        draw.ellipse(bbox, outline=POINTER_COLOR, width=POINTER_STROKE)

    def _save_png(self, pil_img: Image.Image, base_name: str) -> str:
        fname = f"{sanitize(base_name)}_{timestamp()}.png"
        path = os.path.join(self.output_dir, fname)
        pil_img.save(path, format="PNG")
        return path

    def _grab_monitor(self, sct: mss.MSS, mon: Monitor) -> Image.Image:
        shot = sct.grab(mon)
        img = Image.frombytes("RGB", shot.size, shot.rgb)
        return img

    def capture(self, click_pos: Tuple[int, int]) -> List[str]:
        now = time.time() * 1000
        if now - self._last_capture_ts < self.debounce_ms:
            return []
        self._last_capture_ts = now
        saved: List[str] = []
        with mss.mss() as sct:
            monitors = self._get_monitors(sct)
            if len(monitors) <= 1:
                print("[aviso] Nenhum monitor detectado.")
                return []

            mode = self.capture_mode
            if mode == "primary":
                mon = monitors[1]
                img = self._grab_monitor(sct, mon)
                self._draw_pointer(img, mon, click_pos)
                saved.append(self._save_png(img, f"{FILENAME_PREFIX}_monitor1"))
            elif mode == "cursor":
                mon = self._monitor_under_cursor(monitors)
                if mon is None:
                    print("[aviso] Monitor sob cursor não encontrado, usando primário.")
                    mon = monitors[1]
                img = self._grab_monitor(sct, mon)
                self._draw_pointer(img, mon, click_pos)
                saved.append(self._save_png(img, f"{FILENAME_PREFIX}_cursor"))
            elif mode == "all":
                for idx, mon in enumerate(monitors[1:], start=1):
                    img = self._grab_monitor(sct, mon)
                    self._draw_pointer(img, mon, click_pos)
                    saved.append(self._save_png(img, f"{FILENAME_PREFIX}_monitor{idx}"))
            else:
                print(f"[aviso] CAPTURE_MODE inválido: {mode}. Usando 'cursor'.")
                mon = self._monitor_under_cursor(monitors)
                img = self._grab_monitor(sct, mon)
                self._draw_pointer(img, mon, click_pos)
                saved.append(self._save_png(img, f"{FILENAME_PREFIX}_cursor"))
        return saved

    # Listener callback
    def on_click(self, x: int, y: int, button, pressed: bool):
        try:
            if not pressed:
                return
            if button != mouse.Button.left:
                return
            saved = self.capture((x, y))
            for path in saved:
                print(f"[ok] Screenshot salvo: {path}")
        except Exception as e:
            print(f"[erro] Falha ao capturar: {e}")

    def start(self):
        print("═══════════════════════════════════════════════════")
        print(" Cross-Platform Screenshot (sem pywin32)")
        print(" Sistema:", platform.platform())
        print(" Modo:   ", self.capture_mode)
        print(" Pasta:  ", self.output_dir)
        print(" Debounce(ms):", self.debounce_ms)
        print(" Ponteiro:", "on" if self.draw_pointer else "off")
        print(" Clique esquerdo do mouse para capturar.")
        print(" Ctrl+C para sair.")
        print("═══════════════════════════════════════════════════")
        listener = mouse.Listener(on_click=self.on_click)
        listener.start()
        try:
            while True:
                time.sleep(0.5)
        except KeyboardInterrupt:
            print("[info] Encerrado pelo usuário.")
            listener.stop()


def main():
    app = CrossPlatformScreenshot()
    app.start()


if __name__ == "__main__":
    main()
