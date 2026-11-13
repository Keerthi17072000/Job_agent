import { DatabaseSync } from 'node:sqlite';
import type { Job, Status } from './types.ts';

export const db = new DatabaseSync(process.env.DB ?? 'jobs.db');
db.exec(`
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, fingerprint TEXT UNIQUE, canonical_url TEXT UNIQUE, status TEXT, score INTEGER, first_seen TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS portal_status(adapter TEXT PRIMARY KEY, name TEXT, status TEXT, reason TEXT, found INTEGER, checked_at TEXT);
`);

export const get = <T>(k: string): T | null => { const r = db.prepare('SELECT v FROM kv WHERE k=?').get(k) as { v: string } | undefined; return r ? JSON.parse(r.v) : null; };
export const set = (k: string, v: unknown) => { db.prepare('INSERT OR REPLACE INTO kv VALUES(?,?)').run(k, JSON.stringify(v)); };

/** Duplicate if company+title+location OR the canonical URL was already stored. */
export function addJob(j: Job): 'added' | 'duplicate' {
  if (db.prepare('SELECT 1 FROM jobs WHERE fingerprint=? OR canonical_url=?').get(j.fingerprint, j.canonicalUrl)) return 'duplicate';
  db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?)').run(j.id, j.fingerprint, j.canonicalUrl, j.status, j.score, j.firstSeen, JSON.stringify(j));
  return 'added';
}
export const listJobs = (): Job[] =>
  (db.prepare('SELECT data, status FROM jobs ORDER BY score DESC, first_seen DESC').all() as { data: string; status: Status }[]).map(r => ({ ...JSON.parse(r.data), status: r.status }));
export const setStatus = (id: string, status: Status) => { db.prepare('UPDATE jobs SET status=? WHERE id=?').run(status, id); };
export const savePortal = (a: { adapter: string; name: string; status: string; reason: string }, found: number) => {
  db.prepare('INSERT OR REPLACE INTO portal_status VALUES(?,?,?,?,?,?)').run(a.adapter, a.name, a.status, a.reason, found, new Date().toISOString());
};
export const listPortals = () => db.prepare('SELECT * FROM portal_status').all();
