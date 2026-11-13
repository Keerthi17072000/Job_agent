# Job Agent

Local job-search agent: resume in, ranked jobs out. Everything stays on your machine in `jobs.db`. Resume parsing is free and offline. No API key is needed.

```bash
npm install && npx playwright install chromium && npm run build
npm start      # http://127.0.0.1:3000
# optional, paid, more accurate resume parsing: set ANTHROPIC_API_KEY first
npm test
```

1. Upload a PDF/DOCX/TXT resume. Check the extracted profile and the Search preferences it pre-fills.
2. Under "Company career pages" add boards, e.g. `greenhouse:stripe`, `lever:palantir`, `ashby:ashby`, `smartrecruiters:<companyId>`. The token is the last part of the company's job board URL.
3. Click **Search jobs**. The Job sources panel shows, per source, whether it was read, blocked, manual or errored. Nothing is skipped silently.
4. Portals that forbid automation or sit behind login/bot protection (Naukri, LinkedIn, Indeed, Glassdoor, Wellfound, Instahyre, Cutshort) are never opened by the server. Load `extension/` in Chrome (chrome://extensions, Developer mode, Load unpacked), open the portal's job list in your own logged-in tab and click **Send to Job Agent**.

## Rules the code enforces
- Every stored job has a source and an https original URL, or it is rejected and counted.
- No mock data. Test fixtures live only in `server/server.test.ts` and in-memory DBs.
- Playwright adapters (Hirist, iimjobs, Foundit, Shine) check robots.txt, stop on login walls/CAPTCHA/HTTP errors, and never try to get past them.
- Duplicates: same company+title+location, or same canonical URL.

## Not verified yet
Nothing has run against a live site. Portal policies, search URLs, extension selectors and the SmartRecruiters field names come from documentation and memory. Workday and Indeed/Glassdoor/Wellfound-style auto-search are not implemented.

## Site
`site/` is a static roadmap page published with GitHub Pages (`.github/workflows/pages.yml`). The app itself cannot run on Pages: it needs the Node server, SQLite and a local browser.
