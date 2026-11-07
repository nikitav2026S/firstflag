// Renders `inline code` in plain text from missions and the tutor; nothing else is interpreted.
export function Rich({ text }) {
  return String(text).split(/(`[^`\n]+`)/g).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : part);
}
