#!/usr/bin/env node
require("dotenv").config();
const { spawnSync } = require("child_process");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status);
}

run("pnpm", ["build"]); // our existing build
run("electron-builder", ["--publish", "always"]); // publish to GitHub using GH_TOKEN
