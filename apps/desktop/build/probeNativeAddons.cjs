"use strict";
try {
  require("better-sqlite3");
  require("node-pty");
  process.exit(0);
} catch (err) {
  process.stderr.write(String(err && err.message ? err.message : err) + "\n");
  process.exit(1);
}
