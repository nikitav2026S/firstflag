# Devpost draft (edit before submitting; update the numbers from your final runs)

## Inspiration
Franklin Zhang competed in capture-the-flag events and was part of KTP, the Cybersecurity Club and InspireFly. CTFs are one of the best ways into security, but beginners usually bounce off the setup: VMs, SSH, a shared server that someone breaks. We wanted the first flag to take one click, for anyone, in the spirit of Code.org's CS for everyone.

## What it does
FirstFlag boots a real x86 Linux kernel inside your browser tab and drops you into an unprivileged shell with six missions:
- hidden files;
- searching a 3,000-line SSH brute-force log;
- file permissions;
- three layers of encoding;
- text hidden in a binary;
- a secret held only in a running process's environment.

Each student's flags are unique. If a student submits a classmate's flag, the instructor dashboard shows exactly whose machine it came from.

An AI tutor helps at three levels (nudge, point, show) and sees the student's terminal. It never sees the flag.

## How we built it
- **VM:** v86 (x86-to-WebAssembly JIT) running Ubuntu's i386 kernel and static busybox. The image is built reproducibly from pinned, hash-checked packages.
- **Per-student missions:** each student's missions are generated server-side from a seed, packed into a small cpio archive, and appended to the initrd. `/init` runs the installer as root, reports its sha256 (which the browser checks against the server), deletes it, and drops to `student`.
- **Flags:** HMAC-SHA256 of student and mission under a server secret. No flags are stored, and copied flags trace back to their owner.
- **Verifier:** before any mission is served, a headless verifier boots the exact image for N synthetic students and solves every mission as each one with a reference solver. Two negative controls must fail. The server refuses to serve a mission whose source, generator or image changed since its last passing run.
- **Tutor:** Claude (Haiku) behind a guard. Terminal output is treated as untrusted input and stripped of the flag in 26 encodings before the model sees it. Every reply is scanned for flags, encodings and fragments before it reaches the student.
- **Evals:** a deterministic guard suite and a live jailbreak suite. Every result is stamped with its git commit.
- **Stack:** React, xterm.js, Express, node:sqlite, Playwright for end-to-end tests.

## Challenges we ran into
Our first design typed each student's missions into the VM over the emulated serial port. It worked for the first byte burst, then stalled. Bursts sent into the guest sat unprocessed until more input arrived.

We tried tickless-timer, APIC, ACPI, TSC and idle settings. We dumped the emulated UART's registers mid-stall and found the guest had consumed the bytes but never woken the reader.

Rather than ship a timing hack, we changed the delivery mechanism. Linux unpacks every cpio archive concatenated into the initrd, so each student's missions now ride in a 4-byte-aligned archive appended to the shared image. No serial input is needed before the shell starts, and the interactive terminal is unaffected.

## Accomplishments we're proud of
- (update) 6/6 missions verified on 6/6 synthetic students, with both controls caught.
- (update) Guard: 11/11 simulated leaks caught, 0/6 safe replies blocked; 26/26 flag encodings redacted from transcripts.
- (update) Live jailbreak suite on <model>: X/Y leaks, Z replies caught by the guard.
- It runs on a phone.

## What we learned
"Tests pass" isn't evidence unless you know the check can fail. Every mission's check is proven able to fail before we trust its pass.

## What's next
- Class codes and teacher-authored missions.
- An in-browser mission editor that refuses to publish until the verifier passes.
- More missions: cron, SUID, a CubeSat telemetry decode.

## Built with
v86, WebAssembly, Linux, BusyBox, React, xterm.js, Node.js, Express, SQLite, Claude API, Playwright
