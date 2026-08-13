# 🖼️ Automação de Screenshot para Navegadores - Windows

Script Python que captura screenshots de navegadores ao clicar com o botão esquerdo do mouse.

## ✨ Características

- ✅ Escuta global de mouse (funciona em background)
- ✅ Detecta automaticamente navegadores: Chrome, Edge, Brave, Firefox
- ✅ Captura a janela ativa ou o monitor inteiro (incluindo barra do Windows com data/hora)
- ✅ Salva em PNG com nome sanitizado + timestamp
- ✅ Debounce para evitar múltiplas capturas rápidas
- ✅ Tratamento robusto de erros
- ✅ Filtros opcionais (navegador específico, título)

## 📋 Requisitos

- **Windows** (7, 10, 11 ou superior)
- **Python 3.8+**
- Permissões de administrador (recomendado para funcionar globalmente)

## 🚀 Instalação

### 1. Instalar dependências

```bash
pip install pynput mss pillow pywin32
```

### 2. Preparar (primeira execução)

Se esta for a primeira vez usando `pywin32`:

```bash
python -m pip install --upgrade pywin32
python Scripts/pywin32_postinstall.py -install
```

Ou execute como administrador:

```bash
python -m pywin32_postinstall -install
```

## 🎯 Uso Básico

```bash
python screenshot_windows_auto.py
```

O script aguardará cliques do mouse esquerdo. Quando clicar em uma janela de navegador, capturará automaticamente.

### Exemplos de Uso

**Capturar só Chrome:**

```python
BROWSER_FILTER = "chrome"
```

**Capturar só do Edge:**

```python
BROWSER_FILTER = "edge"
```

**Capturar só quando título contém "H2Maps":**

```python
TITLE_FILTER = "H2Maps"
```

**Aumentar debounce para 300ms:**

```python
DEBOUNCE_MS = 300
```

## ⚙️ Configurações

Edite o arquivo `screenshot_windows_auto.py` e modifique as constantes no topo:

```python
# Diretório onde salvar screenshots
OUTPUT_DIR = "./prints"

# Filtrar por navegador específico (None = todos)
# Opções: None, "chrome", "firefox", "edge", "brave"
BROWSER_FILTER = None

# Filtrar por parte do título da janela (None = sem filtro)
# Ex: "H2Maps" captura só se o título contém essa string
TITLE_FILTER = None

# Tempo mínimo entre capturas (milissegundos)
DEBOUNCE_MS = 150

# Incluir barra do Windows (data/hora) capturando monitor inteiro
INCLUDE_WINDOWS_TASKBAR = True
```

## 🎮 Como Usar

### Atalhos Disponíveis

| Ação                  | Resultado                           |
| --------------------- | ----------------------------------- |
| **Clique Esquerdo**   | Captura a janela do navegador ativo |
| **Ctrl+C** (Terminal) | Encerra o script                    |

### Fluxo de Uso

1. Execute o script em uma janela de terminal
2. O terminal exibirá: `🎯 Listener iniciado. Aguardando cliques...`
3. Clique com botão esquerdo em uma janela de navegador
4. O screenshot será salvo em `./prints/`
5. No terminal, verá mensagem de sucesso com detalhes

### Exemplos de Saída

✅ **Captura com Sucesso:**

```
✅ Screenshot capturado: google_login_2025-12-17_14-30-45.png
   Navegador: Chrome | Tamanho: 1920x1080 | Título: Google Login - Google Chrome
```

❌ **Erro (janela não é navegador):**

```
(sem mensagem - captura ignorada silenciosamente)
```

## 📁 Estrutura de Arquivos Salvos

```
./prints/
├── google_login_2025-12-17_14-30-45.png
├── h2maps_interface_2025-12-17_14-31-12.png
├── facebook_feed_2025-12-17_14-32-03.png
└── ...
```

**Formato do nome:**

- `<titulo_sanitizado>_<YYYY-MM-DD_HH-MM-SS>.png`
- Exemplo: `My_Cool_Page_2025-12-17_14-30-45.png`

## 🔍 Navegadores Suportados

