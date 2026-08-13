# 🏡 Homolog — Criador de Passos de Teste

> Autor: **Felipe Rodrigues**
> Repositório: https://github.com/Feliperodbar/homolog1

Ferramenta para criação de passos de teste, captura de screenshots e geração de evidências em HTML e DOCX. O projeto foi reorganizado em **monorepo** para separar claramente o painel web, a futura extensão Chrome/Edge (MV3) e o código compartilhado.

---

## ✨ Recursos

- **Captura de tela em tempo real** via `getDisplayMedia` (modo legado painel web)
- **Adicionar passos** com screenshots anotadas, seta de destaque e metadados
- **Exportação em múltiplos formatos**: HTML e DOCX (com imagens embutidas e redimensionamento)
- **Persistência local** via `localStorage` com suporte a importação/exportação futura
- **Interface responsiva** com tema escuro moderno, carrossel de passos e visualização ampliada
- **OCR opcional** (Tesseract.js) para sugerir labels a partir de texto próximo ao clique
- **Destaque visual** de cliques/pontos na tela capturada + seleção de área com drag
- **Modo extensão Chrome/Edge (Manifest V3)**: **MVP implementado** — controle completo de sessão de gravação (Iniciar / Pausar / Continuar / Finalizar), indicador visual, contador de passos, persistência em `chrome.storage`, detecção de páginas bloqueadas com mensagem amigável. Integração com o painel via botão no popup. A captura automática de screenshots a cada clique chega na próxima fase.

---

## 🏗️ Estrutura do Projeto

```
homolog1/
├── extension/                 # Extensão Chrome/Edge MV3 (MVP funcional: controle de sessão)
│   ├── manifest.json          # Manifest V3 com permissões mínimas (storage, activeTab, scripting, tabs)
│   ├── icons/                 # Ícones SVG provisórios (16, 32, 48, 128 px)
│   ├── scripts/build.mjs      # Build pipeline esbuild (bundle + copia assets para dist/)
│   ├── package.json
│   └── src/
│       ├── shared/            # Código puro compartilhado (state machine, types, uuid, restricted URLs)
│       ├── background/        # Service Worker MV3 (storage, badge, broadcast de estado, handlers de transição)
│       ├── content/           # Content script (detecta páginas restritas chrome://, lojas, etc. + banner amigável)
│       └── popup/             # Popup UI da extensão (HTML/CSS/TS com 5 botões, contador, badge, status pill)
│
├── web/                       # Painel web principal (dashboard 100% funcional)
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   ├── public/                # Assets estáticos (ícones, imagens do header)
│   └── src/
│       ├── main.ts            # Entry point, orquestrador (antigo app.js)
│       ├── styles/index.css   # Folha de estilos
│       ├── types/             # Declarações globais (Tesseract, etc.)
│       └── core/modules/      # Módulos: storage, ui, capture, steps, ocr, export, backend
│
├── shared/                    # Pacote de tipos, constantes e utils compartilhados
│   ├── package.json
│   └── src/
│       ├── types/
│       ├── constants.ts
│       ├── utils.ts
│       └── index.ts
│
├── tests/                     # Configuração global do Vitest + testes de integração
│
├── legacy/                    # Componentes Python legados (Flask + screenshot auto)
│   ├── README_LEGACY.md
│   ├── server/                # Backend Flask (trigger polling)
│   └── scripts/               # Scripts Python: screenshot Windows, cross-platform, hotkeys
│
├── docs/                      # Documentação técnica da fase anterior
│   ├── ARCHITECTURE.md
│   ├── DELIVERABLES.md
│   ├── DEPLOY_NETLIFY.md
│   ├── QUICK_REFERENCE.md
│   ├── SCREENSHOT_AUTO_GUIDE.md
│   ├── SCREENSHOT_AUTO_README.md
│   └── ...
│
├── package.json               # Workspace root (scripts globais, devDeps globais)
├── tsconfig.base.json         # Config TS compartilhada (strict, paths dos workspaces)
├── .eslintrc.cjs              # ESLint (TS + import order + prettier compat)
├── .prettierrc                # Prettier
├── vitest.config.ts           # Vitest (jsdom, setup global)
├── vercel.json                # Deploy Vercel (aponta para web/dist)
├── netlify.toml               # Deploy Netlify (aponta para web/dist)
└── README.md                  # Este arquivo
```

---

## 🚀 Quick Start

### Pré-requisitos

- **Node.js ≥ 20 LTS** (recomendado 20+; Vite 5 requer Node 18+, TS 5 exige versões recentes)
- **npm ≥ 9** (suporte nativo a workspaces)
- **Python 3.8+** — _opcional_, apenas se for usar os componentes legados em `legacy/`

