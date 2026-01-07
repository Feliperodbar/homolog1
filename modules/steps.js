/**
 * Módulo de gerenciamento de passos.
 * Manipula a lista de passos e renderização.
 */

import { showToast } from './ui.js';
import { persist } from './storage.js';

/**
 * Adiciona um novo passo
 * @param {string} imageDataUrl - Data URL da imagem
 * @param {Object} options - Opções { title, description, tag }
 * @returns {Object} Passo criado
 */
export function createStep(imageDataUrl, options = {}) {
    const step = {
        id: `step_${Date.now()}`,
        title: options.title || `Passo #${Date.now()}`,
        description: options.description || '',
        tag: options.tag || '',
        imageDataUrl,
        createdAt: Date.now(),
    };
    return step;
}

/**
 * Remove um passo por ID
 * @param {Array} steps - Lista de passos
 * @param {string} id - ID do passo
 * @returns {Array} Lista atualizada
 */
export function removeStep(steps, id) {
    return steps.filter((s) => s.id !== id);
}

/**
 * Atualiza um campo de um passo
 * @param {Array} steps - Lista de passos
 * @param {string} id - ID do passo
 * @param {string} field - Campo a atualizar
 * @param {any} value - Novo valor
 * @returns {Array} Lista atualizada
 */
export function updateStep(steps, id, field, value) {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx >= 0) {
        steps[idx] = { ...steps[idx], [field]: value };
    }
    return steps;
}

/**
 * Renderiza a lista de passos no DOM como cards verticais
 * @param {Array} steps - Lista de passos
 * @param {Object} callbacks - Callbacks { onDelete, onUpdate, onImageClick }
 */
export function renderSteps(steps, { onDelete, onUpdate, onImageClick }) {
    const container = document.getElementById('stepsList');
    if (!container) return;

    container.innerHTML = '';

    if (!steps.length) {
        const empty = document.createElement('div');
        empty.className = 'carousel-empty';
        empty.textContent = 'Nenhum passo ainda. Capture a tela e adicione passos.';
        container.appendChild(empty);
        return;
    }

    const list = document.createElement('div');
    list.className = 'steps-cards';

    steps.forEach((s, index) => {
        const card = createStepCard(s, index + 1, steps.length, {
            onDelete,
            onUpdate,
            onImageClick,
        });
        list.appendChild(card);
    });

    container.appendChild(list);
}

/**
 * Cria elemento de cartão para um passo
 * @private
 */
function createStepCard(step, stepNumber, totalSteps, { onDelete, onUpdate, onImageClick }) {
    const card = document.createElement('div');
    card.className = 'step-card';

    // Cabeçalho com número
    const header = document.createElement('div');
    header.className = 'step-header';
    const number = document.createElement('div');
    number.className = 'step-number';
    number.textContent = `Passo ${stepNumber}`;
    header.appendChild(number);
    card.appendChild(header);

    // Imagem com sobreposição de texto
    const thumbWrapper = document.createElement('div');
    thumbWrapper.className = 'step-thumb-wrapper';

    const img = document.createElement('img');
    img.className = 'step-thumb';
    img.src = step.imageDataUrl;
    img.alt = step.title || 'Passo';

    const overlay = document.createElement('div');
    overlay.className = 'step-thumb-overlay';

    const overlayTitle = document.createElement('h3');
    overlayTitle.className = 'step-thumb-title';
    overlayTitle.textContent = step.title || `Passo ${stepNumber}`;

    const overlayDesc = document.createElement('p');
    overlayDesc.className = 'step-thumb-desc';
    overlayDesc.textContent = step.description || '';

    overlay.appendChild(overlayTitle);
    overlay.appendChild(overlayDesc);

    thumbWrapper.appendChild(img);
    thumbWrapper.appendChild(overlay);
    thumbWrapper.addEventListener('click', () => onImageClick(step.imageDataUrl));
    card.appendChild(thumbWrapper);

    // Campos de edição
    const fields = document.createElement('div');
    fields.className = 'step-fields';

    // Campo: Título
    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Título';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = step.title || '';
    titleInput.addEventListener('input', (e) => {
        const value = e.target.value;
        overlayTitle.textContent = value || `Passo ${stepNumber}`;
        onUpdate(step.id, 'title', value);
    });
    fields.appendChild(titleLabel);
    fields.appendChild(titleInput);

    // Campo: Item clicado
    const tagLabel = document.createElement('label');
    tagLabel.textContent = 'Item clicado';
    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.value = step.tag || '';
    tagInput.placeholder = 'Texto visível do item (ex.: "Salvar")';
    tagInput.addEventListener('input', (e) => onUpdate(step.id, 'tag', e.target.value));
    fields.appendChild(tagLabel);
    fields.appendChild(tagInput);

    // Campo: Descrição
    const descLabel = document.createElement('label');
    descLabel.textContent = 'Descrição';
    const descInput = document.createElement('textarea');
    descInput.value = step.description || '';
    descInput.addEventListener('input', (e) => {
        const value = e.target.value;
        overlayDesc.textContent = value;
        onUpdate(step.id, 'description', value);
    });
    fields.appendChild(descLabel);
    fields.appendChild(descInput);

    card.appendChild(fields);

    // Ações
    const actions = document.createElement('div');
    actions.className = 'step-actions';
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Excluir';
    delBtn.className = 'danger';
    delBtn.addEventListener('click', () => onDelete(step.id));
    actions.appendChild(delBtn);
    card.appendChild(actions);

    return card;
}
