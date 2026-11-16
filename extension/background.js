// Listings wait in extension storage until the Job Agent page asks for them. The badge shows how many are waiting.
const key = u => u.split(/[?#]/)[0];
const badge = n => chrome.action.setBadgeText({ text: n ? String(n) : '' });
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  chrome.storage.local.get({ pending: [] }).then(({ pending }) => {
    if (msg.type === 'add') {
      const have = new Set(pending.map(j => key(j.url)));
      const next = pending.concat(msg.jobs.filter(j => !have.has(key(j.url))));
      chrome.storage.local.set({ pending: next }); badge(next.length); reply({ received: msg.jobs.length, total: next.length });
    } else if (msg.type === 'take') { chrome.storage.local.set({ pending: [] }); badge(0); reply({ jobs: pending }); }
  });
  return true;
});
