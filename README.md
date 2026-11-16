# Job Agent

Resume in, ranked jobs out. Runs entirely in your browser: **https://keerthi17072000.github.io/Job_agent/**

Your resume and jobs are stored in your own browser (localStorage) and never uploaded. No API key, no server, no cost.

## Use it
1. Upload a PDF, DOCX or TXT resume. A free rule-based parser extracts skills, experience, designations, location and education. Check the result and edit target roles under Search preferences.
2. Under "Company career pages" add boards, e.g. `greenhouse:stripe`, `lever:palantir`, `ashby:ashby`, `smartrecruiters:<companyId>` (the token is the last part of the company's job board URL). Click **Search jobs**. The Job sources panel shows whether each source was read or failed.
3. For Naukri and LinkedIn (which forbid automation) install the extension: `chrome://extensions`, Developer mode, Load unpacked, pick `extension/`. Open the portal's job list in your own logged-in tab, click **Send to Job Agent**, then click **Import from extension** in the app.

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
- Career-page search is verified live for Greenhouse and Lever only (one board each). Ashby and SmartRecruiters field mappings are from documentation.
- Naukri and LinkedIn selectors in the extension are unverified; the extension collects list cards only, so those jobs lack descriptions and score weakly.
- Hirist, iimjobs, Foundit, Shine, Indeed, Glassdoor, Wellfound, Instahyre, Cutshort have no extension support yet. Workday is not supported.
- Resume parsing is rule-based: about 100 known technologies, no project extraction. Storage is capped (2000 characters of description per job).
