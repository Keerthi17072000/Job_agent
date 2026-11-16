// Job portals the app knows about. A web page cannot open other sites, so none of these is read directly:
// jobs from them arrive through the browser extension, from the page you are viewing, when you click it.
// Notes reflect what is publicly known and must be re-verified before relying on them.
export interface Portal { id: string; name: string; note: string }

export const PORTALS: Portal[] = [
  { id: 'naukri', name: 'Naukri', note: 'Terms prohibit automated access and the site uses bot protection. Send listings with the browser extension.' },
  { id: 'linkedin', name: 'LinkedIn Jobs', note: 'No public job-search API and the terms prohibit automation. Send listings with the browser extension.' },
  { id: 'indeed', name: 'Indeed', note: 'No public search API and the terms prohibit scraping. Extension support not built yet.' },
  { id: 'glassdoor', name: 'Glassdoor', note: 'Login wall and terms prohibit scraping. Extension support not built yet.' },
  { id: 'wellfound', name: 'Wellfound', note: 'Login and bot protection. Extension support not built yet.' },
  { id: 'instahyre', name: 'Instahyre', note: 'Jobs are visible only after login. Extension support not built yet.' },
  { id: 'cutshort', name: 'Cutshort', note: 'Jobs are visible only after login. Extension support not built yet.' },
  { id: 'hirist', name: 'Hirist', note: 'Not readable from a web page. Extension support not built yet.' },
  { id: 'iimjobs', name: 'iimjobs', note: 'Not readable from a web page. Extension support not built yet.' },
  { id: 'foundit', name: 'Foundit', note: 'Not readable from a web page. Extension support not built yet.' },
  { id: 'shine', name: 'Shine', note: 'Not readable from a web page. Extension support not built yet.' },
];
export const portalName = (id: string) => PORTALS.find(p => p.id === id)?.name ?? id;
