// Per-student flags. A flag is an HMAC of (student, mission) under a server
// secret, so: every student's flag is different, the server can verify without
// storing flags, and a submitted flag that belongs to someone else can be
// traced back to its owner.
import { createHmac } from "node:crypto";

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
export const FLAG_RE = /ktp\{[a-z2-7]{16}\}/g;
export const FLAG_SHAPE_RE = /ktp\s*\{[^}\s]{1,64}\}/gi; // anything flag-shaped, for redaction

function base32(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out;
}

export function deriveFlag(secret, userId, missionId) {
  const mac = createHmac("sha256", secret).update(`flag:${userId}:${missionId}`).digest();
  return `ktp{${base32(mac).slice(0, 16)}}`;
}

/** Deterministic 32-bit seed so a student always gets the same mission layout. */
export function deriveSeed(secret, userId, missionId) {
  return createHmac("sha256", secret).update(`seed:${userId}:${missionId}`).digest().readUInt32BE(0);
}

/** mulberry32 — small seeded PRNG for mission generation. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (arr) => arr[next.int(arr.length)];
  next.shuffle = (arr) => {
    const a2 = [...arr];
    for (let i = a2.length - 1; i > 0; i--) { const j = next.int(i + 1); [a2[i], a2[j]] = [a2[j], a2[i]]; }
    return a2;
  };
  return next;
}

// ---- encodings, shared by the layers mission and the tutor's leak guard ----
export const rot13 = (s) => s.replace(/[a-z]/gi, (c) => {
  const b = c <= "Z" ? 65 : 97;
  return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
});
export const rev = (s) => [...s].reverse().join("");
export const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
export const LAYERS = { base64: b64, rot13, rev };

/** Every way the flag could be disguised with up to 3 of our layers (incl. none). */
export function flagDisguises(flag) {
  const names = Object.keys(LAYERS);
  const out = new Set([flag]);
  const walk = (s, depth) => {
    if (depth === 3) return;
    for (const n of names) {
      const t = LAYERS[n](s);
      out.add(t);
      walk(t, depth + 1);
    }
  };
  walk(flag, 0);
  // the 16-char core, in case someone strips the ktp{ } wrapper
  const core = flag.slice(4, -1);
  out.add(core); out.add(rev(core)); out.add(rot13(core));
  return [...out];
}
