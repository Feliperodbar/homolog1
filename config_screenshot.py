"""
Arquivo de configuração para screenshot_windows_auto.py

Modifique as constantes abaixo para customizar o comportamento.
Este arquivo é importado pelo script principal.

Exemplo de uso no script:
    from config_screenshot import *
"""

# ============================================================================
# CONFIGURAÇÕES DE SAÍDA
# ============================================================================

# Diretório onde salvar screenshots
# Exemplos: "./prints", "C:\\Users\\Usuario\\Desktop\\Screenshots"
OUTPUT_DIR = "./prints"

# Criar diretório automaticamente se não existir
CREATE_DIR_IF_NOT_EXISTS = True


# ============================================================================
# CONFIGURAÇÕES DE FILTROS
# ============================================================================

# Filtrar por navegador específico
# Opções: None (todos), "chrome", "firefox", "edge", "brave"
# Exemplos:
#   BROWSER_FILTER = None        # Capturar de todos os navegadores
#   BROWSER_FILTER = "chrome"    # Só Chrome
#   BROWSER_FILTER = "edge"      # Só Microsoft Edge
BROWSER_FILTER = None

# Filtrar por parte do título da janela
# None = sem filtro (captura qualquer janela)
# Exemplos:
#   TITLE_FILTER = None          # Sem filtro
#   TITLE_FILTER = "H2Maps"      # Só captura se título contém "H2Maps"
#   TITLE_FILTER = "Google"      # Só captura se título contém "Google"
TITLE_FILTER = None

# Diferenciar maiúsculas/minúsculas no filtro de título
# False = "h2maps" é igual a "H2Maps"
# True = case-sensitive
TITLE_FILTER_CASE_SENSITIVE = False


# ============================================================================
# CONFIGURAÇÕES DE TIMING
# ============================================================================

# Debounce em milissegundos (tempo mínimo entre capturas)
# Evita múltiplas capturas rápidas do mesmo clique
# Intervalo recomendado: 100-500 ms
# Exemplos:
#   DEBOUNCE_MS = 150   # Padrão (captura a cada 150ms no máximo)
#   DEBOUNCE_MS = 300   # Mais conservador (evita cliques duplos)
#   DEBOUNCE_MS = 50    # Mais agressivo (permite capturas rápidas)
DEBOUNCE_MS = 150


# ============================================================================
# CONFIGURAÇÕES DE QUALIDADE DE IMAGEM
# ============================================================================

# Qualidade PNG (não há compressão em PNG, mas pode afetar processamento)
PNG_QUALITY = "high"  # "high", "medium", "low"

# Formatos suportados para salvar (se modificar, atualizar no script)
# Atualmente suportado: "png" (recomendado)
IMAGE_FORMAT = "png"


# ============================================================================
# CONFIGURAÇÕES DE NAVEGADORES CUSTOMIZADAS
# ============================================================================

# Se desejar adicionar navegadores customizados, descomente e modifique:

# Mapeamento adicional de classes de janelas
CUSTOM_BROWSER_CLASSES = {
    # "MinhaClasse": ["meu_navegador"],
}

# Mapeamento adicional de executáveis
CUSTOM_BROWSER_EXECUTABLES = {
    # "meu_executavel.exe": "MeuNavegador",
}


# ============================================================================
# CONFIGURAÇÕES DE CONSOLE E LOGS
# ============================================================================

# Mostrar mensagens de debug
DEBUG_MODE = False

# Verbose mode (mais detalhes)
VERBOSE = False

# Cores no console (Windows)
USE_COLORS = True

# Salvar log em arquivo
LOG_TO_FILE = False
LOG_FILE = "./screenshot_auto.log"


# ============================================================================
# CONFIGURAÇÕES AVANÇADAS
# ============================================================================

# Atalhos de teclado (placeholder - ver arquivo principal)
# PAUSE_RESUME_KEY = keyboard.Key.p          # Ctrl+Shift+P
# EXIT_KEY = keyboard.Key.q                  # Ctrl+Shift+Q

# Incluir timestamp em microsegundos (mais precisão)
INCLUDE_MICROSECONDS = False

# Validar dimensões mínimas da janela antes de capturar
MIN_WINDOW_WIDTH = 100
MIN_WINDOW_HEIGHT = 100

# Timeout para operações de captura (segundos)
CAPTURE_TIMEOUT = 5

# Tentar recuperar de erros
ERROR_RECOVERY = True


# ============================================================================
# PRESETS (Combinações prontas de configuração)
# ============================================================================

# Descomente uma das presets abaixo se desejar

# Preset: Capturar só H2Maps em Chrome
# BROWSER_FILTER = "chrome"
# TITLE_FILTER = "H2Maps"
# OUTPUT_DIR = "./prints_h2maps"

# Preset: Capturar só do Edge com alta frequência
# BROWSER_FILTER = "edge"
# DEBOUNCE_MS = 50
# OUTPUT_DIR = "./prints_edge"

# Preset: Capturar de todos os navegadores com debounce alto
# BROWSER_FILTER = None
# DEBOUNCE_MS = 500
# OUTPUT_DIR = "./prints_all"

# Preset: Debug mode com verbose
# DEBUG_MODE = True
# VERBOSE = True
# DEBOUNCE_MS = 300