| Navegador      | Status | Detecção                                          |
| -------------- | ------ | ------------------------------------------------- |
| Chrome         | ✅     | Classe: `Chrome_WidgetWin_1` / Exe: `chrome.exe`  |
| Microsoft Edge | ✅     | Classe: `Chrome_WidgetWin_1` / Exe: `msedge.exe`  |
| Brave          | ✅     | Classe: `Chrome_WidgetWin_1` / Exe: `brave.exe`   |
| Firefox        | ✅     | Classe: `MozillaWindowClass` / Exe: `firefox.exe` |
| Opera          | ⚠️     | Pode funcionar (usa Chromium)                     |
| Safari         | ❌     | Não suportado no Windows                          |

## 🛡️ Permissões e Segurança

- O script **NÃO** transmite ou modifica dados
- Salva arquivos **LOCALMENTE** apenas
- Funciona melhor com **permissões de administrador**
- Pode ser executado em tela cheia sem interrupção

## 🔧 Troubleshooting

### Problema: "Erro: pywin32 não instalado"

**Solução:**

```bash
pip install pywin32
python -m pywin32_postinstall -install
```

### Problema: Cliques não funcionam globalmente

**Solução:** Execute o terminal como administrador

### Problema: Captura vazia ou preta

**Solução:**

- Aguarde o navegador carregar completamente
- Verifique se a janela tem dimensões válidas
- Tente novamente

### Problema: "Dimensões inválidas da janela"

**Motivo:** Janela minimizada ou com tamanho inválido
**Solução:** Restaure/maximize a janela antes de clicar

### Problema: Script congelado ou não responde

**Solução:** Pressione `Ctrl+C` para encerrar

## 📊 Opções Avançadas

### Combinar Filtros

```python
# Capturar só Chrome com "H2Maps" no título
BROWSER_FILTER = "chrome"
TITLE_FILTER = "H2Maps"
```

### Alterar Diretório de Saída

```python
OUTPUT_DIR = "C:\\Users\\SeuUsuário\\Desktop\\Screenshots"
```

### Aumentar Debounce (para evitar capturas múltiplas)

```python
DEBOUNCE_MS = 500  # 500ms entre capturas
```

## 📝 Logs e Mensagens

O script exibe informações em tempo real:

- `✅ Screenshot capturado` - Sucesso
- `⚠️ Erro ao...` - Aviso/erro tratado
- `❌ Erro fatal` - Erro que interrompe o script
- `🎯 Listener iniciado` - Script pronto
- `🛑 Parando listeners` - Encerrando

## 🐛 Debug

Para entender o que está acontecendo, adicione ao script:

```python
# Antes de: self.listener.start()
print(f"🔍 DEBUG: hwnd={hwnd}, título='{title}', classe='{win_class}'")
print(f"🔍 DEBUG: É navegador? {is_browser}, Tipo: {nav_type}")
```

## 🎓 Exemplos de Uso

### Capturar screenshots de testes em Edge

```python
BROWSER_FILTER = "edge"
TITLE_FILTER = "H2Maps"
OUTPUT_DIR = "./screenshots_h2maps"
```

### Capturar de qualquer navegador, máximo 10s entre capturas

```python
BROWSER_FILTER = None  # Todos
DEBOUNCE_MS = 10000  # 10 segundos
```

### Capturar com nome customizado

Modifique a função `_sanitize_filename()` conforme necessário.

## ⚖️ Licença

Script fornecido como está. Uso livre para fins pessoais e comerciais.

## 🤝 Suporte

Se encontrar problemas:

1. Verifique se o navegador é suportado
2. Confirme que está usando Python 3.8+
3. Reinstale as dependências: `pip install --force-reinstall pynput mss pillow pywin32`
4. Execute como administrador
5. Verifique os logs no terminal

## 📌 Notas Importantes

- ⚡ O script usa listeners globais (event hooks), funcionando em background
- 🔒 Todos os dados permanecem locais na sua máquina
- 🖥️ Compatível com telas múltiplas (mss detecta automaticamente)
- 💾 Screenshots são salvos em PNG de alta qualidade
- 🚀 Performance: negligenciável (< 1% CPU quando ocioso)

---

**Versão:** 1.0  
**Data:** 2025-12-17  
**Compatibilidade:** Windows 7+, Python 3.8+
