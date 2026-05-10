import type { RouteLocationNormalizedLoaded } from "vue-router";

const SETTINGS_ROUTE_NAMES = new Set(["settingsAgents", "settingsTerminal", "settingsKeyboard"]);

/** Full path (path + query + hash) to restore when leaving settings via Back / Cancel / Esc. */
let exitFullPath: string | null = null;

/** Call immediately before `router.push` into settings from outside the settings subtree. */
export function rememberRouteBeforeSettings(from: RouteLocationNormalizedLoaded): void {
  if (typeof from.name === "string" && SETTINGS_ROUTE_NAMES.has(from.name)) return;
  exitFullPath = from.fullPath;
}

/** Returns the remembered path once, then clears it. */
export function takeSettingsExitFullPath(): string | null {
  const v = exitFullPath;
  exitFullPath = null;
  return v;
}
