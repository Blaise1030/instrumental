import type { QueueCapture } from "./types";

export function buildPasteText(c: QueueCapture): string {
  switch (c.source) {
    case "diff":
    case "file": {
      const fileRef =
        c.lineStart != null && c.lineEnd != null
          ? `${c.filePath}:${c.lineStart}:${c.lineEnd}`
          : c.filePath;
      return c.selectedText
        ? [`\`\`\`${c.filePath}`, c.selectedText, "```"].join("\n")
        : fileRef;
    }
    case "folder":
      return [`[folder]`, `Path: ${c.folderPath}`, "", c.listingText].join("\n");
    case "terminal":
      if (c.agentTab) {
        return ["[Agent Tab]", "```", c.selectedText, "```"].join("\n");
      }
      return [
        c.sessionLabel ? `Session: ${c.sessionLabel}` : "",
        "```",
        c.selectedText,
        "```",
      ]
        .filter(Boolean)
        .join("\n");
  }
}
