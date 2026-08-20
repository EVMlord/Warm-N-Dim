#!/usr/bin/env node
require("dotenv").config();
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
);
const isPrerelease = pkg.version.includes("-");

// electron-builder treats EP_PRE_RELEASE="" as true. Only set it when unset.
if (process.env.EP_DRAFT == null && process.env.EP_PRE_RELEASE == null) {
  if (isPrerelease) {
    process.env.EP_PRE_RELEASE = "true";
    console.log(
      `Version ${pkg.version} has a hyphen; GitHub release will be a Pre-release.`,
    );
  }
}

if (!process.env.CSC_LINK && !process.env.WIN_CSC_LINK) {
  process.env.CSC_IDENTITY_AUTO_DISCOVERY ??= "false";
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("pnpm", ["build"]);
run("electron-builder", ["--publish", "always"]);
