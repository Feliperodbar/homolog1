#!/usr/bin/env bash
set -euo pipefail

# Cross-platform installer (Linux/macOS) for screenshot_cross_platform.py
# Installs: mss, pillow, pynput

echo "==> Detectando Python..."
PY_BIN="python3"
if ! command -v "$PY_BIN" >/dev/null 2>&1; then
  echo "[erro] python3 não encontrado. Instale Python 3 e tente novamente." >&2
  exit 1
fi

PIP_BIN="$PY_BIN" -m pip

echo "==> Atualizando pip"
$PY_BIN -m pip install --upgrade pip

echo "==> Instalando dependências (mss, pillow, pynput)"
$PY_BIN -m pip install --upgrade mss pillow pynput

cat << 'EOF'

Dependências instaladas com sucesso!

Para executar:

  # Linux/macOS
  python3 screenshot_cross_platform.py

Variáveis opcionais:
  SCREENSHOT_MODE=primary|cursor|all
  SCREENSHOT_OUTPUT_DIR=./prints
  SCREENSHOT_DEBOUNCE_MS=200
  SCREENSHOT_DRAW_POINTER=1

Exemplos:
  SCREENSHOT_MODE=cursor python3 screenshot_cross_platform.py
  SCREENSHOT_MODE=all SCREENSHOT_OUTPUT_DIR=./prints python3 screenshot_cross_platform.py

EOF
