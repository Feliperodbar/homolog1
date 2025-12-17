/**
 * Módulo de persistência e gerenciamento de armazenamento.
 * Responsável por carregar/salvar dados em localStorage.
 */

const STORAGE_KEY = 'homolog_steps_v1';
const PROJECT_DATA_KEY = 'homolog_project_data_v1';

/**
 * Persiste os passos no localStorage
 * @param {Array} steps - Lista de passos a persistir
 */
export function persist(steps) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(steps));
    } catch (e) {
        console.warn('Persistência falhou:', e);
    }
}

/**
 * Carrega os passos do localStorage
 * @returns {Array} Lista de passos carregados
 */
export function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) || [] : [];
    } catch (e) {
        console.warn('Carregamento falhou:', e);
        return [];
    }
}

/**
 * Persiste dados do projeto no localStorage
 * @param {Object} projectData - Dados do projeto
 */
export function persistProjectData(projectData) {
    try {
        localStorage.setItem(PROJECT_DATA_KEY, JSON.stringify(projectData));
    } catch (e) {
        console.warn('Persistência de dados do projeto falhou:', e);
    }
}

/**
 * Carrega dados do projeto do localStorage
 * @returns {Object} Dados do projeto carregados
 */
export function loadProjectData() {
    try {
        const raw = localStorage.getItem(PROJECT_DATA_KEY);
        return raw ? JSON.parse(raw) || {} : {};
    } catch (e) {
        console.warn('Carregamento de dados do projeto falhou:', e);
        return {};
    }
}

/**
 * Limpa todos os dados salvos
 */
export function clear() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PROJECT_DATA_KEY);
    } catch (e) {
        console.warn('Limpeza falhou:', e);
    }
}
