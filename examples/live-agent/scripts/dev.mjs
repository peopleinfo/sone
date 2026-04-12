import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const API_PORT = process.env.LIVE_AGENT_API_PORT || "5174";
const FRONTEND_PORT = process.env.LIVE_AGENT_FRONTEND_PORT || "5173";
const HOST = process.env.LIVE_AGENT_HOST || "127.0.0.1";
const viteBin = resolve("node_modules", "vite", "bin", "vite.js");

const children = new Set();
let shuttingDown = false;

function start(label, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      LIVE_AGENT_API_PORT: API_PORT,
      LIVE_AGENT_API_HOST: HOST,
      LIVE_AGENT_FRONTEND_PORT: FRONTEND_PORT,
    },
    ...options,
  });

  children.add(child);

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;

    const reason = signal || (code ?? 0);
    console.error(`${label} exited (${reason}); stopping live-agent dev.`);
    shutdown(code || 1);
  });

  return child;
}

function terminate(child) {
  if (child.killed) return;

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }

  child.kill("SIGTERM");
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    terminate(child);
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 500).unref();
}

console.log(`Starting live-agent API on http://${HOST}:${API_PORT}`);
start("api", process.execPath, ["server/index.mjs"]);

console.log(`Starting live-agent frontend on http://${HOST}:${FRONTEND_PORT}`);
start("vite", process.execPath, [
  viteBin,
  "--host",
  HOST,
  "--port",
  FRONTEND_PORT,
]);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
