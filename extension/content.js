// Adds a small panel on supported portals. Nothing is read until you click Send; nothing loads pages for you.
const S = globalThis.JobAgentSites;
if (S.siteFor(location.hostname, location.pathname) && !document.getElementById('jobagent-panel')) {
  // The Job Agent app can ask this page for its listings (it opened the tab because YOU clicked Search there).
  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (m?.type !== 'extract') return;
    const { jobs } = S.extract(document, location);
    reply(jobs.length ? { jobs } : { jobs: [], blocked: S.blocked(document, location) });
  });

  const panel = Object.assign(document.createElement('div'), { id: 'jobagent-panel' });
  panel.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;display:flex;gap:6px;align-items:center;font:600 13px system-ui';
  const mk = (label, bg, fg) => Object.assign(document.createElement('button'), { textContent: label, style: `padding:9px 13px;border:0;border-radius:8px;cursor:pointer;font:inherit;background:${bg};color:${fg};box-shadow:0 4px 14px rgba(0,0,0,.25)` });
  const send = mk('Send to Job Agent', 'linear-gradient(100deg,#ea5420,#f59e0b)', '#1b0d06'), diag = mk('Diagnose', '#1f2433', '#e8ecf3');
  const reset = () => setTimeout(() => { send.textContent = 'Send to Job Agent'; diag.textContent = 'Diagnose'; }, 5000);

  send.onclick = () => {
    const { jobs, via } = S.extract(document, location);
    if (!jobs.length) { send.textContent = 'Found nothing on this page. Try Diagnose.'; return reset(); }
    const done = r => { send.textContent = r ? `Collected ${jobs.length} (${r.total} waiting). Open Job Agent to import.` : 'Failed'; console.debug('[Job Agent] via', via); reset(); };
    try { chrome.runtime.sendMessage({ type: 'add', jobs }, done); } catch { send.textContent = 'Extension was reloaded. Refresh this page (F5) and click again.'; reset(); }
  };
  diag.onclick = async () => {
    const out = S.diagnose(document, location);
    try { await navigator.clipboard.writeText(out); diag.textContent = 'Copied. Paste it to your developer.'; }
    catch { const t = Object.assign(document.createElement('textarea'), { value: out }); document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); diag.textContent = 'Copied.'; }
    reset();
  };
  panel.append(send, diag); document.body.append(panel);
}
