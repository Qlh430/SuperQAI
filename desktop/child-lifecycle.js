"use strict";
function stopChild(child, timeoutMs = 15_000) {
  if (!child || child.exitCode !== null || child.signalCode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(Error("服务未能及时退出，已取消更新。请稍后重试。")); }, timeoutMs);
    function cleanup() { clearTimeout(timer); child.removeListener("exit", done); child.removeListener("error", failed); }
    function done() { cleanup(); resolve(); }
    function failed(error) { cleanup(); reject(error); }
    child.once("exit", done); child.once("error", failed);
    // Windows SIGTERM terminates immediately; IPC lets the server flush SQLite and close workers.
    if (child.connected) child.send({type:"ai-os.shutdown"}, error => { if (error) failed(error); });
    else child.kill("SIGTERM");
  });
}
module.exports = { stopChild };
