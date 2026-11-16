# Job Agent

Upload any resume, get ranked real jobs. Runs entirely in your browser: **https://keerthi17072000.github.io/Job_agent/**

Free: no server, no account, no API key needed. Your resume and jobs are stored in your own browser (IndexedDB) and never uploaded. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Use it
1. **Upload** a PDF, DOCX or TXT resume (up to 5 MB). A free on-device parser reads it for any profession.
2. **Review your profile** (Profile page): fix name, designation, experience, skills, target roles, locations and work modes, then confirm. Every match is recalculated from this profile.
3. **Search** (Overview): queries are generated from your roles and skills, and sent to every source at once. The Sources page shows each source's real status and an activity log. Results are cached for 6 hours; "Fresh search" refetches.
4. **Review matches**: score 0-100 with reasons, matched and missing skills, filters, sorting, details page, original application link, save, and application tracking with notes.
5. **Restricted portals** (Naukri, LinkedIn, Indeed, Glassdoor, Foundit, Hirist, iimjobs, Shine, Wellfound, Instahyre, Cutshort) forbid automated reading, so the app never opens them. Use the Chrome extension: open a portal search from the Sources page in your own tab, click **Send to Job Agent**, come back and the listings import. Install it once from the Sources page (or load `extension/` unpacked).

## Sources
| Source | Status |
|---|---|
| Greenhouse, Lever, Ashby, SmartRecruiters boards | Verified live from a browser (Greenhouse, Lever, Ashby, SmartRecruiters). Add boards as `ats:token` lines in Settings. |
| Remotive, Jobicy, Arbeitnow, RemoteOK | Verified live from a browser. Mostly remote or international roles. |
| Adzuna (India) | Needs your own free key. From its documentation only, unverified. |
| Naukri, LinkedIn, Indeed, Glassdoor, Foundit, Hirist, iimjobs, Shine, Wellfound, Instahyre, Cutshort | Manual via the extension. Selectors and search links unverified until you try them. |
| Workday, The Muse | Not supported (no stable public API / blocks browser requests). |

## Optional AI
Settings: add your own Claude or OpenAI key for better profile extraction and query suggestions (the key stays in your browser; your resume text goes to that provider). Turn on **Semantic matching** to compare job descriptions to your experience by meaning with an on-device model (one-time ~25 MB download); it falls back to word overlap if it cannot load.

## Develop
```bash
npm install
npm test            # unit tests (engine + extension extractors)
npm run typecheck
npm run build
npm run e2e         # Playwright end-to-end on the built site (npx playwright install chromium first)
npm run dev         # http://localhost:5173
```
No environment variables: keys are entered in the UI. CI (`.github/workflows/ci.yml`) runs all of the above; pushes to `main` deploy to Pages.

## Rules the code enforces
- Every stored job has a source and an https original URL, or it is rejected and counted. No mock data: test fixtures live only in test files.
- A source that fails is reported as failed; an unconfigured or manual source is never shown as working. One failing source never stops the others.
- Duplicates (same company+title+location, canonical URL, source job id, or near-identical text in the same place) collapse into one job that keeps every source link.
- Location and salary are filters, not part of the professional fit score. A skill missing from the resume is "not found", never "you lack it".

## Known limits
- No accounts, no scheduled daily search (needs a server): optional refresh-on-open instead. Data lives in one browser.
- Skills in postings are recognised from a built-in vocabulary (about 300 tech, professional and soft-skill terms) plus your own skills, so postings in unusual fields may show "no recognisable skills" and a neutral skill score.
- Resume parsing is rule-based and tuned for conventional layouts; scanned-image PDFs and old `.doc` files are not supported.
- Optional AI calls from a browser depend on each provider's CORS policy (unverified without a key). The semantic model download is unverified from the build sandbox.
- Free job APIs skew to remote and international roles; Indian coverage needs Adzuna or the extension.
