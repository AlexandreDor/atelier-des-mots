import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Use the kernel's advisory lock rather than a removable lock directory: the
// lock is released on process exit, including SIGKILL, without stale-PID races.
// The helper keeps the lock only while its parent's stdin pipe stays open.
export async function withDictionaryDataLock(action, dataDirectory) {
  const holder = spawn("flock", [
    "--exclusive", "--wait", "30", "--no-fork",
    fileURLToPath(new URL(".dictionary-data.lock", dataDirectory)),
    process.execPath, "--input-type=module", "--eval",
    'process.stdout.write("locked\\n"); process.stdin.resume();',
  ], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  holder.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-2000); });
  // A helper that exits before acquiring the lock may close its pipe first.
  holder.stdin.on("error", () => {});
  const stopped = new Promise((resolve) => {
    holder.once("error", (error) => resolve({ error }));
    holder.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const locked = new Promise((resolve, reject) => {
    holder.stdout.once("data", () => resolve());
    void stopped.then(({ error, code, signal }) => reject(new Error(
      `Impossible de verrouiller les corpus (flock, délai de 30 s) : ${error?.message || stderr.trim() || signal || code}`,
    )));
  });
  try {
    await locked;
    return await action();
  } finally {
    holder.stdin.end();
    await stopped;
  }
}
