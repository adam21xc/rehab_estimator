export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// Safe unique id that works everywhere (no crypto requirement)
export const uid = (): string => {
  try {
    // @ts-ignore
    if (globalThis?.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {/* ignore */}
  // Fallback: time + randomness
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};