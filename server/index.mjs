// FirstFlag server: sessions, per-student mission overlays, flag checking with
// sharing detection, the guarded tutor, the instructor view, and the "proof"
// endpoint that shows what was verified. Serves the built web app too.
import express from "express";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb } from "./db.mjs";
import { askTutor, TUTOR_MODEL } from "./tutor.mjs";
import { MISSIONS, byId, bundleFor, templateHash, publicMission } from "../shared/missions/index.mjs";
import { deriveFlag } from "../shared/flags.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = process.env.FF_DATA_DIR || join(ROOT, "data");
const PORT = Number(process.env.PORT) || 8787;
const INSTRUCTOR_KEY = process.env.FF_INSTRUCTOR_KEY || "ktp-demo";
const ALLOW_UNVERIFIED = process.env.FF_ALLOW_UNVERIFIED === "1";
const sha = (b) => createHash("sha256").update(b).digest("hex");

// ---- secret: flags are HMACs under this; keep it stable across restarts ----
mkdirSync(DATA, { recursive: true });
const secretFile = join(DATA, "secret");
const SECRET = process.env.FF_SECRET || (existsSync(secretFile)
  ? readFileSync(secretFile, "utf8").trim()
  : (() => { const s = randomBytes(32).toString("hex"); writeFileSync(secretFile, s, { mode: 0o600 }); return s; })());

// ---- verification gate: serve only missions with a passing record for these exact bytes ----
const lock = JSON.parse(readFileSync(join(ROOT, "vm", "image.lock.json"), "utf8"));
const manifestPath = join(ROOT, "verify", "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const imageOnDisk = Object.fromEntries(Object.keys(lock.outputs).map((n) => {
  const p = join(ROOT, "web", "public", "vm", n);
  return [n, existsSync(p) ? sha(readFileSync(p)) : null];
}));
const imageMatchesLock = Object.entries(lock.outputs).every(([n, h]) => imageOnDisk[n] === h);
const gate = Object.fromEntries(MISSIONS.map((m) => {
  const current = templateHash(m.id, lock.outputs);
  const rec = manifest?.missions?.[m.id];
  let status = "verified", why = null;
  if (!imageMatchesLock) { status = "unverified"; why = "VM image on disk differs from vm/image.lock.json"; }
  else if (!rec) { status = "unverified"; why = "no verification record — run `npm run verify`"; }
  else if (rec.template_sha256 !== current) { status = "stale"; why = "mission, generator or image changed since it was verified"; }
  else if (!rec.verified) { status = "failed"; why = "verification failed"; }
  return [m.id, { status, why, current_template: current, record: rec ?? null }];
}));
const SERVED = MISSIONS.filter((m) => gate[m.id].status === "verified" || ALLOW_UNVERIFIED);
for (const m of MISSIONS) {
  const g = gate[m.id];
  console.log(`${g.status === "verified" ? "✓" : ALLOW_UNVERIFIED ? "!" : "✗"} ${m.id.padEnd(12)} ${g.status}${g.why ? ` — ${g.why}` : ""}`);
}
if (!SERVED.length) console.log("No missions are being served. Run `npm run verify` (or set FF_ALLOW_UNVERIFIED=1 while developing).");

// ---- app ----
const db = openDb(join(DATA, "firstflag.db"));
const app = express();
app.use(express.json({ limit: "64kb" }));

function auth(req, res, next) {
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const user = token && db.prepare("SELECT * FROM users WHERE token = ?").get(token);
  if (!user) return res.status(401).json({ error: "no session" });
  req.user = user;
  next();
}

const solvedSet = (userId) => new Set(db.prepare(
  "SELECT DISTINCT mission_id FROM submissions WHERE user_id = ? AND result = 'correct'").all(userId).map((r) => r.mission_id));

app.post("/api/session", (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: "name required" });
  const user = { id: randomUUID(), name, token: randomBytes(24).toString("hex"), created: Date.now() };
  db.prepare("INSERT INTO users (id, name, token, created) VALUES (?, ?, ?, ?)").run(user.id, user.name, user.token, user.created);
  res.json({ id: user.id, name: user.name, token: user.token });
});

app.get("/api/me", auth, (req, res) => res.json({ id: req.user.id, name: req.user.name }));

app.get("/api/missions", auth, (req, res) => {
  const solved = solvedSet(req.user.id);
  res.json(MISSIONS.map((m) => ({
    ...publicMission(m),
    served: SERVED.includes(m),
    verification: gate[m.id].status,
    solved: solved.has(m.id),
  })));
});

// The student's mission overlay: a cpio archive the browser appends to the initrd.
app.get("/api/bundle", auth, (req, res) => {
  const b = bundleFor(SECRET, req.user.id, SERVED);
  res.set({
    "Content-Type": "application/octet-stream",
    "Cache-Control": "no-store",
    "X-FF-Bundle-SHA256": b.sha256,
    "Access-Control-Expose-Headers": "X-FF-Bundle-SHA256",
  });
  res.send(b.overlay);
});

