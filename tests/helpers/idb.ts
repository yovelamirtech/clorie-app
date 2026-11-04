// An in-memory stand-in for idb-keyval. In a test file: vi.mock('idb-keyval', () => import('./helpers/idb'));
export const kv = new Map<string, unknown>();

export const createStore = () => 'store';
export const get = async (k: string) => structuredClone(kv.get(k));
export const set = async (k: string, v: unknown) => void kv.set(k, structuredClone(v));
export const setMany = async (entries: [string, unknown][]) => entries.forEach(([k, v]) => kv.set(k, structuredClone(v)));
export const clear = async () => kv.clear();
