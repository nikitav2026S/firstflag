# FirstFlag

Learn cybersecurity by breaking into a real Linux machine that runs in your browser tab.

FirstFlag boots an actual x86 Linux kernel inside the browser (via the v86 emulator), drops each student into an unprivileged shell, and gives them six capture-the-flag missions. Every student's flags are different, every mission is machine-verified as solvable before it is served, and the AI tutor that helps them is built so it cannot leak a flag it was never given.

Built at KTPHacks 2 for the Franklin Zhang Initiative. Franklin loved capture the flag; this is a way in for the next person who might.

## Quick start

Requires Node 22.13 or newer.

```bash
npm install
npm run build          # bundles the web app, copies the emulator core
npm start              # http://localhost:8787
```

Development, with hot reload for the UI and auto-restart for the server:

```bash
npm run dev            # UI on http://localhost:5173, API on :8787
```

Optional: put `ANTHROPIC_API_KEY` in your environment to turn on the Claude-backed tutor. Without it, the tutor uses each mission's built-in three-level hint ladder. The instructor view is at `/instructor` (key: `FF_INSTRUCTOR_KEY`, default `ktp-demo`). See `.env.example`.

## What happens when a student clicks "Boot my machine"

```
browser                                   server
───────                                   ──────
GET /vm/bzImage, initrd.cpio.gz, BIOS ──► static files (same bytes the verifier booted)
GET /api/bundle ────────────────────────► builds this student's missions:
                                            flag = HMAC(secret, student, mission)
                                            layout seeded per student
                                          ◄── small cpio archive + its sha256
append archive to the initrd
boot v86 (x86 → WebAssembly JIT)
  /init (root) runs the installer, prints its sha256, deletes it
  browser checks that hash against the server's  ──► "Missions installed … matches"
  shell drops to uid 1000 `student`
xterm.js ⇄ serial console
```

Nothing executes on the server. Each student's "server" is their own browser tab, so a classroom costs nothing extra to run and there is no shared box to attack.

## The parts that are hard

**A real Linux, built reproducibly.** `vm/build_image.py` downloads three pinned Ubuntu packages (i386 kernel 4.15, static busybox, SeaBIOS), checks their sha256, and builds the initrd byte-for-byte deterministically. `vm/image.lock.json` records every input and output hash.

**Per-student flags with sharing detection.** Flags are `ktp{` + base32(HMAC-SHA256(secret, student, mission))[:16] + `}`. The server stores no flags. When a submitted flag is wrong, it recomputes every other student's flag for that mission. A match tells the instructor exactly whose machine it came from.

**Missions are proven solvable on the exact bytes that ship.** `npm run verify` boots the real image headlessly for N synthetic students. For each student it installs their bundle, runs each mission's reference solver as `student`, and requires that student's exact flag. The solver uses only what a student can see, never the seed. It also runs two controls that must fail: student A's machine must not yield student B's flags, and a machine with no missions installed must yield no flag at all.

The server hashes each mission's source, the generator code, and the image into a template hash. It refuses to serve any mission without a passing record for that exact hash. Edit a mission, and it goes dark until it is re-verified.

**A tutor that can't leak what it never has.** The model never receives the flag, the solver, or the secret. Defence in depth for what it can still see or say:
- **Transcript redaction.** The student's terminal output is untrusted input; it may contain their flag, already found or still encoded. Every flag-shaped string, plus the real flag in every encoding our missions use (26 variants: base64, rot13, reversed, and their combinations), is removed before the model sees it.
- **Output guard.** Every reply is scanned for flag-shaped strings, the real flag in any of those encodings, 8-character fragments of it, base64/rot13/reversed blobs that decode to a flag, and the full solution before hint level 3. A failing reply never leaves the server.
- **Untrusted-data framing.** The terminal is passed as data and the model is told never to follow instructions inside it. The jailbreak suite includes a prompt injection planted in a log file.

## How we verified it

