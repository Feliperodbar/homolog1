# Homolog

Ferramenta de Felipe Rodrigues para criar passos de teste, registrar interações e gerar evidências em HTML e DOCX.

## Estrutura

```text
extension/  Extensão Chrome/Edge Manifest V3
web/        Painel web e captura manual legada via getDisplayMedia
shared/     Tipos, constantes e utilitários comuns
tests/      Testes Vitest
legacy/     Flask e scripts Python preservados
```

O painel continua independente da extensão. O diretório `legacy/` não participa do build principal e foi preservado para compatibilidade; consulte [legacy/README_LEGACY.md](legacy/README_LEGACY.md).

## Requisitos e instalação

- Node.js 20 ou superior
- npm 9 ou superior
- Python 3.8 ou superior somente para os componentes legados

```bash
npm ci
npm run dev:web
```

O painel estará em `http://localhost:5173`.

Mantenha esse comando em execução ao usar o botão **Painel** da extensão. O botão abre
`http://localhost:5173/`; se o painel não estiver sendo executado, o navegador exibirá
uma mensagem de conexão recusada.

## Scripts

| Comando | Finalidade |
| --- | --- |
| `npm run dev:web` | Executa o painel |
| `npm run build:web` | Gera `web/dist` |
| `npm run dev:ext` | Recompila a extensão durante o desenvolvimento |
| `npm run build:ext` | Gera `extension/dist` |
| `npm run build` | Gera shared, painel e extensão |
| `npm run lint` | Executa ESLint |
| `npm run format:check` | Valida Prettier |
| `npm test` | Executa Vitest |
| `npm run typecheck` | Verifica painel e extensão |

## Painel web

O modo web legado usa `getDisplayMedia`, desenha o frame em canvas e mantém os passos no `localStorage`. A exportação HTML/DOCX foi preservada. Screenshots em base64 consomem rapidamente a cota do navegador; para sessões maiores, a arquitetura recomendada é manter imagens em IndexedDB como `Blob` e guardar somente referências no modelo do passo.

## Extensão Chrome/Edge

A extensão MV3 oferece:

- início, pausa, retomada e finalização de sessões;
- UUID, aba, contador e data de início persistidos;
- detecção de `pointerdown` em captura;
- metadados, nome acessível e seletor estável;
- proteção de campos sensíveis e deduplicação;
- mensagem amigável em páginas não suportadas;
- visualização dos passos recentes no popup;
- armazenamento estruturado em IndexedDB.

O repositório recebido já inclui captura da aba por interação. A implementação captura somente a aba ativa da janela à qual a sessão pertence e falha de forma explícita se o usuário trocar de aba.

### Instalação em modo de desenvolvedor

```bash
npm ci
npm run build:ext
```

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Ative o modo de desenvolvedor.
3. Escolha “Carregar sem compactação”.
4. Selecione `extension/dist`.

### Permissões

- `storage`: estado e dados locais;
- `activeTab`: acesso iniciado pelo clique no ícone;
- `scripting`: reinjeção controlada do content script;
- `tabs`: identificação da aba e da janela gravadas;
- `<all_urls>`: necessário para continuar detectando interações após navegações em sites comuns.

O acesso amplo a hosts é uma decisão funcional importante. Uma futura publicação pode migrá-lo para `optional_host_permissions`, pedindo consentimento por site. Páginas internas e lojas de extensões continuam bloqueadas pelo navegador.

## Dados e privacidade

O conteúdo é local e não há autenticação, PostgreSQL ou backend novo. Mesmo assim, screenshots, URLs e texto visível podem conter dados pessoais. A extensão não registra valores de senha, reduz texto de campos sensíveis, rejeita eventos artificiais quando possível e valida mensagens. Antes de uso corporativo, recomenda-se política de retenção, exclusão por sessão, consentimento claro e revisão de permissões.

## Legado Flask/Python

`legacy/server` contém um servidor Flask de polling e `legacy/scripts` contém captura no sistema operacional e atalhos. Eles são opcionais, não são iniciados pelo painel estático e não devem ser expostos à rede sem autenticação, limitação de origem e revisão de segurança.

## Modelo de dados recomendado

```text
Project
  └─ RecordingSession
       └─ RecordingStep
            ├─ InteractionMetadata
            └─ screenshotId -> Blob (IndexedDB)
```

`chrome.storage` deve permanecer reservado ao estado pequeno da sessão. Imagens devem ficar no IndexedDB.

## Próximas etapas

1. concluir a tipagem estrita do painel legado;
2. integrar os passos da extensão ao painel por um contrato explícito;
3. substituir a permissão obrigatória de hosts por consentimento opcional, se compatível com o produto;
4. adicionar testes reais no Chrome/Edge para navegação, troca de aba e páginas bloqueadas;
5. revisar dependências e vulnerabilidades reportadas pelo `npm audit` sem aplicar atualizações destrutivas automaticamente.
