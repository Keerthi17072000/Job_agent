// Reads job listings from the page the user is looking at. Runs only when the user clicks the button.
// Strategies in order: schema.org JobPosting JSON-LD, per-portal card selectors, generic job-link fallback.
// Selectors and URL patterns are from public knowledge and UNVERIFIED against the live sites: use Diagnose when one captures nothing.
(() => {
  const text = (e, sel) => (sel && e.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim();
  const abs = (h, base) => { try { return new URL(h, base).href; } catch { return ''; } };
  const key = u => u.split(/[?#]/)[0];

  const SITES = {
    'naukri.com': { source: 'naukri', card: '.srp-jobtuple-wrapper, .jobTuple', title: 'a.title', company: '.comp-name', location: '.loc-wrap', exp: '.exp-wrap', salary: '.sal-wrap', skills: '.tags-gt li', jobUrl: /naukri\.com\/job-listings/ },
    'linkedin.com': { source: 'linkedin', card: '.job-card-container, .jobs-search-results__list-item', title: 'a.job-card-container__link, .job-card-list__title', company: '.artdeco-entity-lockup__subtitle', location: '.job-card-container__metadata-item', jobUrl: /linkedin\.com\/jobs\/view/ },
    'indeed.com': { source: 'indeed', card: '.job_seen_beacon, .jobsearch-SerpJobCard', title: 'h2.jobTitle a, a.jcs-JobTitle', company: '[data-testid="company-name"]', location: '[data-testid="text-location"]', jobUrl: /indeed\.com\/(rc\/clk|viewjob|pagead)/ },
    'glassdoor.co.in': { source: 'glassdoor', card: 'li[data-test="jobListing"]', title: 'a[data-test="job-title"]', company: '[class*="EmployerProfile_compactEmployerName"]', location: '[data-test="emp-location"]', jobUrl: /glassdoor\.[a-z.]+\/(job-listing|partner)/ },
    'glassdoor.com': { source: 'glassdoor', card: 'li[data-test="jobListing"]', title: 'a[data-test="job-title"]', company: '[class*="EmployerProfile_compactEmployerName"]', location: '[data-test="emp-location"]', jobUrl: /glassdoor\.[a-z.]+\/(job-listing|partner)/ },
    'foundit.in': { source: 'foundit', card: '.srpResultCard, .cardContainer', title: '.jobTitle, .card-title', company: '.companyName', location: '.locWdth, .location', jobUrl: /foundit\.in\/(job|seeker)/ },
    'hirist.tech': { source: 'hirist', card: '[class*="job-card"], [class*="jobCard"]', jobUrl: /hirist\.tech\/j\// },
    'iimjobs.com': { source: 'iimjobs', card: '[class*="job-card"], [class*="jobCard"]', jobUrl: /iimjobs\.com\/j\// },
    'shine.com': { source: 'shine', card: '.jobCard, .job_listing', jobUrl: /shine\.com\/jobs\// },
    'wellfound.com': { source: 'wellfound', card: '[class*="jobListing"], [class*="job-listing"]', jobUrl: /wellfound\.com\/(jobs|company\/[^/]+\/jobs)\// },
    'instahyre.com': { source: 'instahyre', card: '[class*="employer-block"], [class*="job-card"]', jobUrl: /instahyre\.com\/job-/ },
    'cutshort.io': { source: 'cutshort', card: '[class*="job-card"], [class*="jobCard"]', jobUrl: /cutshort\.io\/job\// },
  };
  const siteFor = host => { const k = Object.keys(SITES).find(k => host === k || host.endsWith('.' + k)); return k ? SITES[k] : null; };

  function postings(doc) {
    const out = [];
    const walk = n => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== 'object') return;
      if ([n['@type']].flat().includes('JobPosting')) out.push(n);
      walk(n['@graph']); walk(n.itemListElement); walk(n.item);
    };
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) { try { walk(JSON.parse(s.textContent)); } catch { /* malformed block */ } }
    return out;
  }
  const fromLd = (p, site, page) => {
    const a = [p.jobLocation].flat()[0]?.address;
    return { source: site.source, title: p.title || '', company: p.hiringOrganization?.name || '', url: p.url || (site.jobUrl.test(page) ? page : ''),
      location: [a?.addressLocality, a?.addressRegion].filter(x => typeof x === 'string').join(', '), description: p.description || '', postedAt: p.datePosted || '', deadline: p.validThrough || '', exp: '', skills: [] };
  };
  const fromCards = (doc, site, base) => !site.card ? [] : [...doc.querySelectorAll(site.card)].map(e => ({
    source: site.source, title: text(e, site.title), url: abs(e.querySelector(site.title || 'a')?.getAttribute('href'), base), company: text(e, site.company),
    location: text(e, site.location), exp: text(e, site.exp), salary: text(e, site.salary), skills: site.skills ? [...e.querySelectorAll(site.skills)].map(l => l.textContent.trim()) : [], description: '',
  }));

  const NOISE = /^(apply|apply now|easy apply|save|saved|promoted|new|viewed|actively hiring|be an early applicant|share|hide)$/i;
  const leaves = el => [...el.querySelectorAll('*')].filter(e => !e.children.length).map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
  function jobLinks(doc, site, base) {
    return [...doc.querySelectorAll('a[href]')].map(a => ({ a, url: abs(a.getAttribute('href'), base) })).filter(x => site.jobUrl.test(x.url) && x.a.textContent.trim().length > 3);
  }
  const cardBox = (a, k, links, doc) => { // climb while the parent holds no other job's link
    let box = a;
    while (box.parentElement && box.parentElement !== doc.body && !links.some(l => key(l.url) !== k && box.parentElement.contains(l.a))) box = box.parentElement;
    return box;
  };
  function generic(doc, site, base) {
    const links = jobLinks(doc, site, base), seen = new Set(), out = [];
    for (const { a, url } of links) {
      const k = key(url); if (seen.has(k)) continue; seen.add(k);
      const title = a.textContent.replace(/\s+/g, ' ').trim();
      const rest = [...new Set(leaves(cardBox(a, k, links, doc)))].filter(t => t !== title && !NOISE.test(t) && t.length < 90);
      out.push({ source: site.source, title, url, company: rest[0] || '', exp: rest.find(t => /\d+\s*-\s*\d+\s*(yrs?|years)/i.test(t)) || '',
        location: rest.find(t => /,|remote|hybrid|india|bengaluru|bangalore|mumbai|delhi|pune|hyderabad|chennai|gurgaon|noida/i.test(t) && t !== rest[0]) || '', skills: [], description: '' });
    }
    return out;
  }

  /** All jobs found on this page, with which strategy produced them. */
  function extract(doc, loc) {
    const site = siteFor(loc.hostname);
    if (!site) return { jobs: [], via: { unsupported: 1 } };
    const base = loc.href, ld = postings(doc).map(p => fromLd(p, site, base)).filter(j => j.title && j.url);
    let cards = fromCards(doc, site, base).filter(j => j.title && j.url && j.company), via = 'cards';
    if (!cards.length) { cards = generic(doc, site, base); via = 'generic'; }
    const seen = new Set(), jobs = [...ld, ...cards].filter(j => { const k = key(j.url); if (seen.has(k)) return false; seen.add(k); return true; });
    return { jobs, via: { jsonld: ld.length, [via]: cards.length } };
  }

  // Structure only: tag, class, data-*, text LENGTH instead of text. Safe to paste into a bug report.
  const sketch = (el, d = 0) => {
    if (d > 6) return '';
    const attrs = [...el.attributes].filter(a => /^(class|id|role|data-[\w-]+)$/.test(a.name)).map(a => `${a.name}="${a.value.slice(0, 70)}"`).join(' ');
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('').length;
    const t = el.tagName.toLowerCase();
    return `<${t}${attrs ? ' ' + attrs : ''}>${own ? `[${own}c]` : ''}${[...el.children].map(c => sketch(c, d + 1)).join('')}</${t}>`;
  };
  function diagnose(doc, loc) {
    const site = siteFor(loc.hostname);
    if (!site) return `Unsupported host ${loc.hostname}`;
    const base = loc.href, links = jobLinks(doc, site, base);
    const first = (site.card && doc.querySelector(site.card)) || (links[0] && cardBox(links[0].a, key(links[0].url), links, doc));
    const paths = [...new Set([...doc.querySelectorAll('a[href]')].map(a => { try { return new URL(a.href).pathname.replace(/[0-9a-f-]{8,}|\d+/gi, '#').split('/').slice(0, 3).join('/'); } catch { return ''; } }))].slice(0, 15);
    return [`host: ${loc.hostname}`, `page: ${loc.pathname}`, `jsonld postings: ${postings(doc).length}`, `selector cards: ${site.card ? doc.querySelectorAll(site.card).length : 0}`, `job links: ${links.length}`,
      `link path shapes: ${paths.join(' ')}`, `first card: ${first ? sketch(first).slice(0, 4000) : 'none found'}`].join('\n');
  }

  const api = { extract, diagnose, siteFor, SITES };
  globalThis.JobAgentSites = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
