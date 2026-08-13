@echo off
REM Script de inicialização para screenshot_windows_auto.py
REM Execute este arquivo para iniciar o capturador de screenshots

setlocal enabledelayedexpansion

REM Cores (requer Windows 10+)
for /F %%A in ('echo prompt $H ^| cmd') do set "BS=%%A"

echo.
echo ================================================
echo  Screenshot Auto - Windows Navigator Capture
echo ================================================
echo.

REM Verificar se Python está disponível
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python nao encontrado no PATH
    echo.
    echo Por favor, instale Python e adicione ao PATH:
    echo  https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

REM Mudar para o diretório do script se necessário
cd /d "%~dp0"

REM Verificar se o script principal existe
if not exist "screenshot_windows_auto.py" (
    echo [ERRO] Arquivo 'screenshot_windows_auto.py' nao encontrado!
    echo.
    echo Certifique-se de que voce esta no diretorio correto
    echo.
    pause
    exit /b 1
)

REM Exibir informações
echo [OK] Python encontrado
echo [OK] Script encontrado: screenshot_windows_auto.py
echo.
echo Iniciando capturador de screenshots...
echo.
echo Instrucoes de uso:
echo  1. Clique com botao esquerdo em uma janela de navegador
echo  2. O screenshot sera salvo em ./prints/
echo  3. Feche a janela ou pressione Ctrl+C para sair
echo.
echo ================================================
echo.

REM Iniciar o script
python screenshot_windows_auto.py

REM Se o script encerrar
echo.
echo ================================================
echo  Script finalizado
echo ================================================
echo.
pause
