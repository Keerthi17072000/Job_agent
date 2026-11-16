let worker: Worker | null = null, seq = 0;
const waiting = new Map<number, { res: (v: number[][]) => void; rej: (e: Error) => void }>();

/** Embed texts with the on-device model. Throws if the model cannot be loaded (caller falls back). Vectors are normalised, so a dot product is cosine similarity. */
export function embed(texts: string[]): Promise<number[][]> {
  if (!worker) {
    worker = new Worker(new URL('./worker/embed.ts', import.meta.url), { type: 'module' });
    worker.onmessage = e => { const w = waiting.get(e.data.id); waiting.delete(e.data.id); e.data.error ? w?.rej(new Error(e.data.error)) : w?.res(e.data.vectors); };
    worker.onerror = () => { for (const w of waiting.values()) w.rej(new Error('Embedding worker failed')); waiting.clear(); worker = null; };
  }
  return new Promise((res, rej) => { const id = ++seq; waiting.set(id, { res, rej }); worker!.postMessage({ id, texts }); });
}
export const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
