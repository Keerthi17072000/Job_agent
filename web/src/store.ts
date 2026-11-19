// Local storage in IndexedDB. Everything lives in this browser; nothing is sent anywhere.
// Data is grouped into "slots" (separate candidate profiles in the same browser), each fully isolated by key prefix.
export interface Slot { id: string; name: string }

let dbp: Promise<IDBDatabase> | null = null;
const open = () => dbp ??= new Promise((res, rej) => {
  const r = indexedDB.open('jobagent', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error ?? new Error('Browser storage is unavailable'));
});
const tx = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => {
  const db = await open();
  return new Promise<T>((res, rej) => { const r = f(db.transaction('kv', mode).objectStore('kv')); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
};
export const kvGet = <T,>(k: string) => tx<T | undefined>('readonly', s => s.get(k));
export const kvSet = (k: string, v: unknown) => tx('readwrite', s => s.put(v, k)).then(() => undefined);
export const kvDel = (k: string) => tx('readwrite', s => s.delete(k)).then(() => undefined);
export const kvKeys = () => tx<IDBValidKey[]>('readonly', s => s.getAllKeys());

let current = 'default';
export const slotId = () => current;
export const get = <T,>(k: string) => kvGet<T>(`${current}:${k}`);
export const set = (k: string, v: unknown) => kvSet(`${current}:${k}`, v);
export const del = (k: string) => kvDel(`${current}:${k}`);

export async function slots(): Promise<Slot[]> { return (await kvGet<Slot[]>('slots')) ?? [{ id: 'default', name: 'My profile' }]; }
export async function useSlot(id: string) { current = id; await kvSet('current', id); }
export async function initSlots(): Promise<Slot[]> {
  current = (await kvGet<string>('current')) ?? 'default';
  const list = await slots();
  if (!list.some(s => s.id === current)) current = list[0].id;
  await migrateLocalStorage();
  return list;
}
export async function saveSlots(list: Slot[]) { await kvSet('slots', list); }
export async function removeSlot(id: string) { for (const k of await kvKeys()) if (String(k).startsWith(`${id}:`)) await kvDel(String(k)); }

/** One-time move of data saved by the older localStorage version into the default slot. */
async function migrateLocalStorage() {
  try {
    if (!localStorage.getItem('ja.profile') || await kvGet('default:profile')) return;
    for (const k of ['profile', 'prefs', 'jobs', 'runs']) { const v = localStorage.getItem('ja.' + k); if (v) await kvSet(`default:${k}`, JSON.parse(v)); }
    for (const k of ['profile', 'prefs', 'jobs', 'runs']) localStorage.removeItem('ja.' + k);
  } catch { /* storage blocked or malformed: start fresh */ }
}
