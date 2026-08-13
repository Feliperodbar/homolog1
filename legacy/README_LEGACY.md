# Componentes Legados — Homolog

Esta pasta contém componentes Python desenvolvidos em fases anteriores do Homolog.
Eles **não são obrigatórios** para o funcionamento do painel web e da extensão Chrome/Edge.

A arquitetura nova (monorepo com `web/` + `extension/` + `shared/`) substitui
gradualmente estas funcionalidades por APIs nativas do navegador.

---

## Estrutura

```
legacy/
├── server/
│   ├── server.py              # Servidor Flask (endpoint /trigger-add-step, polling)
│   └── requirements.txt       # Dependencias do Flask
└── scripts/
    ├── screenshot_windows_auto.py    # Captura screenshots automaticas Windows via pynput + pywin32
    ├── screenshot_cross_platform.py  # Captura cross-plataforma (Linux/macOS/Windows) sem pywin32
    ├── hotkey_helper.py              # Envia POST /trigger-add-step ao Flask via clique direito
    ├── config_screenshot.py          # Template de configuracao (opcional)
    ├── verify_installation.py        # Verifica instalacao de dependencias Python
    ├── install_dependencies.bat      # Windows: instala deps Python
    ├── install_dependencies.sh       # macOS/Linux: instala deps Python
    └── run_screenshot_auto.bat       # Atalho Windows para screenshot auto
```

---

## Quando usar cada componente

| Componente | Objetivo original | Mantido? |
|---|---|---|
| `server/server.py` | Expor endpoints de polling de trigger para integrar com clique-destro via helper. | Sim, mas legado. A extensao MV3 substitui no longo prazo. |
| `hotkey_helper.py` | Acionar criacao de passo via clique direito do mouse. | Sim. Alternativa OS-level sem extensao. |
| `screenshot_windows_auto.py` | Salvar PNGs em `./prints/` a cada clique em navegador Windows. | Sim. Util para workflow "fora do navegador". |
| `screenshot_cross_platform.py` | O mesmo que o anterior, cross-platform. | Sim. |
| `config_screenshot.py` | Config template. | Nao importado atualmente por nenhum script; serve como referencia. |
| `verify_installation.py` | Diagnostico. | Sim. |

---

## Rodando o backend Flask legado

```bash
cd legacy/server
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
python server.py
# Servidor em http://localhost:8010  (health em http://localhost:8010/health)
```

O painel web continua fazendo polling em `/trigger-state` de 1 em 1 segundo.
Desative esse comportamento em `web/src/main.ts` (funcao `startTriggerPolling`) se
o backend Flask nao estiver em uso (ex: deploy estatico na Vercel/Netlify).

---

## Rodando screenshot_windows_auto.py

```bash
cd legacy/scripts
# Criar venv e instalar:
pip install pynput mss pillow pywin32
python screenshot_windows_auto.py
```

---

## Roadmap de descontinuidade

| Marco | Acao |
|---|---|
| Fase 1 (atual) | Mantidos como legado, documentados nesta pasta. |
| Fase 2 | Extensao MV3 prover captura por clique → scripts screenshot_*_auto.py entram em maintenance. |
| Fase 3 | Extensao prover hotkeys + webhooks → `server.py` e `hotkey_helper.py` podem ser removidos. |
