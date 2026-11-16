// Runs only in the user's own logged-in tab and only when the user clicks the button:
// no crawling, no automated page loads. Selectors are unverified against the live sites.
const text = (e, sel) => e.querySelector(sel)?.textContent.trim();
const SITES = {
  'www.naukri.com': {
    source: 'naukri', card: '.srp-jobtuple-wrapper',
    read: e => ({ title: text(e, 'a.title'), url: e.querySelector('a.title')?.href, company: text(e, '.comp-name'),
      location: text(e, '.loc-wrap'), exp: text(e, '.exp-wrap'), skills: [...e.querySelectorAll('.tags-gt li')].map(l => l.textContent.trim()) }),
  },
  'www.linkedin.com': {
    source: 'linkedin', card: '.job-card-container',
    read: e => ({ title: text(e, '.job-card-list__title'), url: e.querySelector('a.job-card-container__link')?.href,
      company: text(e, '.artdeco-entity-lockup__subtitle'), location: text(e, '.job-card-container__metadata-item'), exp: '', skills: [] }),
  },
}[location.hostname];

const btn = Object.assign(document.createElement('button'), { textContent: 'Send to Job Agent' });
btn.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;padding:10px 14px;background:#0f6e6e;color:#fff;border:0;border-radius:6px;font:600 14px system-ui;cursor:pointer';
btn.onclick = () => {
  const jobs = [...document.querySelectorAll(SITES.card)].map(e => ({ ...SITES.read(e), source: SITES.source })).filter(j => j.title && j.url);
  btn.textContent = 'Collecting…';
  chrome.runtime.sendMessage({ type: 'add', jobs }, r => { btn.textContent = r ? `Collected ${r.received} (${r.total} waiting). Now click Import in Job Agent.` : 'Failed'; setTimeout(() => btn.textContent = 'Send to Job Agent', 5000); });
};
document.body.append(btn);
