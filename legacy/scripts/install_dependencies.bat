@echo off
REM Instalação rápida de dependências para screenshot_windows_auto.py
REM Execute como administrador para melhor funcionamento

echo.
echo ============================================================
echo  Instalacao de Dependencias - Screenshot Auto Windows
echo ============================================================
echo.

REM Verificar se Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python nao encontrado!
    echo Instale Python de: https://www.python.org/
    pause
    exit /b 1
)

echo [OK] Python encontrado
echo.

REM Instalar dependências
echo Instalando dependencias...
echo.

pip install --upgrade pip
if errorlevel 1 (
    echo [ERRO] Falha ao atualizar pip
    pause
    exit /b 1
)

pip install pynput mss pillow pywin32
if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias
    pause
    exit /b 1
)

echo.
echo [OK] Todas as dependencias instaladas com sucesso!
echo.

REM Executar post-install do pywin32
echo Configurando pywin32...
python -m pip install --force-reinstall --no-cache-dir pywin32 >nul 2>&1

REM Tentar executar script de post-install
python -m pywin32_postinstall -install >nul 2>&1

echo.
echo ============================================================
echo  Instalacao Concluida!
echo ============================================================
echo.
echo Proximo passo:
echo  1. Abra um terminal (cmd ou PowerShell)
echo  2. Execute: python screenshot_windows_auto.py
echo.
echo Para usar com melhor funcionamento global, execute o terminal
echo como ADMINISTRADOR.
echo.

pause
