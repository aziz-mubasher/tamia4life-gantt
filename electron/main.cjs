"use strict";

/**
 * Legacy Render start path — forwards to the web server.
 * Update Render Start Command to: node server.js
 * Desktop Electron app: desktop/electron/
 */
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const child = spawn(process.execPath, ["server.js"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
