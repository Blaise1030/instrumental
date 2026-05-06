#!/usr/bin/env node
/**
 * Electron's install.js considers the binary "installed" if the main executable
 * exists, even when the .app bundle is incomplete (e.g. missing framework symlinks
 * after an interrupted unzip). dyld then fails with "Library not loaded: @rpath/
 * Electron Framework.framework/Electron Framework". Remove dist and re-run install.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const skip =
  process.env.ELECTRON_SKIP_BINARY_DOWNLOAD === "1" ||
  process.env.ELECTRON_SKIP_BINARY_DOWNLOAD === "true";
if (skip) {
  process.exit(0);
}

let electronRoot;
try {
  electronRoot = path.dirname(require.resolve("electron/package.json"));
} catch {
  process.exit(0);
}

const dist = path.join(electronRoot, "dist");

function darwinFrameworkIntact() {
  const fw = path.join(
    dist,
    "Electron.app",
    "Contents",
    "Frameworks",
    "Electron Framework.framework"
  );
  const rootBinary = path.join(fw, "Electron Framework");
  const current = path.join(fw, "Versions", "Current");
  try {
    if (!fs.existsSync(rootBinary) || !fs.existsSync(current)) {
      return false;
    }
    fs.accessSync(rootBinary, fs.constants.X_OK);
  } catch {
    return false;
  }
  return true;
}

function needsRepair() {
  if (!fs.existsSync(dist)) {
    return false;
  }

  if (process.platform === "darwin") {
    const main = path.join(dist, "Electron.app", "Contents", "MacOS", "Electron");
    if (!fs.existsSync(main)) {
      return true;
    }
    return !darwinFrameworkIntact();
  }

  return false;
}

if (!needsRepair()) {
  process.exit(0);
}

// eslint-disable-next-line no-console -- diagnostics for postinstall
console.warn(
  "[ensure-electron-dist] Electron.app bundle is incomplete; re-downloading the Electron binary..."
);
fs.rmSync(dist, { recursive: true, force: true });

const res = spawnSync(process.execPath, [path.join(electronRoot, "install.js")], {
  cwd: electronRoot,
  stdio: "inherit",
  env: process.env
});
process.exit(res.status === null ? 1 : res.status ?? 0);
