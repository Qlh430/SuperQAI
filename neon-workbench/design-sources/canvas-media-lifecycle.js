"use strict";
const { AsyncLocalStorage } = require("node:async_hooks");
const context = new AsyncLocalStorage();
let tail = Promise.resolve();
function withMediaMutation(action) {
  if (context.getStore()?.active) return Promise.resolve().then(action);
  const next = tail.then(() => {
    const token = { active: true };
    return context.run(token, async () => {
      try { return await action(); } finally { token.active = false; }
    });
  });
  tail = next.catch(() => {});
  return next;
}
module.exports = { withMediaMutation };
