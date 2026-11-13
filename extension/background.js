// Content scripts can't call localhost across origins; the service worker can (host_permissions).
chrome.runtime.onMessage.addListener((jobs, _s, reply) => {
  fetch('http://127.0.0.1:3000/api/ingest', { method: 'POST', body: JSON.stringify(jobs) })
    .then(r => r.json()).then(reply).catch(e => reply({ error: e.message }));
  return true;
});
