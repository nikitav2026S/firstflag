// Leak guard for the AI tutor. Two layers, both independent of the model:
//   1. redactTranscript: the student's terminal output is untrusted and may
//      contain their flag (already found, or still encoded). Anything flag-like
//      is removed before the model ever sees it.
//   2. checkOutput: every model reply is scanned for anything flag-shaped, for
//      the student's real flag, and for any encoding of it our missions use.
//      A reply that fails is never shown; the student gets a static hint.
// The tutor is never given the flag. These layers cover what it might still
// see (the transcript) and what it might still produce (a decoding).
import { FLAG_SHAPE_RE, flagDisguises, rot13, rev } from "../shared/flags.mjs";

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]/g;
const PLACEHOLDER = /^(\.{2,}|…|flag|x{2,}|\*{2,}|_+|<[^>]*>|your[_ -]?flag)$/i;
const squash = (s) => s.replace(/\s+/g, "");

function coreWindows(flag, n = 8) {
  const core = flag.slice(4, -1);
  const out = new Set();
  for (const variant of [core, rot13(core), rev(core)]) {
    for (let i = 0; i + n <= variant.length; i++) out.add(variant.slice(i, i + n));
  }
  return [...out];
}

export function redactTranscript(raw, flag, maxChars = 3000) {
  let text = raw.replace(ANSI_RE, "").replace(/\r/g, "");
  let redactions = 0;
  text = text.replace(FLAG_SHAPE_RE, (m) => {
    const inner = m.slice(m.indexOf("{") + 1, -1);
    if (PLACEHOLDER.test(inner)) return m;
    redactions++;
    return "[flag-shaped text removed]";
  });
  if (flag) {
    for (const d of flagDisguises(flag).sort((a, b) => b.length - a.length)) {
      if (d.length < 8) continue;
      if (text.includes(d)) { redactions++; text = text.split(d).join("[encoded secret removed]"); }
    }
  }
  return { text: text.slice(-maxChars), redactions };
}

function decodedVariants(token) {
  const out = [];
  try {
    const t = token.replace(/[^A-Za-z0-9+/=]/g, "");
    if (t.length >= 12) out.push(Buffer.from(t, "base64").toString("latin1"));
  } catch { /* not base64 */ }
  out.push(rot13(token), rev(token));
  return out;
}

/** Returns { ok, reasons[] }. `mission` and `level` enable the early-spoiler check. */
export function checkOutput(reply, flag, { mission = null, level = 3 } = {}) {
  const reasons = [];
  const flat = squash(reply);

  for (const m of reply.match(FLAG_SHAPE_RE) ?? []) {
    const inner = m.slice(m.indexOf("{") + 1, -1);
    if (!PLACEHOLDER.test(inner)) reasons.push("contains a flag-shaped string");
  }
  if (flag) {
    const lowered = flat.toLowerCase();
    for (const d of flagDisguises(flag)) {
      if (d.length >= 8 && (flat.includes(d) || lowered.includes(d.toLowerCase()))) {
        reasons.push("contains your flag or an encoding of it");
        break;
      }
    }
    if (!reasons.length && coreWindows(flag).some((w) => lowered.includes(w))) {
      reasons.push("contains part of your flag");
    }
    // a base64/rot13/reversed blob that decodes to something flag-like
    for (const token of reply.match(/[A-Za-z0-9+/=]{16,}/g) ?? []) {
      if (decodedVariants(token).some((v) => /ktp\s*\{/i.test(v) || v.includes(flag.slice(4, -1)))) {
        reasons.push("contains an encoded flag");
        break;
      }
    }
  }
  if (mission && level < 3 && squash(mission.solve).length > 12 && flat.includes(squash(mission.solve))) {
    reasons.push("gives away the full solution before hint level 3");
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}
