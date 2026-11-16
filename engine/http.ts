import type { SearchCtx } from './types.ts';

const lastCall = new Map<string, number>();
const MIN_GAP_MS = 250; // polite gap between calls to the same host
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('cancelled')); }, { once: true });
});

/** GET JSON with per-host spacing, retries with backoff on network errors, 429 and 5xx, and cancellation. */
export async function getJson(url: string, ctx?: SearchCtx & { retries?: number; source?: string; gapMs?: number }): Promise<any> {
  const host = new URL(url).host, retries = ctx?.retries ?? 2, gap = ctx?.gapMs ?? MIN_GAP_MS;
  let lastErr: Error = new Error('request failed');
  for (let attempt = 0; attempt <= retries; attempt++) {
    const wait = Math.max(0, (lastCall.get(host) ?? 0) + gap - Date.now());
    lastCall.set(host, Date.now() + wait);
    if (wait) await sleep(wait, ctx?.signal);
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' }, signal: ctx?.signal ?? AbortSignal.timeout(20000) });
      if (r.ok) return await r.json();
      lastErr = new Error(`HTTP ${r.status}`);
      if (r.status < 500 && r.status !== 429) throw lastErr; // 4xx other than 429: retrying will not help
    } catch (e) {
      if ((e as Error).message === 'cancelled' || (e as Error).name === 'AbortError') throw e;
      lastErr = e as Error;
      if (/^HTTP 4/.test(lastErr.message) && !/429/.test(lastErr.message)) throw lastErr;
    }
    if (attempt < retries) {
      ctx?.log?.({ at: new Date().toISOString(), source: ctx.source ?? host, level: 'warn', msg: `${lastErr.message}, retrying (${attempt + 1}/${retries})` });
      await sleep(400 * 2 ** attempt, ctx?.signal);
    }
  }
  throw lastErr;
}