app.post("/api/submit", auth, (req, res) => {
  const mission = byId[req.body?.missionId];
  if (!mission || !SERVED.includes(mission)) return res.status(404).json({ error: "unknown mission" });
  const submitted = String(req.body?.flag || "").trim().toLowerCase().slice(0, 80);
  const own = deriveFlag(SECRET, req.user.id, mission.id);
  const record = (result, ownerId = null) => db.prepare(
    "INSERT INTO submissions (user_id, mission_id, submitted, result, owner_id, ts) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(req.user.id, mission.id, submitted, result, ownerId, Date.now());

  const eq = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  if (eq(submitted, own)) {
    record("correct");
    return res.json({ result: "correct", message: "Flag captured!" });
  }
  // Is it someone else's flag? Every student's flag is an HMAC we can recompute.
  const owner = db.prepare("SELECT id FROM users WHERE id != ?").all(req.user.id)
    .find((u) => eq(submitted, deriveFlag(SECRET, u.id, mission.id)));
  if (owner) {
    record("shared", owner.id);
    return res.json({ result: "shared", message: "That's a real flag — but it came from another student's machine. Every machine has its own flag. Find yours!" });
  }
  record("wrong");
  res.json({ result: "wrong", message: /^ktp\{[a-z2-7]{16}\}$/.test(submitted) ? "Right shape, wrong flag." : "Flags look like ktp{...} with 16 characters inside." });
});

app.post("/api/tutor", auth, async (req, res) => {
  const mission = byId[req.body?.missionId];
  if (!mission) return res.status(404).json({ error: "unknown mission" });
  const out = await askTutor({
    mission,
    flag: deriveFlag(SECRET, req.user.id, mission.id), // used only by the guard, never sent to the model
    message: req.body?.message ?? "",
    transcript: String(req.body?.transcript ?? "").slice(-20000),
    level: req.body?.level,
    history: Array.isArray(req.body?.history) ? req.body.history : [],
  });
  db.prepare("INSERT INTO tutor_log (user_id, mission_id, level, source, blocked, reasons, redactions, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(req.user.id, mission.id, out.level, out.source, out.guard.blocked ? 1 : 0, out.guard.reasons.join("; "), out.redactions, Date.now());
  delete out.raw; // a blocked reply never leaves the server
  res.json(out);
});

app.get("/api/instructor", (req, res) => {
  if (req.get("x-instructor-key") !== INSTRUCTOR_KEY) return res.status(403).json({ error: "instructor key required" });
  const users = db.prepare("SELECT id, name, created FROM users ORDER BY created").all();
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const subs = db.prepare("SELECT * FROM submissions ORDER BY ts").all();
  const students = users.map((u) => {
    const mine = subs.filter((s) => s.user_id === u.id);
    return {
      id: u.id, name: u.name, created: u.created,
      missions: Object.fromEntries(MISSIONS.map((m) => {
        const ms = mine.filter((s) => s.mission_id === m.id);
        return [m.id, { solved: ms.some((s) => s.result === "correct"), attempts: ms.length }];
      })),
    };
  });
  res.json({
    missions: MISSIONS.map(publicMission),
    students,
    sharing: subs.filter((s) => s.result === "shared").map((s) => ({
      ts: s.ts, mission: s.mission_id, submittedBy: names[s.user_id], flagOwner: names[s.owner_id],
    })),
    tutor: {
      requests: db.prepare("SELECT COUNT(*) n FROM tutor_log").get().n,
      blocked: db.prepare("SELECT ts, user_id, mission_id, reasons FROM tutor_log WHERE blocked = 1 ORDER BY ts DESC LIMIT 20").all()
        .map((r) => ({ ...r, student: names[r.user_id] })),
      redactions: db.prepare("SELECT COALESCE(SUM(redactions),0) n FROM tutor_log").get().n,
    },
  });
});

app.get("/api/proof", (_req, res) => {
  let evals = null;
  try { evals = JSON.parse(readFileSync(join(ROOT, "evals", "results", "latest.json"), "utf8")); } catch { /* none yet */ }
  res.json({
    image: { lock: lock.outputs, onDisk: imageOnDisk, matches: imageMatchesLock, cmdline: lock.cmdline, inputs: lock.inputs },
    verification: manifest && {
      authoritative: manifest.authoritative, git: manifest.git, policy_sha256: manifest.policy_sha256,
      runner: manifest.runner, seeds: manifest.seeds, finished: manifest.finished,
    },
    missions: Object.fromEntries(MISSIONS.map((m) => [m.id, {
      title: m.title, status: gate[m.id].status, why: gate[m.id].why,
      template_sha256: gate[m.id].current_template,
      passed: gate[m.id].record?.passed ?? null, controls: gate[m.id].record?.controls ?? null,
    }])),
    tutor: { model: process.env.ANTHROPIC_API_KEY ? TUTOR_MODEL : null, mode: process.env.ANTHROPIC_API_KEY ? "claude" : "offline hints" },
    evals,
  });
});

// ---- static web app (after `npm run build`) ----
const dist = join(ROOT, "web", "dist");
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: "1h", setHeaders: (res, p) => { if (p.endsWith(".html")) res.set("Cache-Control", "no-cache"); } }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(dist, "index.html")));
}

app.listen(PORT, () => console.log(`FirstFlag server on http://localhost:${PORT}  (tutor: ${process.env.ANTHROPIC_API_KEY ? TUTOR_MODEL : "offline hints"})`));