### Instalação

```bash
git clone https://github.com/Feliperodbar/homolog1.git
cd homolog1
npm install
```

O npm instala automaticamente as dependências dos workspaces `web`, `extension` e `shared`.

### Desenvolvimento Local

```bash
# Painel web (http://localhost:5173)
npm run dev:web

# Build do pacote compartilhado (rodado automaticamente antes do build:web)
npm run build:shared

# Build da extensao (placeholders por enquanto)
npm run build:ext
```

**Backend legado Flask (opcional, para trigger polling):**

```bash
cd legacy/server
pip install -r requirements.txt
python server.py   # http://localhost:8010  /health
```

### Build para Produção

```bash
# Build completo = shared + web
npm run build
# Saida em web/dist/ (pronto para deploy estatico)

# Apenas o painel web
npm run build:web

# Apenas a extensao (gera bundle em extension/dist/ — pasta carregavel no Chrome/Edge)
npm run build:ext
```

---

## 🎛️ Scripts Disponíveis (workspace root)

| Script                 | Descrição                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev:web`      | Inicia Vite dev server do painel web                                                 |
| `npm run build`        | Build completo `shared` → `web`                                                      |
| `npm run build:web`    | Build apenas do painel web                                                           |
| `npm run build:ext`    | Build extensão Chrome/Edge (esbuild) → `extension/dist/` (pasta carregável unpacked) |
| `npm run build:shared` | Build do pacote compartilhado                                                        |
| `npm run preview:web`  | Preview local do build do painel (porta 4173)                                        |
| `npm run lint`         | ESLint em web, extension, shared                                                     |
| `npm run lint:fix`     | ESLint com `--fix`                                                                   |
| `npm run format`       | Prettier format em todo monorepo                                                     |
| `npm run format:check` | Verifica formatação Prettier                                                         |
| `npm run typecheck`    | `tsc --noEmit` no painel web                                                         |
| `npm run test`         | Vitest (run mode)                                                                    |
| `npm run test:watch`   | Vitest em watch mode                                                                 |

---

## 🛠️ Stack Técnica

### Workspace `@homolog/web` (painel)

- **Vite 5** com `vite-tsconfig-paths` (resolução de paths do tsconfig)
- **TypeScript 5** (strict mode com `noImplicitAny: false` — compatibilidade temporária com código legado)
- **docx@8.5.0** — geração DOCX nativa em ESM
- **Tesseract.js@4.0.2** — OCR via CDN (carregado em `index.html`)

### Workspace `@homolog/extension` (extensão MV3)

- **Manifest V3** estrito: permissões mínimas (`storage`, `activeTab`, `scripting`, `tabs`) — sem host_permissions amplas, sem permissões opcionais desnecessárias
- **esbuild 0.21** como bundler (rápido, sem runtime extra, gera bundles ESM para service worker/popup e IIFE para content script)
- **@types/chrome** — tipagens completas do Chrome/Edge Extension API
- **Máquina de estados pura (FSM)** em `src/shared/stateMachine.ts` — 100% testável, 53 testes unitários passando, separada totalmente de `chrome.*`
- **Service Worker MV3**: gerencia storage, badge dinâmico do ícone, handlers de transição de estado e broadcast via `runtime.sendMessage` + `storage.onChanged`
- **Content script**: detecta páginas restritas (`chrome://`, `edge://`, `about:`, Chrome/Edge Web Store, páginas internas) e exibe banner amigável em posição fixa
- **Popup UI completo**: 5 controles (Iniciar/Pausar/Continuar/Finalizar/Nova sessão), pill de estado com animação de pulso quando gravando, badge de passos, ID sessão truncado, data formatada pt-BR, botão Painel ↗, tratamento de erro inline

### Workspace `@homolog/shared` (código comum)

- Pacote ESM puro com declarações `.d.ts` geradas
- Tipos: `StepV1`, `ProjectData`, `HighlightConfig`, `BlobRef`, `Point2D`...
- Constantes de storage, exportação, OCR
- Utils: `sanitizeFilename`, `escapeHtml`, `cmToEmu/Twip`, `clamp`, `buildId`

### Qualidade

- **ESLint 8** + `@typescript-eslint` + `eslint-plugin-import` + `eslint-config-prettier`
- **Prettier 3**
- **Vitest 1** com `jsdom` + setup global (`matchMedia`, `localStorage` mock)

---

## 🧩 Funcionamento Atual do Painel (Modo Legado de Captura)

O painel web (`web/`) continua funcionando exatamente como na versão anterior, usando o navegador para capturar a tela:

