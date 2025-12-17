# ⚡ Referência Rápida - Screenshot Auto Windows

## 🚀 Iniciar em 30 Segundos

```bash
# 1. Instalar (uma vez)
pip install pynput mss pillow pywin32

# 2. Executar
python screenshot_windows_auto.py

# 3. Clicar em um navegador
# ✅ Screenshot salvo em ./prints/
```

---

## 📋 Configurações Principais

```python
# Arquivo: screenshot_windows_auto.py (edite as linhas ~47-56)

OUTPUT_DIR = "./prints"              # Pasta de saída
BROWSER_FILTER = None                # chrome, edge, firefox, brave, None
TITLE_FILTER = None                  # "H2Maps", "Google", etc ou None
DEBOUNCE_MS = 150                    # Tempo mínimo entre capturas (ms)
```

---

## 🎯 Exemplos Rápidos

### Chrome apenas

```python
BROWSER_FILTER = "chrome"
```

### Edge + H2Maps

```python
BROWSER_FILTER = "edge"
TITLE_FILTER = "H2Maps"
```

### Todos os navegadores, intervalo 300ms

```python
BROWSER_FILTER = None
DEBOUNCE_MS = 300
```

### Salvar em Desktop

```python
OUTPUT_DIR = "C:\\Users\\SeuUsuário\\Desktop\\prints"
```

---

## 📁 Arquivos

| Arquivo                      | Tipo           | Uso                     |
| ---------------------------- | -------------- | ----------------------- |
| `screenshot_windows_auto.py` | 🐍 Python      | Script principal        |
| `config_screenshot.py`       | 🐍 Python      | Configurações avançadas |
| `install_dependencies.bat`   | 📦 Installer   | Instalar tudo           |
| `run_screenshot_auto.bat`    | ▶️ Launcher    | Iniciar script          |
| `verify_installation.py`     | ✅ Verificador | Testar instalação       |
| `SCREENSHOT_AUTO_README.md`  | 📖 Manual      | Guia de uso             |
| `SCREENSHOT_AUTO_GUIDE.md`   | 📚 Guia        | Exemplos e tutoriais    |

---

## 🐛 Troubleshooting Rápido

| Problema                | Solução                                 |
| ----------------------- | --------------------------------------- |
| "pywin32 não instalado" | `pip install pywin32`                   |
| Cliques não funcionam   | Execute terminal como **administrador** |
| Screenshot vazio        | Maximize a janela do navegador          |
| Nada acontece           | Verifique se é navegador suportado      |
| Script travado          | Pressione `Ctrl+C`                      |
| Múltiplas capturas      | Aumente `DEBOUNCE_MS` para 300+         |

---

## ✅ Navegadores Suportados

- ✅ Chrome
- ✅ Microsoft Edge
- ✅ Brave
- ✅ Firefox

---

## 📊 Saída dos Screenshots

Formato: `<titulo_sanitizado>_<YYYY-MM-DD_HH-MM-SS>.png`

Exemplo:

```
google_login_2025-12-17_14-30-45.png
h2maps_dashboard_2025-12-17_14-31-12.png
facebook_feed_2025-12-17_14-32-03.png
```

---

## 🎮 Como Usar

1. **Abra um navegador**
2. **Execute:** `python screenshot_windows_auto.py`
3. **Clique com botão esquerdo** em qualquer lugar
4. **Arquivo salvo** em `./prints/`

---

## 📞 Comandos Úteis

```bash
# Verificar instalação
python verify_installation.py

# Executar com logs
python screenshot_windows_auto.py > log.txt 2>&1

# Reinstalar tudo
pip install --force-reinstall pynput mss pillow pywin32

# Listar navegadores instalados (debug)
where chrome.exe  # ou msedge.exe, brave.exe, firefox.exe
```

---

## 🔧 Customizações Comuns

### Capturar só de um projeto

```python
TITLE_FILTER = "Meu Projeto"
OUTPUT_DIR = "./meu_projeto/screenshots"
```

### Testes automatizados

```python
BROWSER_FILTER = "chrome"
DEBOUNCE_MS = 200
OUTPUT_DIR = "./tests/screenshots"
```

### Monitoramento (capturas a cada 5s)

```python
DEBOUNCE_MS = 5000
OUTPUT_DIR = "./monitoring"
```

---

## 📝 Template de Configuração

```python
# Copie e cole em screenshot_windows_auto.py (linhas ~47-56)

# Pasta de saída
OUTPUT_DIR = "./prints"

# Filtro de navegador (None = todos)
# Opções: "chrome", "edge", "firefox", "brave", None
BROWSER_FILTER = None

# Filtro de título (None = sem filtro)
TITLE_FILTER = None

# Debounce em ms
DEBOUNCE_MS = 150
```

---

## ⚙️ Dependências

```bash
# Todas as dependências necessárias
pip install pynput mss pillow pywin32
```

---

## 🎓 Recursos Adicionais

- **Manual completo:** `SCREENSHOT_AUTO_README.md`
- **Exemplos práticos:** `SCREENSHOT_AUTO_GUIDE.md`
- **Checklist instalação:** `INSTALL_SUMMARY.md`
- **Especificações:** `DELIVERABLES.md`

---

## 🚀 Quick Links

```
📖 Precisa de ajuda?
   → Leia: SCREENSHOT_AUTO_README.md

📚 Quer exemplos?
   → Veja: SCREENSHOT_AUTO_GUIDE.md

❓ Algo não funciona?
   → Procure em: SCREENSHOT_AUTO_GUIDE.md → Troubleshooting

🔧 Quer customizar?
   → Edite: config_screenshot.py (linhas ~1-80)

✅ Quer verificar instalação?
   → Execute: python verify_installation.py
```

---

## 💡 Dicas Pro

1. ✅ Sempre execute como **administrador**
2. ✅ Maximize janelas antes de clicar
3. ✅ Use **TITLE_FILTER** para capturar só páginas específicas
4. ✅ Configure **OUTPUT_DIR** por projeto
5. ✅ Aumente **DEBOUNCE_MS** para evitar duplicatas

---

## 🎉 Pronto!

Execute este comando e comece agora:

```bash
python screenshot_windows_auto.py
```

**Boa sorte! 🚀**

---

_Última atualização: 2025-12-17_
