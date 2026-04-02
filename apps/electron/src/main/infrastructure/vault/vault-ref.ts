const VAULT_REF_PREFIX = "vault://";

export function isVaultReference(value?: string | null): boolean {
  return typeof value === "string" && value.startsWith(VAULT_REF_PREFIX);
}

export function createVaultReference(secretId: string): string {
  return `${VAULT_REF_PREFIX}${secretId}`;
}

export function parseVaultReference(value: string): string | null {
  if (!isVaultReference(value)) {
    return null;
  }
  return value.slice(VAULT_REF_PREFIX.length) || null;
}
