// Solvability verifier: "no mission ships unless its reference solver captures
// the exact flag inside the exact VM image the browser runs."
//
// For each of N synthetic students it boots the VM with that student's mission
// overlay appended to the initrd (exactly as the browser does), runs every reference solver
// as the unprivileged student, and checks for that student's exact flag.
// Two controls check that the check itself can fail:
//   - wrong-owner: student A's VM must NOT yield student B's flags
//   - removed:     a VM with no mission installed must yield no flag at all
// Output: verify/manifest.json (read by the server, which refuses to serve
// missions without a passing record for their current template hash) and a raw
// log under verify/runs/.
//
//   node verify/verify.mjs [--seeds 6] [--log]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HeadlessVM, LOCK } from "./vmrunner.mjs";
import { MISSIONS, bundleFor, instanceFor, templateHash } from "../shared/missions/index.mjs";
import { packBundle } from "../shared/bundle.mjs";
import { FLAG_RE } from "../shared/flags.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const SEEDS = Number(args[args.indexOf("--seeds") + 1]) || 6;
const LOG = args.includes("--log");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const log = [];
const say = (s) => { console.log(s); log.push(s); };

function git() {
  try {
    const head = execSync("git rev-parse HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const dirty = execSync("git status --porcelain", { cwd: ROOT }).toString().trim().length > 0;
    return { head, dirty };
  } catch { return { head: null, dirty: true }; }
}

// 1. the bytes we boot must be the bytes the lockfile describes
for (const [name, want] of Object.entries(LOCK.outputs)) {
  const got = sha(readFileSync(join(ROOT, "web", "public", "vm", name)));
  if (got !== want) { console.error(`image ${name} sha256 ${got} != lock ${want}; rebuild with vm/build_image.py`); process.exit(2); }
}
const policySha = sha(readFileSync(fileURLToPath(import.meta.url)));
const v86Version = JSON.parse(readFileSync(join(ROOT, "node_modules", "v86", "package.json"), "utf8")).version;
const started = new Date().toISOString();
const g = git();
say(`FirstFlag verifier  policy ${policySha.slice(0, 12)}  git ${g.head?.slice(0, 12) ?? "none"}${g.dirty ? " (dirty)" : ""}  seeds ${SEEDS}`);

const secret = randomBytes(32).toString("hex"); // throwaway: flags differ every run
const results = Object.fromEntries(MISSIONS.map((m) => [m.id, { runs: [], controls: {} }]));
const outputs = {}; // seed -> missionId -> stdout

const bootTimes = [];
async function freshVM(overlay) {
  const vm = new HeadlessVM({ log: LOG });
  bootTimes.push(await vm.boot(overlay));
  return vm;
}

// 3. every synthetic student, every mission
for (let i = 1; i <= SEEDS; i++) {
  const user = `verify-${i}`;
  const bundle = bundleFor(secret, user);
  const vm = await freshVM(bundle.overlay);
  if (vm.installed !== bundle.sha256) throw new Error(`VM installed ${vm.installed}, expected ${bundle.sha256}`);
  outputs[i] = {};
  for (const m of MISSIONS) {
    const flag = instanceFor(secret, user, m).flag;
    const t0 = Date.now();
    const { stdout, code } = await vm.run(m.solve, 60_000);
    const ms = Date.now() - t0;
    outputs[i][m.id] = stdout;
    const pass = stdout.includes(flag);
    results[m.id].runs.push({ seed: i, pass, exit: code, ms, bundle_sha256: bundle.sha256 });
    log.push(`--- seed ${i} ${m.id} exit=${code} ${pass ? "PASS" : "FAIL"} (${ms} ms)\n$ ${m.solve}\n${stdout.slice(0, 400)}`);
  }
  await vm.destroy();
  say(`seed ${i}: ${MISSIONS.map((m) => `${m.id} ${results[m.id].runs.at(-1).pass ? "✓" : "✗"}`).join("  ")}`);
}

// 4a. wrong-owner control: seed 1's VM must not contain seed 2's flags
for (const m of MISSIONS) {
  const other = instanceFor(secret, `verify-${SEEDS > 1 ? 2 : 999}`, m).flag;
  results[m.id].controls.wrong_owner = { detected: !outputs[1][m.id].includes(other) };
}
// 4b. removed control: an empty bundle must yield no flag-shaped output
{
  const vm = await freshVM(packBundle([]).overlay);
  for (const m of MISSIONS) {
    const { stdout } = await vm.run(m.solve, 60_000);
    results[m.id].controls.removed = { detected: !(stdout.match(FLAG_RE) ?? []).length };
  }
  await vm.destroy();
}

// 5. verdicts + manifest
const missions = {};
let allOk = true;
for (const m of MISSIONS) {
  const r = results[m.id];
  const passed = r.runs.filter((x) => x.pass).length;
  const controlsOk = Object.values(r.controls).every((c) => c.detected);
  const verified = passed === SEEDS && controlsOk;
  allOk &&= verified;
  const ms = r.runs.map((x) => x.ms).sort((a, b) => a - b);
  missions[m.id] = {
    title: m.title,
    version: m.version,
    template_sha256: templateHash(m.id, LOCK.outputs),
    verified,
    passed: `${passed}/${SEEDS}`,
    controls: r.controls,
    median_solve_ms: ms[Math.floor(ms.length / 2)],
  };
  say(`${verified ? "VERIFIED" : "REJECTED"}  ${m.id.padEnd(12)} ${passed}/${SEEDS} solves  controls: wrong-owner ${r.controls.wrong_owner.detected ? "caught" : "MISSED"}, removed ${r.controls.removed.detected ? "caught" : "MISSED"}`);
}

const manifest = {
  schema: 1,
  authoritative: !g.dirty && !!g.head,
  note: g.dirty ? "working tree was dirty: this run describes uncommitted bytes and is not authoritative" : undefined,
  git: g,
  policy_sha256: policySha,
  runner: { node: process.version, v86: v86Version, median_boot_ms: bootTimes.sort((a, b) => a - b)[Math.floor(bootTimes.length / 2)] },
  image: { outputs: LOCK.outputs, cmdline: LOCK.cmdline, memory_mb: LOCK.memory_mb },
  started,
  finished: new Date().toISOString(),
  seeds: SEEDS,
  missions,
};
mkdirSync(join(ROOT, "verify", "runs"), { recursive: true });
const stamp = started.replace(/[:.]/g, "-");
writeFileSync(join(ROOT, "verify", "runs", `${stamp}.log`), log.join("\n") + "\n");
writeFileSync(join(ROOT, "verify", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
say(`wrote verify/manifest.json and verify/runs/${stamp}.log`);
process.exit(allOk ? 0 : 1);
