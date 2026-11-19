// Job portals the app knows about. A web page cannot open or read other sites: the app only opens each
// portal's search page in YOUR tab, and the browser extension reads the results you are looking at when you click it.
// Search URL patterns are from public knowledge and unverified until used; fix here if a link lands on the wrong page.
export interface Portal { id: string; name: string; note: string; extension: boolean; searchUrl: (role: string, location: string) => string }

const q = encodeURIComponent;
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const inLoc = (l: string) => l ? `-in-${slug(l)}` : '';

export const PORTALS: Portal[] = [
  { id: 'naukri', name: 'Naukri', extension: true, note: 'Terms prohibit automated access and the site uses bot protection.', searchUrl: (r, l) => `https://www.naukri.com/${slug(r)}-jobs${inLoc(l)}` },
  { id: 'linkedin', name: 'LinkedIn Jobs', extension: true, note: 'No public job-search API and the terms prohibit automation.', searchUrl: (r, l) => `https://www.linkedin.com/jobs/search/?keywords=${q(r)}&location=${q(l || 'India')}` },
  { id: 'indeed', name: 'Indeed', extension: true, note: 'No public search API and the terms prohibit scraping.', searchUrl: (r, l) => `https://in.indeed.com/jobs?q=${q(r)}&l=${q(l)}` },
  { id: 'glassdoor', name: 'Glassdoor', extension: true, note: 'Login wall and terms prohibit scraping.', searchUrl: (r, l) => `https://www.glassdoor.co.in/Job/jobs.htm?sc.keyword=${q(r)}&locKeyword=${q(l)}` },
  { id: 'foundit', name: 'Foundit', extension: true, note: 'Not readable from a web page.', searchUrl: (r, l) => `https://www.foundit.in/srp/results?query=${q(r)}&locations=${q(l)}` },
  { id: 'hirist', name: 'Hirist', extension: true, note: 'Not readable from a web page.', searchUrl: r => `https://www.hirist.tech/search/${slug(r)}` },
  { id: 'iimjobs', name: 'iimjobs', extension: true, note: 'Not readable from a web page.', searchUrl: r => `https://www.iimjobs.com/search/${slug(r)}` },
  { id: 'shine', name: 'Shine', extension: true, note: 'Not readable from a web page.', searchUrl: (r, l) => `https://www.shine.com/job-search/${slug(r)}-jobs${inLoc(l)}` },
  { id: 'wellfound', name: 'Wellfound', extension: true, note: 'Login and bot protection.', searchUrl: r => `https://wellfound.com/role/${slug(r)}` },
  { id: 'instahyre', name: 'Instahyre', extension: true, note: 'Jobs are visible only after login.', searchUrl: r => `https://www.instahyre.com/search-jobs/?job_title=${q(r)}` },
  { id: 'cutshort', name: 'Cutshort', extension: true, note: 'Jobs are visible only after login.', searchUrl: r => `https://cutshort.io/jobs?query=${q(r)}` },
];
export const portalName = (id: string) => id === 'careers' ? 'Careers page' : PORTALS.find(p => p.id === id)?.name ?? id;
