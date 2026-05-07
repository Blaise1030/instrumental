/**
 * Emoji hint for file kind (tabs, source control list, etc.).
 * Single map shared with the explorer file editor so icons stay consistent.
 */
export function fileEmojiForPath(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  const map: Record<string, string> = {
    ts: "📘",
    tsx: "⚛️",
    vue: "💚",
    js: "📜",
    jsx: "⚛️",
    md: "📝",
    markdown: "📝",
    json: "📋",
    css: "🎨",
    scss: "🎨",
    sass: "🎨",
    less: "🎨",
    html: "🌐",
    htm: "🌐",
    py: "🐍",
    rs: "🦀",
    go: "🐹",
    java: "☕",
    kt: "🟣",
    swift: "🐦",
    rb: "💎",
    php: "🐘",
    sh: "⌨️",
    bash: "⌨️",
    zsh: "⌨️",
    yml: "⚙️",
    yaml: "⚙️",
    toml: "⚙️",
    sql: "🗃️",
    png: "🖼️",
    jpg: "🖼️",
    jpeg: "🖼️",
    webp: "🖼️",
    gif: "🖼️",
    svg: "🖼️",
    avif: "🖼️",
    bmp: "🖼️",
    ico: "🖼️",
  };
  return map[ext] ?? "📄";
}
