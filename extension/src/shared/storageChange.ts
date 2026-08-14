export function hasOwnStorageChange(
  changes: Record<string, unknown>,
  storageKey: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(changes, storageKey);
}
