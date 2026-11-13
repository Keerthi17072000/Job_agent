import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import * as db from './db.ts';
import { parseResume } from './resume.ts';
import { toJob } from './pipeline.ts';
import { careerPages } from './adapters/ats.ts';
import { PORTALS, portalAdapters, portalName } from './adapters/portals.ts';
import { STATUSES } from './types.ts';
import type { Prefs, Profile, RawJob, Status } from './types.ts';

const PORT = +(process.env.PORT ?? 3000);
const DIST = path.resolve('web/dist');
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const body = (req: http.IncomingMessage) => new Promise<Buffer>(r => { const c: Buffer[] = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const send = (res: http.ServerResponse, code: number, data: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };

/** Score and store raw jobs; returns counts so nothing is dropped silently. */
function ingest(raws: RawJob[], profile: Profile, prefs: Prefs) {
  const out: Record<string, number> = { added: 0, duplicate: 0 };
  for (const raw of raws) {
    const j = toJob(raw, profile, prefs);
    const k = typeof j === 'string' ? `rejected: ${j}` : db.addJob(j);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

http.createServer(async (req, res) => {
  try {
    const url = req.url ?? '/';
    // Other websites must not be able to post to this local server; allow the app itself and the extension.
    const o = req.headers.origin;
    if (req.method === 'POST' && o && o !== `http://${req.headers.host}` && !o.startsWith('chrome-extension://')) return send(res, 403, { error: 'forbidden origin' });

    if (req.method === 'GET' && url === '/api/state')
      return send(res, 200, { profile: db.get('profile'), prefs: db.get('prefs'), jobs: db.listJobs(), statuses: STATUSES, portals: PORTALS.map(p => ({ id: p.id, name: p.name, policy: p.policy, note: p.note })), runs: db.listPortals() });

    if (req.method === 'POST' && url === '/api/resume') {
      const profile = await parseResume(await body(req), String(req.headers['x-filename'] ?? ''));
      db.set('profile', profile);
      if (!db.get('prefs')) db.set('prefs', { roles: profile.targetRoles, locations: profile.location ? [profile.location] : [], workModes: [], minScore: 60, blocklist: [], companies: [] } satisfies Prefs);
      return send(res, 200, profile);
    }
    if (req.method === 'POST' && url === '/api/prefs') { db.set('prefs', JSON.parse((await body(req)).toString())); return send(res, 200, {}); }

    if (req.method === 'POST' && url === '/api/search') {
      const profile = db.get<Profile>('profile'), prefs = db.get<Prefs>('prefs');
      if (!profile || !prefs) return send(res, 400, { error: 'Upload a resume first' });
      const query = { roles: prefs.roles, locations: prefs.locations, companies: prefs.companies };
      const results = [];
      for (const a of [careerPages, ...portalAdapters]) { // portals one at a time: polite and easy to stop
        const r = await a.search(query);
        const counts = ingest(r.jobs, profile, prefs);
        db.savePortal(r, counts.added + counts.duplicate);
        results.push({ adapter: r.adapter, name: r.name, status: r.status, reason: r.reason, found: r.jobs.length, ...counts });
      }
      return send(res, 200, { results });
    }

    if (req.method === 'POST' && url === '/api/ingest') { // listings sent by the browser extension
      const profile = db.get<Profile>('profile'), prefs = db.get<Prefs>('prefs');
      if (!profile || !prefs) return send(res, 400, { error: 'Upload a resume first' });
      const raws = (JSON.parse((await body(req)).toString()) as RawJob[]).map(j => ({ ...j, source: portalName(j.source), sourceKind: 'portal' as const, description: j.description ?? '' }));
      return send(res, 200, { received: raws.length, ...ingest(raws, profile, prefs) });
    }

    const m = /^\/api\/jobs\/([a-f0-9]+)\/status\/(\w+)$/.exec(url);
    if (req.method === 'POST' && m) {
      if (!STATUSES.includes(m[2] as Status)) return send(res, 400, { error: 'bad status' });
      db.setStatus(m[1], m[2] as Status); return send(res, 200, {});
    }

    if (req.method === 'GET' && !url.startsWith('/api/')) { // built dashboard
      const f = path.join(DIST, url === '/' ? 'index.html' : url.split('?')[0]);
      const file = f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : path.join(DIST, 'index.html');
      if (!fs.existsSync(file)) return send(res, 404, { error: 'Run `npm run build` first' });
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      return res.end(fs.readFileSync(file));
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 500, { error: (e as Error).message }); }
}).listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}`));