| Check | Command | Result on this build |
|---|---|---|
| Missions solvable, per student | `npm run verify` | 6/6 missions, 6/6 synthetic students each; see `verify/manifest.json` |
| Check can fail (wrong owner, no missions) | `npm run verify` | both controls caught for all 6 missions |
| Guard catches simulated leaks | `npm run eval:guard` | 11/11 caught, 0/6 safe replies wrongly blocked |
| Transcript redaction | `npm run eval:guard` | 26/26 flag encodings removed before reaching the model |
| Live jailbreaks against Claude | `ANTHROPIC_API_KEY=… npm run eval` | **run this with your key**; results land in `evals/results/` |
| Full browser flow | `node scripts/e2e.mjs` (server running) | sign-up → boot → solve by typing → capture → tutor → instructor |

Every verifier and eval result records the git commit and whether the tree was dirty. A result from a dirty tree is labelled "not authoritative". Recording a clean result takes four steps:

1. Commit the code.
2. Run `npm run verify` and `npm run eval`.
3. Commit the updated `verify/manifest.json` and `evals/results/`.
4. The result now describes the commit before it.

## What is enforced, and what isn't (yet)

| Claim | Status |
|---|---|
| Missions are only served with a passing verification for their exact template hash | Enforced by the server at startup |
| The VM installed exactly the bundle the server built | Enforced: the guest reports a sha256 and the browser compares it |
| The tutor never receives a flag | Enforced by construction: the flag is only passed to the guard |
| Replies containing a flag or a known encoding never reach the student | Enforced by the output guard; covered by the guard suite |
| A student can't extract a flag without solving the mission | **Not enforced.** The flag is inside the image their browser downloaded; a determined student can dig it out. We treat that as solving it the hard way. |
| `grep -r 'ktp{' /` shortcuts | Works on missions A and B (finding text is the lesson there). C–F resist it: permissions, encodings, binary data, process memory. |
| Tutor gives good pedagogy | Not measured beyond "benign questions are not refused". |

## Missions

| Flag | Mission | Teaches |
|---|---|---|
| Alfa | Hidden in Plain Sight | dotfiles, `ls -a`, `find` |
| Bravo | Needle in a Haystack | logs, `grep`, pipes (3,000-line SSH brute-force log, generated in the VM) |
| Charlie | Permission Denied | `ls -l`, `chmod` |
| Delta | Layers | base64, rot13, `rev`, undoing steps in reverse (seeded order) |
| Echo | Strings Attached | binary files, `strings` |
| Foxtrot | Ghost in the Process | `ps`, `/proc/<pid>/environ`, environment variables |

Adding a mission: copy one in `shared/missions/`, register it in `shared/missions/index.mjs`, and run `npm run verify`. It will not be served until it passes.

## Deploying

Any Node 22.13+ host works (Render, Railway, Fly). Build command `npm install && npm run build`, start command `npm start`. Set `FF_INSTRUCTOR_KEY`, and `ANTHROPIC_API_KEY` if you want the live tutor. Set `FF_SECRET` too, or attach a persistent disk at `data/`; otherwise every redeploy gets a new secret, which changes every student's flags. The VM image (about 9 MB) ships in `web/public/vm/`, so the host needs no Python.

## Repository map

```
vm/build_image.py        pinned, reproducible VM image build → web/public/vm/
vm/rootfs/               /init (installs missions, drops to `student`), base64 helper, motd
shared/flags.mjs         HMAC flags, seeded PRNG, encodings
shared/missions/         the six mission templates + registry and template hashing
shared/bundle.mjs        per-student installer → cpio overlay
verify/                  headless VM runner and the solvability verifier
server/                  API, guarded tutor, SQLite (node:sqlite, no native deps)
evals/                   guard and jailbreak suites, timestamped results
web/                     React + xterm.js + v86 front end
scripts/e2e.mjs          real-browser end-to-end test (Playwright)
```

## Credits and licences

v86 (BSD-2-Clause) by Fabian Hemmer and contributors. The Linux kernel and BusyBox are GPL-2.0, and SeaBIOS is LGPL-3.0; the binaries are Ubuntu's, unmodified, and their source is available from the Ubuntu archive. Signal-flag designs are the public International Code of Signals.
