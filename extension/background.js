// Listings wait in extension storage until the Job Agent page asks for them.
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  chrome.storage.local.get({ pending: [] }).then(({ pending }) => {
    if (msg.type === 'add') { chrome.storage.local.set({ pending: pending.concat(msg.jobs) }); reply({ received: msg.jobs.length, total: pending.length + msg.jobs.length }); }
    else if (msg.type === 'take') { chrome.storage.local.set({ pending: [] }); reply({ jobs: pending }); }
  });
  return true;
});
