/**
 * Ensures the macOS Electron.app bundle is complete. A partial install can leave
 * Versions/A populated but drop the framework root symlinks, which causes dyld:
 * "Library not loaded: @rpath/Electron Framework.framework/Electron Framework".
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function electronPackageDir() {
  return path.dirname(require.resolve("electron/package.json"));
}

function frameworkBinarySymlink(electronDir) {
  return path.join(
    electronDir,
    "dist",
    "Electron.app",
    "Contents",
    "Frameworks",
    "Electron Framework.framework",
    "Electron Framework"
  );
}

function darwinFrameworkLooksBroken(electronDir) {
  const linkPath = frameworkBinarySymlink(electronDir);
  try {
    const st = fs.lstatSync(linkPath);
    if (!st.isSymbolicLink()) {
      return true;
    }
    const target = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
    return !fs.existsSync(target);
  } catch {
    return true;
  }
}

function main() {
  if (process.platform !== "darwin") {
    return;
  }

  let electronDir;
  try {
    electronDir = electronPackageDir();
  } catch {
    console.error("repairElectron: could not resolve electron package");
    process.exit(1);
  }

  if (!darwinFrameworkLooksBroken(electronDir)) {
    return;
  }

  console.warn(
    "repairElectron: Electron.app framework layout looks incomplete; re-downloading Electron binary…"
  );

  const dist = path.join(electronDir, "dist");
  fs.rmSync(dist, { recursive: true, force: true });
  fs.rmSync(path.join(electronDir, "path.txt"), { force: true });

  const result = spawnSync(process.execPath, ["install.js"], {
    cwd: electronDir,
    stdio: "inherit",
    env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: "" }
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (darwinFrameworkLooksBroken(electronDir)) {
    console.error("repairElectron: Electron binary still looks broken after install.js");
    process.exit(1);
  }
}

main();
