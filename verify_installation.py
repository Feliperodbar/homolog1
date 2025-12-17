#!/usr/bin/env python3
"""
Verificador de Instalação - Screenshot Auto Windows

Execute este script para verificar se tudo está instalado corretamente.
Uso: python verify_installation.py
"""

import sys
import subprocess
from pathlib import Path

print("=" * 70)
print("🔍 VERIFICADOR DE INSTALAÇÃO - Screenshot Auto Windows")
print("=" * 70)
print()

# Checklist
checks = {
    "Python": False,
    "pynput": False,
    "mss": False,
    "pillow": False,
    "pywin32": False,
    "arquivo_principal": False,
    "arquivo_config": False,
}

# ============================================================================
# 1. Verificar Python
# ============================================================================
print("[1/7] Verificando Python...")
try:
    version = sys.version_info
    print(f"  ✅ Python {version.major}.{version.minor}.{version.micro} encontrado")
    checks["Python"] = True
except Exception as e:
    print(f"  ❌ Erro: {e}")

print()

# ============================================================================
# 2. Verificar Pacotes
# ============================================================================
packages = ["pynput", "mss", "PIL", "pywin32"]
package_map = {"PIL": "pillow"}

for i, pkg in enumerate(packages, 2):
    print(f"[{i}/7] Verificando {pkg}...")
    try:
        __import__(pkg)
        display_name = package_map.get(pkg, pkg)
        print(f"  ✅ {display_name} instalado")
        checks[display_name] = True
    except ImportError:
        display_name = package_map.get(pkg, pkg)
        print(f"  ❌ {display_name} NÃO encontrado")
        print(f"     Execute: pip install {display_name}")

print()

# ============================================================================
# 3. Verificar Arquivos
# ============================================================================
print("[6/7] Verificando arquivos do projeto...")
if Path("screenshot_windows_auto.py").exists():
    print("  ✅ screenshot_windows_auto.py encontrado")
    checks["arquivo_principal"] = True
else:
    print("  ❌ screenshot_windows_auto.py NÃO encontrado")

if Path("config_screenshot.py").exists():
    print("  ✅ config_screenshot.py encontrado")
    checks["arquivo_config"] = True
else:
    print("  ⚠️  config_screenshot.py não encontrado (opcional)")

print()

# ============================================================================
# 4. Teste de Funcionalidade
# ============================================================================
print("[7/7] Testando funcionalidade básica...")

try:
    import win32gui
    import pynput
    import mss
    from PIL import Image
    
    print("  ✅ Todos os imports funcionando")
    print()
    print("=" * 70)
    print("✅ VERIFICAÇÃO COMPLETA!")
    print("=" * 70)
    print()
    print("📋 Resumo:")
    for check, status in checks.items():
        symbol = "✅" if status else "⚠️ "
        print(f"  {symbol} {check}")
    
    print()
    print("🚀 Próximos passos:")
    print("  1. Execute: python screenshot_windows_auto.py")
    print("  2. Clique em um navegador")
    print("  3. Screenshots salvos em ./prints/")
    print()
    
except Exception as e:
    print(f"  ❌ Erro ao testar: {e}")
    print()
    print("=" * 70)
    print("❌ VERIFICAÇÃO FALHOU")
    print("=" * 70)
    print()
    print("Instale as dependências:")
    print("  pip install pynput mss pillow pywin32")
    print()
    sys.exit(1)
