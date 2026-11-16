# Job Agent

Resume in, ranked jobs out. Runs entirely in your browser: **https://keerthi17072000.github.io/Job_agent/**

Your resume and jobs are stored in your own browser (localStorage) and never uploaded. No API key, no server, no cost.

## Use it
1. Upload a PDF, DOCX or TXT resume. A free rule-based parser extracts skills, experience, designations, location and education. Check the result and edit your target roles under Preferences.
2. Click **Search jobs**. It searches several sources at once and the Sources panel shows, per source, whether it was read or why it failed:
   - Company career pages: Greenhouse, Lever, Ashby and SmartRecruiters boards. Add them as `ats:token` lines (e.g. `greenhouse:stripe`, `lever:cred`) or click "Fill with example boards".
   - Public job-board APIs: Remotive, Jobicy, Arbeitnow, RemoteOK (remote and international roles).
   - Adzuna India: optional, needs your own free key from developer.adzuna.com (Preferences).
3. Naukri and LinkedIn forbid automated reading, so the app never opens them. Install the extension (`chrome://extensions`, Developer mode, Load unpacked, pick `extension/`), click **Send to Job Agent** on a job list in your own logged-in tab, then click **Import from extension** in the app.

## Rules the code enforces
- Every stored job has a source and an https original URL, or it is rejected and counted.
- No mock data. Test inputs live only in `engine/engine.test.ts`.
- Duplicates: same company+title+location, or same canonical URL.
- The app never opens or scrapes portals itself.

## Develop
```bash
npm install && npm test && npm run dev    # http://localhost:5173
```
`engine/` is the shared logic (parser, matcher, dedupe, career-page mappers); `web/` is the React app; `extension/` is the Chrome extension. The extension is allow-listed for this site's URL and `http://127.0.0.1:5173/`; edit `extension/manifest.json` if you host it elsewhere.

## Not verified / not built
- Verified live from a browser: Greenhouse, Lever, Ashby, SmartRecruiters, Remotive, Jobicy, Arbeitnow and RemoteOK (CORS and response shape). Adzuna is from its documentation only.
- Most free APIs list remote or international jobs. For Indian listings use Adzuna or the extension.
- Naukri and LinkedIn selectors in the extension are unverified; the extension collects list cards only, so those jobs lack descriptions and score weakly.
- Hirist, iimjobs, Foundit, Shine, Indeed, Glassdoor, Wellfound, Instahyre, Cutshort have no extension support yet. Workday and The Muse (blocks browser requests) are not supported.
- Resume parsing is rule-based: about 100 known technologies, no project extraction. Storage is capped (2000 characters of description per job).
