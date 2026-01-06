# 🎓 Guia Completo - Screenshot Auto Windows

## 📚 Índice

1. [Instalação Rápida](#instalação-rápida)
2. [Primeiros Passos](#primeiros-passos)
3. [Exemplos Práticos](#exemplos-práticos)
4. [Configuração Avançada](#configuração-avançada)
5. [Troubleshooting](#troubleshooting)
6. [Arquivo de Configuração](#arquivo-de-configuração)

---

## 🚀 Instalação Rápida

### Opção 1: Automática (Recomendado)

1. Baixe `install_dependencies.bat`
2. Clique com botão direito → "Executar como administrador"
3. Aguarde a conclusão

### Opção 2: Manual

```bash
# Terminal como administrador
pip install pynput mss pillow pywin32
python -m pip install --force-reinstall pywin32
python -m pywin32_postinstall -install
```

---

## 🎯 Primeiros Passos

### Execução Básica

```bash
# Terminal
python screenshot_windows_auto.py
```

**Saída esperada:**

```
======================================================================
🖼️  AUTOMAÇÃO DE SCREENSHOT PARA NAVEGADORES - WINDOWS
======================================================================

📁 Diretório de saída: C:\seu\caminho\prints
🎯 Listener iniciado. Aguardando cliques...
📋 Configurações:
   - Debounce: 150ms
   - Navegador: Todos
   - Filtro de título: Nenhum
   - Saída: ./prints

⌨️  Atalhos:
   - Botão Esquerdo do Mouse: Capturar janela ativa
   - Ctrl+Shift+Q: Encerrar script
```

### Capturar seu Primeiro Screenshot

1. Abra um navegador (Chrome, Edge, Firefox, Brave)
2. Com o script rodando, **clique com botão esquerdo** em qualquer lugar da janela do navegador
3. Veja a mensagem: `✅ Screenshot capturado: ...`
4. Arquivo salvo em `./prints/`

---

## 💡 Exemplos Práticos

### Exemplo 1: Capturar só Chrome

**Editar `screenshot_windows_auto.py`:**

```python
# Linha ~50
BROWSER_FILTER = "chrome"
```

**Resultado:** Só Chrome será capturado

---

### Exemplo 2: Capturar só de páginas H2Maps

**Editar `screenshot_windows_auto.py`:**

```python
# Linha ~53
TITLE_FILTER = "H2Maps"
```

**Resultado:** Só janelas contendo "H2Maps" no título

---

### Exemplo 3: Capturar Chrome + H2Maps

**Editar `screenshot_windows_auto.py`:**

```python
# Linha ~50-53
BROWSER_FILTER = "chrome"
TITLE_FILTER = "H2Maps"
```

**Resultado:** Só Chrome com "H2Maps" no título

---

### Exemplo 4: Aumentar Intervalo Entre Capturas

**Editar `screenshot_windows_auto.py`:**

```python
# Linha ~56
DEBOUNCE_MS = 500  # em vez de 150
```

**Resultado:** Mínimo 500ms entre capturas (evita duplicatas)

---

### Exemplo 5: Salvar em Pasta Customizada

**Editar `screenshot_windows_auto.py`:**

```python
# Linha ~47
OUTPUT_DIR = "C:\\Users\\SeuUsuário\\Desktop\\Prints"
```

**Resultado:** Screenshots em `C:\Users\SeuUsuário\Desktop\Prints`

---

## ⚙️ Configuração Avançada

### Via Arquivo config_screenshot.py

1. Edite `config_screenshot.py` com as configurações desejadas
2. No topo de `screenshot_windows_auto.py`, descomente:

```python
from config_screenshot import *
```

### Customizar Navegadores

Se usar um navegador não suportado, identifique:

**Classe da janela:**

```python
# Adicione em config_screenshot.py
CUSTOM_BROWSER_CLASSES = {
    "MeuNavegador_Window": ["meunavegador"],
}
```

**Executável:**

```python
# Adicione em config_screenshot.py
CUSTOM_BROWSER_EXECUTABLES = {
    "meunav.exe": "MeuNavegador",
}
```

---

## 🔍 Troubleshooting

### ❌ "Erro: pywin32 não instalado"

```bash
pip install pywin32
python -m pywin32_postinstall -install
```

---

### ❌ "Cliques não funcionam em background"

**Solução:** Execute terminal como administrador

```bash
# No Windows, abra PowerShell como administrador
python screenshot_windows_auto.py
```

---

### ❌ "Screenshot vazio ou preto"

**Causas:**

- Navegador em fullscreen (tentar no modo janela)
- Tela de login ou bloqueio
- Janela minimizada

**Solução:**

- Maximize a janela do navegador
- Aguarde a página carregar completamente
- Tente novamente

---

### ❌ "Erro: Dimensões inválidas da janela"

**Causa:** Janela muito pequena ou não carregada

**Solução:**

```python
# Aumente o tamanho mínimo em screenshot_windows_auto.py
MIN_WINDOW_WIDTH = 200
MIN_WINDOW_HEIGHT = 200
```

---

### ❌ "Nada acontece ao clicar"

**Causas possíveis:**

1. Janela não é navegador suportado
2. Terminal não como administrador
3. Filtro de título impedindo captura

**Debug:**

```python
# Adicione no script principal
DEBUG_MODE = True
VERBOSE = True
```

---

### ❌ "Script travado ou congelado"

**Solução:** Pressione `Ctrl+C` no terminal

---

### ❌ "Permissão negada ao salvar"

**Causa:** Pasta protegida ou sem permissão

**Solução:**

```python
# Use uma pasta com permissão
OUTPUT_DIR = "C:\\Users\\SeuUsuário\\Downloads\\prints"
```

---

### ❌ "Múltiplas capturas no mesmo clique"

**Causa:** Debounce muito baixo

**Solução:** Aumente o debounce

```python
DEBOUNCE_MS = 300  # em vez de 150
```

---

## 📋 Arquivo de Configuração

### Usando config_screenshot.py

1. **Copie as configurações** de `config_screenshot.py`
2. **Modifique conforme necessário**
3. **No script principal**, adicione no topo (após imports):

```python
from config_screenshot import *
```

### Presets Disponíveis

**Preset 1: H2Maps em Chrome**

```python
BROWSER_FILTER = "chrome"
TITLE_FILTER = "H2Maps"
OUTPUT_DIR = "./prints_h2maps"
DEBOUNCE_MS = 200
```

**Preset 2: Todos os navegadores**

```python
BROWSER_FILTER = None
TITLE_FILTER = None
DEBOUNCE_MS = 150
```

**Preset 3: Testes rápidos (Firefox)**

```python
BROWSER_FILTER = "firefox"
DEBOUNCE_MS = 50
```

---

## 🎮 Casos de Uso

### Caso 1: Testes Automatizados de UI

```python
BROWSER_FILTER = "chrome"
OUTPUT_DIR = "./tests/screenshots"
DEBOUNCE_MS = 200
```

**Como usar:**

1. Execute seu teste automatizado
2. Em pontos críticos, adicione `time.sleep(0.5)` + clique
3. Screenshots capturados automaticamente

---

### Caso 2: Documentação de Bug

```python
TITLE_FILTER = "Sistema de Gestão"
OUTPUT_DIR = "./bugs/screenshots"
```

**Como usar:**

1. Reproduza o bug
2. Clique para capturar estado
3. Compartilhe screenshots com dados

---

### Caso 3: Monitoramento Contínuo

```python
DEBOUNCE_MS = 5000  # 5 segundos
OUTPUT_DIR = "./monitoring"
BROWSER_FILTER = "edge"
```

**Como usar:**

1. Execute continuamente em background
2. Clique periodicamente para logs visuais
3. Histórico completo salvo com timestamps

---

## 📊 Arquivos Criados

Após primeira execução com sucesso:

```
projeto/
├── screenshot_windows_auto.py      (script principal)
├── config_screenshot.py             (configuração)
├── install_dependencies.bat         (instalador)
├── run_screenshot_auto.bat          (inicializador)
├── SCREENSHOT_AUTO_README.md        (manual)
├── SCREENSHOT_AUTO_GUIDE.md         (este arquivo)
└── prints/                          (pasta de saída)
    ├── google_page_2025-12-17_14-30-45.png
    ├── h2maps_dashboard_2025-12-17_14-31-12.png
    └── ...
```

---

## 🔑 Atalhos de Teclado

| Atalho              | Ação                               |
| ------------------- | ---------------------------------- |
| **Clique Esquerdo** | Capturar janela do navegador ativo |
| **Ctrl+C**          | Encerrar script (no terminal)      |

---

## 📞 Suporte

### Checklist de Troubleshooting

- [ ] Python 3.8+ instalado?
- [ ] Todas as dependências instaladas?
- [ ] Terminal aberto como administrador?
- [ ] Navegador é suportado (Chrome/Edge/Brave/Firefox)?
- [ ] Janela do navegador não está minimizada?
- [ ] Filtros estão corretos?

### Comandos Úteis

```bash
# Verificar versão Python
python --version

# Listar pacotes instalados
pip list | findstr "pynput mss pillow"

# Reinstalar tudo
pip install --force-reinstall pynput mss pillow pywin32

# Executar com debug
python screenshot_windows_auto.py 2>&1 | tee debug.log
```

---

## 🎓 Dicas Profissionais

1. **Use atalhos customizados** no Windows para iniciar rápido
2. **Organize por projeto** criando pastas diferentes
3. **Batch processing** - tire várias screenshots seguidas com clique rápido
4. **Nomeação automática** - títulos aparecem no nome do arquivo
5. **Histórico visual** - mantenha pastas antigas para comparação

---

## 🚀 Performance

- **Uso de CPU:** < 1% quando idle
- **Uso de RAM:** ~50-100 MB
- **Latência de captura:** ~200-500ms
- **Tamanho de arquivo:** ~200-500 KB por PNG

---

**Última atualização:** 2025-12-17  
**Versão:** 1.0  
**Autor:** Screenshot Auto Script
