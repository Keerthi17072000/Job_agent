// Runs on the Job Agent page only. Relays between the page and the extension: collected listings, "is the extension here?", and portal searches.
window.addEventListener('message', e => {
  if (e.source !== window || !e.data) return;
  const d = e.data, back = payload => window.postMessage({ type: 'jobagent-reply', id: d.id, ...payload }, location.origin);
  if (d.type === 'jobagent-pull') chrome.runtime.sendMessage({ type: 'take' }, r => window.postMessage({ type: 'jobagent-jobs', jobs: r?.jobs ?? [] }, location.origin));
  else if (d.type === 'jobagent-ping') back({ ok: true, version: chrome.runtime.getManifest().version });
  else if (d.type === 'jobagent-search' && typeof d.url === 'string') chrome.runtime.sendMessage({ type: 'search', url: d.url }, r => back(r ?? { jobs: [], error: 'The extension did not answer.' }));
});