1. **Iniciar Captura** → `getDisplayMedia()` abre o seletor de tela do sistema.
2. **Clique sobre o vídeo** ou botão **Adicionar passo** → gera um passo com screenshot.
3. **Destaque visual**: seta vermelha + círculo no ponto clicado, ou seleção de área retangular.
4. **OCR (opcional)**: Tesseract.js extrai texto perto do clique para sugerir um label automático.
5. **Dados do Projeto**: campos de projeto salvos em `localStorage` separadamente.
6. **Exportação HTML/DOCX**: botões no header geram download do relatório completo com imagens embutidas.

> Essa forma de captura permanece como **modo legado** para casos onde a extensão não pode ser instalada.

---

## 🧩 Extensão Chrome/Edge (MV3) — Homolog Recorder (MVP)

Nesta versão, a extensão já permite **gerenciar sessões completas de gravação** com persistência real, indicadores visuais e integração básica com o painel. A **captura automática de screenshots a cada clique** será implementada na próxima fase.

### Funcionalidades já entregues (MVP)

- **7 estados e transições da sessão**: `idle` (Pronto) → `START` → `recording` (Gravando) → `PAUSE` → `paused` (Pausado) → `RESUME` → `recording` → `FINALIZE` → `finalized` (Finalizado) → `RESET` → `idle`. Incremento de passos durante gravação (`INCREMENT_STEP`).
- **Persistência em `chrome.storage.local`**: armazena apenas `sessionId` (UUID v4), `state` (estado), `tabId` (aba gravada), `stepCount` (qtde passos), `startedAt` (data início), timestamps auxiliares de pausa/fim/atualização. Fecha e reabre o popup com o mesmo estado.
- **Badge dinâmico no ícone da extensão**:
  - Gravando → mostra contador de passos com fundo vermelho
  - Pausado → mostra `II` (laranja)
  - Finalizado → mostra `OK` (azul)
  - Pronto → sem badge
