// Listings wait in extension storage until the Job Agent page asks for them. The badge shows how many are waiting.
const key = u => { const [p, q = ''] = u.split('#')[0].split('?'), j = /(?:^|&)job=([^&]*)/.exec(q); return p + (j ? '?job=' + j[1] : ''); };
const badge = n => chrome.action.setBadgeText({ text: n ? String(n) : '' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOSTS = chrome.runtime.getManifest().content_scripts[0].matches.map(m => new URL(m.replace('*.', 'www.').replace(/\*$/, '')).hostname.replace(/^www\./, ''));
const allowed = url => { try { const u = new URL(url); return u.protocol === 'https:' && HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h)); } catch { return false; } };

// One portal page per request, one at a time. The user clicked Search in the app, so this is user-directed browsing in their own
// logged-in browser. If the site shows a login or CAPTCHA the tab is brought to the front and we stop: we never get past it.
let queue = Promise.resolve();
const runSearch = url => queue = queue.catch(() => {}).then(async () => {
  const tab = await chrome.tabs.create({ url, active: false });
  let result = { jobs: [] };
  for (let i = 0; i < 20; i++) { // up to ~30 s for the page to render
    await sleep(1500);
    try { const r = await chrome.tabs.sendMessage(tab.id, { type: 'extract' }); if (r?.jobs?.length) { result = { jobs: r.jobs }; break; } if (r?.blocked) { result = { jobs: [], blocked: r.blocked }; break; } } catch { /* page still loading */ }
  }
  if (result.blocked) await chrome.tabs.update(tab.id, { active: true }); else await chrome.tabs.remove(tab.id).catch(() => {});
  if (!result.jobs.length && !result.blocked) result.error = 'No listings were found on the page (no results, or a layout this extension does not recognise yet).';
  return result;
});

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg.type === 'search') {
    if (!allowed(msg.url)) { reply({ jobs: [], error: 'That address is not a supported portal.' }); return; }
    runSearch(msg.url).then(reply, e => reply({ jobs: [], error: `Search failed: ${e.message}` }));
    return true;
  }
  chrome.storage.local.get({ pending: [] }).then(({ pending }) => {
    if (msg.type === 'add') {
      const have = new Set(pending.map(j => key(j.url)));
      const next = pending.concat(msg.jobs.filter(j => !have.has(key(j.url))));
      chrome.storage.local.set({ pending: next }); badge(next.length); reply({ received: msg.jobs.length, total: next.length });
    } else if (msg.type === 'take') { chrome.storage.local.set({ pending: [] }); badge(0); reply({ jobs: pending }); }
  });
  return true;
});

// Careers pages are too many to list in the manifest. Clicking the toolbar icon on any page (the user's choice, via activeTab) adds the Send panel to that page.
chrome.action.onClicked.addListener(async tab => {
  try {
    if (!tab.id || !/^https:/.test(tab.url || '')) throw new Error('only https pages');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { globalThis.JobAgentForce = true; } });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['sites.js', 'content.js'] });
  } catch { chrome.action.setBadgeText({ tabId: tab.id, text: '!' }); setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }), 2500); }
});
