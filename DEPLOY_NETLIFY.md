# Deploy no Netlify

Este projeto é um site estático (HTML/CSS/JS). A exportação de DOCX funciona de duas formas:

- Cliente (fallback): via biblioteca `docx` carregada por CDN (já configurada em `index.html`).
- Servidor (Python): via endpoint `/export-docx` (Flask). Para usar no Netlify, é preciso apontar esse endpoint para um backend externo.

## Opção A — Deploy rápido (Drag & Drop)

1. Acesse https://app.netlify.com/ e faça login.
2. Clique em "Add new site" → "Deploy manually".
3. Arraste e solte a pasta do projeto (`Homolog`) contendo `index.html`, `app.js`, `styles.css`, `assets/`.
4. Ao publicar, a URL do site será gerada automaticamente.

Observação: nessa opção, o botão "Exportar DOCX" usará primeiro o endpoint `/export-docx`. Como o Netlify não possui backend Python, a chamada retornará 404 e o fallback do cliente (CDN `docx`) assumirá automaticamente.

## Opção B — Deploy com CLI

1. Instale Node.js e o Netlify CLI:
   - `npm i -g netlify-cli`
2. No diretório do projeto, execute:
   - `netlify login`
   - `netlify init` (crie ou escolha o site)
   - `netlify deploy --prod --dir .`

O site estará disponível em uma URL como `https://seu-site.netlify.app/`.

## Usando backend Python externo

Se quiser manter a exportação via Python (Flask), hospede o backend em um serviço externo (Railway, Render, Fly.io, etc.) e configure o `netlify.toml` para redirecionar:

```toml
[build]
  publish = "."

[[redirects]]
  from = "/export-docx"
  to = "https://SEU-BACKEND/export-docx"
  status = 200
  force = true
```

Assim, o `fetch('/export-docx')` será proxy pela mesma origem do Netlify, evitando CORS e garantindo que o DOCX seja gerado no servidor.

## Testes após o deploy

- Acesse a URL do Netlify do seu site.
- Verifique se:
  - A coluna de captura está maior (`3fr 1fr`).
  - O botão "Expandir captura" entra e sai de tela cheia.
  - Clicar nas miniaturas abre o modal de imagem.
  - O botão "Exportar DOCX":
    - Com backend externo e redirect configurado, baixa o DOCX gerado no servidor.
    - Sem backend, usa automaticamente o fallback em cliente (CDN `docx`).

## Dicas

- Se decidir usar apenas o fallback, nenhum backend é necessário para Netlify.
- Se for usar backend externo, mantenha `CORS` habilitado no Flask (já presente) — com o redirect do Netlify, CORS não será necessário, pois a chamada será mesma origem.

