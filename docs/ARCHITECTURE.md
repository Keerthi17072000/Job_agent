# Architecture

Job Agent is a static, browser-only app (React + TypeScript + Tailwind) published on GitHub Pages. There is no server and no database service: everything the user uploads or collects stays in their own browser.

```
resume file ──> checkResume (type by content, 5 MB)  ──> fileText (pdf/docx/txt, in browser)
                                                   │
                          on-device parser (engine/localResume.ts)   or   optional AI key (engine/ai.ts)
                                                   ▼
                                  editable Profile (engine/profile.ts)  ──> confirm ──> prefs + queries (engine/queries.ts)
                                                   ▼
        ┌──────────── search (web/src/api.ts): bounded concurrency, cache 6 h, cancel, per-source status ────────────┐
        │ Adapter contract (engine/types.ts, engine/adapters/base.ts)                                                │
        │   career pages: Greenhouse · Lever · Ashby · SmartRecruiters      (public board feeds)                    │
        │   public APIs : Remotive · Jobicy · Arbeitnow · RemoteOK · Adzuna (own free key)                          │
        │   portals (Naukri, LinkedIn, ...): the page asks the browser extension, which opens ONE search tab in the user's  │
        │   own browser on their click, reads it, closes it; login/CAPTCHA pages stop the search and are left to the user │
        └────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                   ▼
        toJob (engine/pipeline.ts): reject without title/company/https URL ─> match (engine/match.ts) ─> dedupe/merge sources
                                                   ▼
        IndexedDB (web/src/store.ts), one isolated slot per candidate profile ─> dashboard views (web/src/views/*)
```

## Modules
| Path | Responsibility |
|---|---|
| `engine/lexicon.ts` | Profession-neutral vocabularies (tech, general professional skills, soft skills, industries, title words). Used to recognise, never to assume. |
| `engine/localResume.ts` | Free rule-based parser: reads the resume's own sections (summary, skills, experience, education, projects, certifications) for any profession. |
| `engine/profile.ts` | `normalizeProfile`: single place that coerces parser output, AI output and edited form state into a valid `Profile`. |
| `engine/queries.ts` | Search queries from the confirmed profile: roles, alternative titles, role + skill combinations. |
| `engine/ai.ts` | Optional Claude/OpenAI provider (user's key). Resume text is untrusted: fixed system prompt, `<document>` delimiters, JSON-only reply coerced through `normalizeProfile`, no tools. |
| `engine/adapters/*` | Source connectors implementing `searchJobs`, `getJobDetails`, `normalizeJob`, `getSourceStatus` (`makeAdapter` adds status, logging, failure isolation). |
| `engine/http.ts` | `getJson`: per-host spacing, retry with backoff on network/429/5xx, no retry on other 4xx, cancellation, log hook. |
| `engine/match.ts` | Hybrid score: skills 35, experience 20, responsibilities 20, title 15, education/other 10. Location and salary are filters. Optional semantic similarity replaces the word-overlap responsibility estimate. |
| `engine/pipeline.ts` | `toJob`, duplicate detection (company+title+location, canonical URL, source job id, description similarity), `ingest`. |
| `web/src/api.ts` | Application service used by the UI: resume, profile, search, rescoring, slots. |
| `web/src/worker/embed.ts` | On-device sentence embeddings (MiniLM via transformers.js loaded from a CDN) in a Web Worker; optional. |
| `extension/` | Chrome extension (MV3). `bridge.js` relays page requests; `background.js` opens one portal tab per user click and returns the listings; `content.js` + `sites.js` extract listings (JSON-LD, per-portal selectors, generic fallback) and detect login walls; Diagnose helper. |

## Matching
Score = 100 × (0.35 skills + 0.20 experience + 0.20 responsibilities + 0.15 title + 0.10 education). Skills come from a built-in vocabulary plus the candidate's own skills; those before a "nice to have/preferred" heading are required, those after are optional. A skill missing from the resume is reported as "not found in your resume", never as "you lack it". Categories: 90+ Excellent, 75-89 Strong, 60-74 Moderate, below 60 Low; the minimum shown is a user setting. Editing the profile or preferences rescoring every stored job.

## Deliberate differences from a server design
- No accounts or server: per-user isolation is per-browser storage, plus separate profile slots. Moving to Supabase/Postgres means replacing `web/src/store.ts` and adding auth; the engine does not depend on storage.
- No scheduled daily searches (needs a server). Substitute: optional refresh on open when the last search is older than 24 h.
- Search runs asynchronously with progress and cancel on the main thread (network I/O does not block); only embeddings use a worker.
- Playwright is used for tests, not for scraping. The website never opens portals; only the user's own extension does, one page per click.

## Security
CSP meta tag; file type checked by content, size limit; only https job links are stored or rendered; all text rendered through React (no HTML injection); API keys stay in IndexedDB and are sent only to their provider; resume and job text never control tools.
