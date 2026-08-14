import { describe, expect, it } from 'vitest';
import { STORAGE_KEY_RECORDING, STORAGE_KEY_STEPS } from '../extension/src/shared/constants';
import { hasOwnStorageChange } from '../extension/src/shared/storageChange';

describe('filtro de mudanças do estado de gravação', () => {
  it('ignora o salvamento de passos e mantém a gravação ativa', () => {
    const changes = { [STORAGE_KEY_STEPS]: { newValue: [{ sequence: 1 }] } };
    expect(hasOwnStorageChange(changes, STORAGE_KEY_RECORDING)).toBe(false);
  });

  it('reage quando o estado da gravação realmente muda', () => {
    const changes = { [STORAGE_KEY_RECORDING]: { newValue: { state: 'recording' } } };
    expect(hasOwnStorageChange(changes, STORAGE_KEY_RECORDING)).toBe(true);
  });
});