- **Popup completo (360 px)**:
  - Nome `Homolog Recorder` com ícone 🎬 + subtítulo `Controle de sessão de gravação`
  - Botão **Painel ↗** abre o Homolog Web numa nova aba
  - Card de status: pill animado (pulse vermelho em gravação), badge de passos monospace, sessão ID truncado (tooltip com ID completo), data de início formatada pt-BR, informativo da aba gravada
  - 4 controles principais: **Iniciar gravação** (primário azul), **Pausar** / **Continuar** (secundários, 2 colunas), **Finalizar sessão** (terciário indigo)
  - Ação secundária: **Iniciar nova sessão** (link com confirmação)
  - Banner vermelho quando a aba atual é restrita (chrome://, lojas)
  - Caixa de erro inline em caso de falhas
- **Limitações amigáveis**: content script detecta automaticamente páginas bloqueadas (`chrome://`, `edge://`, `about:`, `view-source:`, Chrome Web Store, Microsoft Edge Add-ons, Firefox Add-ons, Opera/Chromium Add-ons) e exibe um banner no topo com explicação clara e botão de fechar. O popup também mostra o banner vermelho quando aberto nessas páginas.
- **Permissões MV3 enxutas**: somente `storage` (persistência), `activeTab` (contexto da aba ao clicar na ação), `scripting` (injeta content script programaticamente se necessário), `tabs` (ler URL/title da aba atual para detectar páginas restritas). **Nenhuma permissão ampla (`<all_urls>` em host_permissions), debugger, downloads, desktopCapture, offscreen** foi solicitada.

### Como instalar a extensão em Modo Desenvolvedor

> **Compatível**: Google Chrome (desktop), Microsoft Edge (desktop), Brave, Opera, Vivaldi e qualquer navegador baseado em Chromium versão ≥ 114.

1. **Faça o build da extensão**:

   ```bash
   cd homolog1
   npm install
   npm run build:ext
   ```

   A pasta pronta para carregar será gerada em `extension/dist/`.

2. **Abra a página de extensões do navegador**:
   - **Microsoft Edge**: digite `edge://extensions` na barra de endereços
   - **Google Chrome**: digite `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Opera**: `opera://extensions`

3. **Ative o Modo Desenvolvedor**:
   - No Edge: toggle **Modo de Desenvolvedor** no canto superior esquerdo
   - No Chrome: toggle **Modo do desenvolvedor** no canto superior direito

4. **Carregue a extensão sem compactação (unpacked)**:
   - Clique no botão **Carregar sem compactação** (Edge) ou **Carregar extensão expandida** (Chrome)
   - Navegue até a pasta `extension/dist/` **dentro do projeto** e selecione-a (não selecione a pasta `extension/` raiz, pois ela contém apenas arquivos fonte; o runtime precisa da pasta `dist/` com os `.js` bundlados, `manifest.json`, `icons/` e `popup/`)
   - Confirme. O ícone 🎬 **Homolog Recorder** deve aparecer na barra de ferramentas.

5. **Teste o fluxo completo**:
   1. Abra qualquer site público (ex: `https://example.com`) — não use chrome:// ou a loja
   2. Clique no ícone da extensão → abre o popup mostrando **Pronto**, passos = 0, sessão nova
   3. Clique em **Iniciar gravação**: pill fica **Gravando** com animação de pulso vermelha; badge do ícone mostra `0`; aba atual fica registrada
   4. Clique em **Pausar**: pill fica **Pausado** (amarelo); badge mostra `II`
   5. Clique em **Continuar**: volta a **Gravando**
   6. **Finalizar sessão**: pill fica **Finalizado** azul; badge mostra `OK`; todos os botões principais ficam desativados exceto **Iniciar nova sessão**
   7. Feche o popup completamente, abra novamente → o estado **Finalizado** é preservado
   8. Clique em **Iniciar nova sessão** (confirmação) → volta para **Pronto**, novo UUID, zerado
   9. Agora teste **Abrir painel ↗** — abre o repositório do Homolog numa aba nova (na próxima fase, esta URL será o painel Web rodando localmente e haverá sincronia bidirecional de passos)
   10. Teste páginas restritas: vá para `edge://extensions` ou `chrome://settings` e abra o popup — aparece o banner vermelho "⚠️ Não disponível aqui" explicando o motivo; o content script também injeta o banner no topo da própria página.

### Desenvolvendo a extensão (watch mode)

Durante iterações, use o watch mode para rebuild automático em mudanças:

```bash
npm run dev:ext
```

A cada edição dos `.ts` em `extension/src/`, o esbuild regenera os bundles em `extension/dist/`. Basta voltar à página `edge://extensions`, clicar no botão 🔄 **Recarregar** do cartão da extensão Homolog Recorder e reabrir o popup.

---

## 🐳 Deploy Estático

### Vercel

Configuração em [vercel.json](file:///c:/Users/feeli/OneDrive/Desktop/Documentos,%20projetos%20etc/homolog1/vercel.json):

- Build: `npm run build:web`
- Output: `web/dist`

### Netlify

Configuração em [netlify.toml](file:///c:/Users/feeli/OneDrive/Desktop/Documentos,%20projetos%20etc/homolog1/netlify.toml):

- Build: `npm run build:web`
- Publish: `web/dist`
- Redirecionamento SPA para `index.html`

> **Nota:** Em deploy estático (Vercel/Netlify) o backend Flask não é executado. O polling de trigger a cada 1s retorna `failed to fetch` silenciosamente (o painel já tolera isto). Pode ser desativado comentando `startTriggerPolling()` em `web/src/main.ts`.

---

## 📁 Componentes Legados Python (Flask + captura OS-level)

Ver [legacy/README_LEGACY.md](file:///c:/Users/feeli/OneDrive/Desktop/Documentos,%20projetos%20etc/homolog1/legacy/README_LEGACY.md) para instruções de uso do backend Flask e dos scripts de screenshot automático.

---

## 🚧 Próximos Passos (roadmap)

| Marco                   | Descrição                                                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fase 1 (concluída)**  | Reorganização em monorepo (web, extension, shared, tests, legacy, docs) + build Vite painel + lint/Prettier/Vitest                                                                                                                                                                       |
| **Fase 2a (concluída)** | **MVP extensão Homolog Recorder (MV3)**: manifest V3 enxuto, service worker com storage/badge/broadcast, content script detector de páginas restritas + banner, popup completo com 5 controles e indicadores, FSM pura com 53 testes, build esbuild                                      |
| **Fase 2b (próxima)**   | Implementação da **captura automática por clique** na extensão: content script detecta cliques do usuário na página → background tira screenshot via `chrome.tabs.captureVisibleTab` → passo criado automaticamente e refletido no painel via storage.onChanged + sincronia bidirecional |
| **Fase 3**              | Migrar blobs de screenshots de `localStorage` → IndexedDB (resolver limite de ~5 MB). Implementar `@homolog/shared/blob-repository` com interface reutilizável.                                                                                                                          |
| **Fase 4**              | OCR no offscreen document, seleção de área via content script, atalhos globais, opções avançadas, sincronia projeto/metadados com o painel web.                                                                                                                                          |
| **Fase 5**              | Remoção gradual de componentes legados Python conforme a extensão cobre 100% dos casos. Publicar na Chrome Web Store e Microsoft Edge Add-ons.                                                                                                                                           |

---

## ⚖️ Licença

Autor: **Felipe Rodrigues** — https://github.com/Feliperodbar
