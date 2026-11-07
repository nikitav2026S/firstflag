// `npm run dev`: API server with auto-restart + Vite dev server, one terminal.
import { spawn } from "node:child_process";

const procs = [
  spawn(process.execPath, ["--watch", "--disable-warning=ExperimentalWarning", "server/index.mjs"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "web/vite.config.mjs"], { stdio: "inherit" }),
];
const stop = () => { procs.forEach((p) => p.kill()); process.exit(); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
