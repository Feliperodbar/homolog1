# 🏡 Homolog — Criador de Passos de Teste

Aplicação moderna para capturar e documentar passos de teste em tela, gerando relatórios em HTML e DOCX com screenshots anotados.

## ✨ Recursos

- **Captura de tela em tempo real** com suporte a cursor
- **Adicionar passos** com screenshots anotadas e descrições
- **Exportação em múltiplos formatos**: HTML e DOCX
- **Persistência local** via localStorage
- **Interface responsiva** com tema escuro moderno
- **Acessibilidade** com suporte a navegação por teclado
- **Destaque visual** de cliques/pontos na tela capturada

## 🚀 Quick Start

### Pré-requisitos
- Node.js 16+
- Python 3.8+ (para servidor backend)

### Instalação

```bash
# Clonar repositório
git clone https://github.com/Feliperodbar/homolog1.git
cd homolog1

# Instalar dependências
npm install
```

### Desenvolvimento Local

```bash
# Terminal 1: Iniciar frontend (Vite dev server)
npm run dev

# Terminal 2: Iniciar backend
python server.py

# Abrir http://localhost:5173
```

### Build para Produção

```bash
npm run build

# Saída em ./dist
```

### Preview de Build

```bash
npm run preview
```

## 📁 Estrutura do Projeto

```
├── index.html              # HTML principal
├── app.js                  # Lógica da aplicação (refatorar em módulos)
├── styles.css              # Estilos CSS
├── server.py               # Backend Flask
├── package.json            # Dependências npm
├── requirements.txt        # Dependências Python
├── netlify.toml           # Configuração Netlify (opcional)
├── vercel.json            # Configuração Vercel (opcional)
└── assets/                # Recursos estáticos
```

## 🔧 Configuração

### Variáveis de Ambiente

```bash
# Backend
PORT=8010                  # Porta do servidor Flask (padrão: 8010)
FLASK_ENV=production       # Modo produção/desenvolvimento
```

### Armazenamento

- Dados são salvos em **localStorage** com chave: `homolog_steps_v1`
- Limite recomendado: até ~5MB

## 🌐 Deploy

### Netlify

```bash
npm run build
# Fazer push para repositório
# Conectar no painel Netlify (auto-deploy habilitado)
```

### Vercel

```bash
npm run build
# Fazer push para repositório
# Importar projeto em Vercel
```

### Docker (Produção)

```dockerfile
# Usar imagem Node + Python
FROM node:18-slim
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
EXPOSE 8010
CMD ["python", "server.py"]
```

## 📚 API

### POST `/trigger-add-step`
Dispara evento para adicionar passo (usado por atalhos de teclado).

**Payload:**
```json
{
  "x": 100,
  "y": 200
}
```

**Resposta:**
```json
{
  "ok": true,
  "ts": 1702652400000,
  "x": 100,
  "y": 200
}
```

### GET `/trigger-state`
Retorna estado atual do trigger.

### GET `/health`
Verifica saúde da aplicação.

## 🔒 Segurança

- ⚠️ CORS está aberto — configurar em produção
- Validação de entrada implementada no backend
- Não salva dados sensíveis localmente
- Usar HTTPS em produção

### Melhorias Futuras de Segurança
- [ ] Autenticação de usuário
- [ ] Rate limiting de API
- [ ] Criptografia de dados locais
- [ ] Sanitização de HTML em exportações

## 🎨 Customização

### Temas
Editar variáveis CSS em `styles.css`:
```css
:root {
  --primary: #2563eb;      /* Cor primária */
  --accent: #60a5fa;       /* Cor destaque */
  --bg: #0b1220;           /* Fundo */
  --text: #e6f0ff;         /* Texto */
}
```

### Tamanho de Exportação
Ajustar em `app.js`:
```javascript
const EXPORT_IMAGE_WIDTH_CM = 20.23;
const EXPORT_IMAGE_HEIGHT_CM = 9.28;
```

## 🐛 Troubleshooting

### "Não foi possível iniciar a captura"
- Verificar se navegador suporta `getDisplayMedia()`
- Usar Chrome 72+, Firefox 66+, Edge 79+
- Não funciona em modo privado/anônimo

### LocalStorage cheio
- Limpar dados: abrir DevTools → Application → Clear Storage
- Ou executar: `localStorage.clear()`

### Backend não conecta
- Verificar se `http://localhost:8010` está acessível
- Confirmar: `curl http://localhost:8010/health`

## 📦 Dependências Principais

| Pacote | Uso |
|--------|-----|
| vite | Build tool e dev server |
| flask | Backend servidor HTTP |
| flask-cors | Suporte a CORS |

## 🔄 Roadmap

- [ ] Separar `app.js` em módulos ES6
- [ ] Adicionar testes automatizados
- [ ] Migrar para TypeScript
- [ ] Autenticação e banco de dados
- [ ] Editor de passos integrado
- [ ] Suporte a temas escuro/claro

## 📄 Licença

ISC License — veja [LICENSE](LICENSE)

## 👥 Autor

**Felipe Rodrigues**  
[GitHub](https://github.com/Feliperodbar) | [Issues](https://github.com/Feliperodbar/homolog1/issues)

---

**Dúvidas ou sugestões?** Abra uma [issue](https://github.com/Feliperodbar/homolog1/issues/new) no GitHub.
