# Deploy no Netlify

Este projeto é um site estático (HTML/CSS/JS). Exporta o conteúdo em HTML diretamente no navegador. Não há backend necessário.

## Opção A — Deploy rápido (Drag & Drop)

1. Acesse https://app.netlify.com/ e faça login.
2. Clique em "Add new site" → "Deploy manually".
3. Arraste e solte a pasta do projeto (`Homolog`) contendo `index.html`, `app.js`, `styles.css`, `assets/`.
4. Ao publicar, a URL do site será gerada automaticamente.

## Opção B — Deploy com CLI

1. Instale Node.js e o Netlify CLI:
   - `npm i -g netlify-cli`
2. No diretório do projeto, execute:
   - `netlify login`
   - `netlify init` (crie ou escolha o site)
   - `netlify deploy --prod --dir .`

O site estará disponível em uma URL como `https://seu-site.netlify.app/`.

## Testes após o deploy

- Acesse a URL do Netlify do seu site.
- Verifique se:
  - A coluna de captura está maior (`3fr 1fr`).
  - O botão "Expandir captura" entra e sai de tela cheia.
  - Clicar nas miniaturas abre o modal de imagem.
  - A interface opera inteiramente no navegador (captura, passos e logs) sem botões de exportação.

## Dicas

- Projeto 100% estático; nenhuma configuração adicional é necessária.
