// Runs on the Job Agent page only: hands collected listings to the page when it asks.
window.addEventListener('message', e => {
  if (e.source !== window || e.data?.type !== 'jobagent-pull') return;
  chrome.runtime.sendMessage({ type: 'take' }, r => window.postMessage({ type: 'jobagent-jobs', jobs: r?.jobs ?? [] }, location.origin));
});
