/**
 * ARQUITETURA DE MÓDULOS
 * 
 * O projeto foi refatorado para separar responsabilidades em módulos ES6,
 * melhorando manutenibilidade, testabilidade e clareza do código.
 */

/**
 * === ESTRUTURA DE MÓDULOS ===
 * 
 * modules/
 * ├── storage.js       - Persistência em localStorage
 * ├── ui.js            - Interface do usuário (toasts, modais, status)
 * ├── capture.js       - Captura de tela e gerenciamento de media stream
 * ├── steps.js         - Gerenciamento de passos (criar, atualizar, renderizar)
 * ├── ocr.js           - Detecção de texto com Tesseract.js
 * ├── export.js        - Exportação para HTML/DOCX
 * └── backend.js       - Comunicação com servidor Flask
 */

/**
 * === FLUXO DE DADOS ===
 * 
 * app.js (principal)
 *   ├─ setupEventListeners() → Conecta botões aos handlers
 *   ├─ handleStartCapture() → capture.startCapture()
 *   ├─ handleAddStep()
 *   │  ├─ capture.captureScreenshot()
 *   │  ├─ stepsModule.createStep()
 *   │  └─ storage.persist()
 *   ├─ handleVideoClick()
 *   │  └─ addStepWithHighlight()
 *   │     ├─ ocr.suggestLabelFromVideo() [async]
 *   │     └─ stepsModule.updateStep()
 *   └─ startTriggerPolling()
 *      └─ backend.getTriggerState() [async]
 */

/**
 * === MÓDULO: storage.js
 * 
 * Gerencia persistência em localStorage
 * 
 * Exports:
 *   - persist(steps): Salva passos em JSON
 *   - load(): Carrega passos salvos
 *   - clear(): Limpa todos os dados
 */

/**
 * === MÓDULO: ui.js
 * 
 * Manipula feedback visual da interface
 * 
 * Exports:
 *   - showToast(msg, ms): Exibe notificação temporária
 *   - setStatus(text): Atualiza texto de status
 *   - openImageModal(url): Abre imagem em modal
 *   - closeImageModal(lastFocused): Fecha modal (restaura foco)
 *   - toggleFullscreenCapture(): Alterna tela cheia
 *   - updateExpandButtonLabel(): Atualiza label do botão de expandir
 * 
 * Features:
 *   - Suporte a teclado (Escape para fechar modal)
 *   - Acessibilidade (aria-hidden, foco gerenciado)
 */

/**
 * === MÓDULO: capture.js
 * 
 * Gerencia captura de tela via MediaStream API
 * 
 * Exports:
 *   - getMediaStream(): Retorna stream ativo ou null
 *   - startCapture(): Inicia captura (abre dialog)
 *   - stopCapture(): Para captura
 *   - captureScreenshot(highlight): Captura frame atual
 *   - ensureVideoReady(): Aguarda carregamento do vídeo
 * 
 * Features:
 *   - Destaque com seta vermelha em coordenadas
 *   - Suporte a cursor na captura
 *   - Tratamento de fullscreen automático
 */

/**
 * === MÓDULO: steps.js
 * 
 * Gerenciamento de lista de passos
 * 
 * Exports:
 *   - createStep(imageUrl, options): Cria novo passo
 *   - removeStep(steps, id): Remove passo da lista
 *   - updateStep(steps, id, field, value): Atualiza campo
 *   - renderSteps(steps, callbacks): Renderiza UI dos passos
 * 
 * Estrutura de Passo:
 *   {
 *     id: string (gerado como "step_timestamp")
 *     title: string
 *     description: string
 *     tag: string (rótulo do elemento clicado)
 *     imageDataUrl: string (PNG em base64)
 *     createdAt: number (timestamp ms)
 *   }
 * 
 * Callbacks do renderSteps:
 *   - onDelete(id): Deletar passo
 *   - onUpdate(id, field, value): Atualizar campo
 *   - onImageClick(url): Abrir modal com imagem
 */

