// Runs the sentence-embedding model off the UI thread. The model (a small MiniLM, ~25 MB) is downloaded once by the browser and cached.
// Loaded from a CDN at runtime so it is not bundled; if it cannot load, the app falls back to word-overlap matching.
let pipe: Promise<(t: string[], o: object) => Promise<{ tolist(): number[][] }>> | null = null;
const load = () => pipe ??= (async () => {
  const url = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
  const lib = await import(/* @vite-ignore */ url);
  return lib.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
})();

self.onmessage = async (e: MessageEvent<{ id: number; texts: string[] }>) => {
  try { const p = await load(); const out = await p(e.data.texts, { pooling: 'mean', normalize: true }); (self as unknown as Worker).postMessage({ id: e.data.id, vectors: out.tolist() }); }
  catch (err) { (self as unknown as Worker).postMessage({ id: e.data.id, error: (err as Error).message }); }
};
