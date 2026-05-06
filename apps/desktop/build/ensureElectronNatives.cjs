/**
 * Ensures native addons load under Electron's Node (correct NODE_MODULE_VERSION).
 * electron-builder install-app-deps can no-op while .forge-meta may not match the
 * actual .node on disk; we probe by loading modules with ELECTRON_RUN_AS_NODE=1.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function electronPackageRoot() {
  return path.dirname(require.resolve("electron/package.json"));
}

function electronExecutable() {
  const root = electronPackageRoot();
  switch (process.platform) {
    case "darwin":
      return path.join(root, "dist", "Electron.app", "Contents", "MacOS", "Electron");
    case "win32":
      return path.join(root, "dist", "electron.exe");
    default:
      return path.join(root, "dist", "electron");
  }
}

function runForceRebuild() {
  const cwd = path.join(__dirname, "..");
  const rebuildCli = path.join(path.dirname(require.resolve("@electron/rebuild")), "cli.js");
  const result = spawnSync(process.execPath, [rebuildCli, "-f", "-w", "better-sqlite3", "node-pty"], {
    stdio: "inherit",
    cwd
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function nativeAddonsLoadUnderElectron(cwd) {
  const exe = electronExecutable();
  if (!fs.existsSync(exe)) {
    return { ok: false, reason: "Electron binary missing" };
  }

  const probe = path.join(__dirname, "probeNativeAddons.cjs");
  const result = spawnSync(exe, [probe], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1"
    }
  });

  if (result.status === 0) {
    return { ok: true };
  }
  const err = (result.stderr || result.stdout || "").trim() || `exit ${result.status}`;
  return { ok: false, reason: err };
}

function main() {
  const cwd = path.join(__dirname, "..");

  let check = nativeAddonsLoadUnderElectron(cwd);
  if (check.ok) {
    return;
  }

  // eslint-disable-next-line no-console -- diagnostics
  console.warn(
    `[ensureElectronNatives] Native addons failed under Electron (${check.reason}); running electron-rebuild -f…`
  );
  runForceRebuild();

  check = nativeAddonsLoadUnderElectron(cwd);
  if (!check.ok) {
    // eslint-disable-next-line no-console -- diagnostics
    console.error(`[ensureElectronNatives] Still failing after rebuild: ${check.reason}`);
    process.exit(1);
  }
}

main();