/**
 * === MÓDULO: ocr.js
 * 
 * Detecção e reconhecimento de texto
 * 
 * Exports:
 *   - suggestLabelFromVideo(video, coords): Detecta texto próximo ao clique
 *   - pickLabelFromText(text): Extrai rótulo legível
 *   - sanitizeLabel(label): Remove whitespace desnecessário
 * 
 * Features:
 *   - Usa Tesseract.js (OCR via IA)
 *   - Recorta região ao redor do clique
 *   - Detecta linha inteira de palavras
 *   - Fallback gracioso se Tesseract não estiver disponível
 * 
 * Requer:
 *   - window.Tesseract.recognize (carregado no HTML)
 */

/**
 * === MÓDULO: export.js
 * 
 * Exportação de relatórios
 * 
 * Exports:
 *   - buildExportHtml(steps): Gera HTML exportável
 *   - downloadHtml(steps): Baixa HTML como arquivo
 *   - dataUrlToArrayBuffer(dataUrl): Converte imagem
 *   - getImageDimensions(dataUrl): Obtém dimensões
 *   - resizeImageToFit(dataUrl, maxW, maxH): Redimensiona imagem
 * 
 * Features:
 *   - Exportação HTML com folha de estilo integrada
 *   - Suporte a imagens em base64 (sem referências externas)
 *   - Redimensionamento inteligente de imagens
 *   - Configuração de dimensões em cm (compatível com Word)
 */

/**
 * === MÓDULO: backend.js
 * 
 * Comunicação com servidor Flask
 * 
 * Exports:
 *   - getBackendBase(): Retorna base URL do backend
 *   - getTriggerState(): Busca estado de trigger
 *   - checkHealth(): Verifica saúde da API
 * 
 * Features:
 *   - Detecção automática de localhost
 *   - Fallback para http://localhost:8010 em produção
 *   - Tratamento de erros gracioso
 * 
 * API esperada:
 *   GET  /health
 *   GET  /trigger-state
 *   POST /trigger-add-step
 */

/**
 * === CONSTANTES DE CONFIGURAÇÃO ===
 * 
 * Em export.js:
 *   EXPORT_IMAGE_WIDTH_CM = 20.23  (largura de exportação em cm)
 *   EXPORT_IMAGE_HEIGHT_CM = 9.28  (altura de exportação em cm)
 *   DOCX_IMAGE_MAX_WIDTH_CM = 7    (largura máx. em DOCX)
 *   DOCX_IMAGE_MAX_HEIGHT_CM = 10  (altura máx. em DOCX)
 * 
 * Em storage.js:
 *   STORAGE_KEY = 'homolog_steps_v1'
 * 
 * Em capture.js:
 *   reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)')
 */

/**
 * === GUIA DE EXTENSÃO ===
 * 
 * Para adicionar nova funcionalidade:
 * 
 * 1. Criar novo módulo em modules/feature.js
 * 2. Exportar funções públicas
 * 3. Documentar interface no topo do arquivo
 * 4. Importar em app.js
 * 5. Usar nos handlers apropriados
 * 
 * Exemplo: Adicionar suporte a áudio
 * 
 *   // modules/audio.js
 *   export function recordAudio() { ... }
 *   export function stopAudioRecording() { ... }
 *   
 *   // app.js
 *   import * as audio from './modules/audio.js';
 *   
 *   async function handleAudioToggle() {
 *     if (audioRecording) audio.stopAudioRecording();
 *     else await audio.recordAudio();
 *   }
 */

/**
 * === TESTES ===
 * 
 * Para testar módulos isoladamente:
 * 
 *   // test.js
 *   import * as storage from './modules/storage.js';
 *   
 *   const testSteps = [
 *     { id: 'test_1', title: 'Step 1', ... },
 *   ];
 *   
 *   storage.persist(testSteps);
 *   const loaded = storage.load();
 *   console.assert(loaded[0].id === 'test_1');
 * 
 * Recomendado: Usar Jest ou Vitest para testes automatizados
 */
