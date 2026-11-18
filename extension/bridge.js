// Runs on the Job Agent page only. Relays between the page and the extension: collected listings, "is the extension here?", and portal searches.
// After the extension is reloaded, pages opened before that keep a dead connection; say so instead of throwing.
const ask = (msg, cb, fail) => { try { chrome.runtime.sendMessage(msg, cb); } catch { fail(); } };
window.addEventListener('message', e => {
  if (e.source !== window || !e.data) return;
  const d = e.data, back = payload => window.postMessage({ type: 'jobagent-reply', id: d.id, ...payload }, location.origin);
  if (d.type === 'jobagent-pull') ask({ type: 'take' }, r => window.postMessage({ type: 'jobagent-jobs', jobs: r?.jobs ?? [] }, location.origin), () => {});
  else if (d.type === 'jobagent-ping') { try { back({ ok: true, version: chrome.runtime.getManifest().version }); } catch { /* extension reloaded: stays undetected until the page is refreshed */ } }
  else if (d.type === 'jobagent-search' && typeof d.url === 'string') ask({ type: 'search', url: d.url }, r => back(r ?? { jobs: [], error: `The extension did not answer${chrome.runtime.lastError ? ': ' + chrome.runtime.lastError.message : ''}.` }), () => back({ jobs: [], error: 'The extension was reloaded. Refresh this page (F5) and try again.' }));
});
