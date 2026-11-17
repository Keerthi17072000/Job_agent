# Job Agent

Upload any resume, get ranked real jobs. Runs entirely in your browser: **https://keerthi17072000.github.io/Job_agent/**

Free: no server, no account, no API key needed. Your resume and jobs are stored in your own browser (IndexedDB) and never uploaded. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Use it
1. **Upload** a PDF, DOCX or TXT resume (up to 5 MB). A free on-device parser reads it for any profession.
2. **Review your profile** (Profile page): fix name, designation, experience, skills, target roles, locations and work modes, then confirm. Every match is recalculated from this profile.
3. **Search** (Overview): queries are generated from your roles and skills, and sent to every source at once. The Sources page shows each source's real status and an activity log. Results are cached for 6 hours; "Fresh search" refetches.
4. **Review matches**: score 0-100 with reasons, matched and missing skills, filters, sorting, details page, original application link, save, and application tracking with notes.
5. **Resume and ATS score** page: an ATS-readiness score with a checklist of what to fix, the resume itself editable in place (click any text), 32 templates in five categories (Simple, Modern, Bold header, Two-column, With photo) with live previews, plus a suggested ATS-friendly template, **Save as PDF** (browser print window) and **Download Word** (.docx). Anything you download can be uploaded again. The score is an estimate of how parser-friendly the resume is, not any company's real ATS score.
6. **Naukri, LinkedIn, Indeed, Glassdoor, Foundit, Hirist, iimjobs, Shine, Wellfound, Instahyre, Cutshort** have no public API and forbid automated reading, so the website itself never touches them. Install the Chrome extension once (Sources page). Then click **Search** next to a portal (or **Search portals** on the Overview page): the extension opens that portal's search page **in your own browser and login**, reads the listings, closes the tab, and the jobs appear in this app, scored and ranked, with the original link. One page per click. If a portal shows a login or verification page its tab is brought to the front: finish it yourself and search again; nothing tries to get past it.

## Sources
| Source | Status |
|---|---|
| Greenhouse, Lever, Ashby, SmartRecruiters boards | Verified live from a browser (Greenhouse, Lever, Ashby, SmartRecruiters). Add boards as `ats:token` lines in Settings. |
| Remotive, Jobicy, Arbeitnow, RemoteOK | Verified live from a browser. Mostly remote or international roles. |
| Adzuna (India) | Needs your own free key. From its documentation only, unverified. |
| Naukri, LinkedIn, Indeed, Glassdoor, Foundit, Hirist, iimjobs, Shine, Wellfound, Instahyre, Cutshort | Through the extension in your own browser. The flow is tested end to end against fixture pages; each portal's real page markup and search link is unverified until you try it (use Diagnose). |
| Workday, The Muse | Not supported (no stable public API / blocks browser requests). |

## Optional AI
Settings: add your own Claude or OpenAI key for better profile extraction and query suggestions (the key stays in your browser; your resume text goes to that provider). Turn on **Semantic matching** to compare job descriptions to your experience by meaning with an on-device model (one-time ~25 MB download); it falls back to word overlap if it cannot load.

## Develop
```bash
npm install
npm test            # unit tests (engine + extension extractors)
npm run typecheck
npm run build
npm run e2e         # Playwright end-to-end on the built site, including the extension (npx playwright install chromium first)
npm run dev         # http://localhost:5173
```
No environment variables: keys are entered in the UI. CI (`.github/workflows/ci.yml`) runs all of the above; pushes to `main` deploy to Pages.

## Rules the code enforces
- Every stored job has a source and an https original URL, or it is rejected and counted. No mock data: test fixtures live only in test files.
- A source that fails is reported as failed; an unconfigured or manual source is never shown as working. One failing source never stops the others.
- Duplicates (same company+title+location, canonical URL, source job id, or near-identical text in the same place) collapse into one job that keeps every source link.
- Location and salary are filters, not part of the professional fit score. A skill missing from the resume is "not found", never "you lack it".

## What the resume reader understands
Word files (tab columns, soft line breaks, layout tables), PDFs (single and two-column) and TXT. It reads the Objective/Summary, Skills (with sub-labels such as `Front-End Skills:` and `Soft Skills:`), Experience and Internships (including `Aug` on one line and `2023` on the next), Projects (`Description:` and `Tools & technologies used:`), Education (degree, institution, year, grade or percentage, including 10th/12th), Certifications, links, and Extra-curricular, Hobbies, Interests and Languages as written. Personal details (father's name, date of birth) and the Declaration are left out on purpose. For a fresher with no job history, search titles are suggested from the resume's own objective, areas of interest and skills, and you can edit them.

## Known limits
- No accounts, no scheduled daily search (needs a server): optional refresh-on-open instead. Data lives in one browser.
- Skills in postings are recognised from a built-in vocabulary (about 300 tech, professional and soft-skill terms) plus your own skills, so postings in unusual fields may show "no recognisable skills" and a neutral skill score.
- Resume parsing is rule-based and tuned for conventional layouts; scanned-image PDFs and old `.doc` files are not supported.
- Optional AI calls from a browser depend on each provider's CORS policy (unverified without a key). The semantic model download is unverified from the build sandbox.
- Free job APIs skew to remote and international roles; Indian coverage needs Adzuna or the extension.
