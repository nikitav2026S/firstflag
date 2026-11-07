// Headless FirstFlag VM for Node: boots the exact image the browser serves,
// with a student's mission overlay appended to the initrd, and runs shell
// commands as `student`. Used by the solvability verifier.
import { V86 } from "v86";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VM = join(ROOT, "web", "public", "vm");
const require = createRequire(import.meta.url);
const WASM = join(dirname(require.resolve("v86")), "v86.wasm");
export const LOCK = JSON.parse(readFileSync(join(ROOT, "vm", "image.lock.json"), "utf8"));

const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

export class HeadlessVM {
  constructor({ log = false } = {}) {
    this.out = "";
    this.log = log;
  }

  /** Boot with an optional per-student overlay (Buffer). Resolves at the student prompt. */
  async boot(overlay = null, timeoutMs = 120_000) {
    const t0 = Date.now();
    const base = readFileSync(join(VM, "initrd.cpio.gz"));
    const initrd = overlay ? Buffer.concat([base, overlay]) : base;
    this.emu = new V86({
      wasm_path: WASM,
      memory_size: LOCK.memory_mb * 1024 * 1024,
      vga_memory_size: 2 * 1024 * 1024,
      bios: { buffer: ab(readFileSync(join(VM, "seabios.bin"))) },
      vga_bios: { buffer: ab(readFileSync(join(VM, "vgabios.bin"))) },
      bzimage: { buffer: ab(readFileSync(join(VM, "bzImage"))) },
      initrd: { buffer: ab(initrd) },
      cmdline: LOCK.cmdline,
      autostart: true,
      disable_keyboard: true,
      disable_mouse: true,
      disable_speaker: true,
    });
    this.emu.add_listener("serial0-output-byte", (b) => {
      const ch = String.fromCharCode(b);
      this.out += ch;
      if (this.log) process.stdout.write(ch);
      // busybox ash asks the terminal for its cursor position; answer like xterm.js would
      if (ch === "n" && this.out.endsWith("\x1b[6n")) this.emu.serial0_send("\x1b[24;1R");
    });
    const m = await this.waitFor(/@@FF:(INSTALLED|INSTALL_FAILED|NO_BUNDLE) ?([0-9a-f]*)@@/, timeoutMs);
    if (m[1] === "INSTALL_FAILED") throw new Error(`mission install failed:\n${this.out.slice(-1500)}`);
    this.installed = m[2] || null;
    await this.waitFor(/\$ (\x1b\[6n)?$/, timeoutMs);
    await new Promise((r) => setTimeout(r, 300)); // let the DSR reply land before typing
    this.bootMs = Date.now() - t0;
    return this.bootMs;
  }

  waitFor(re, timeoutMs = 30_000, from = 0) {
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        const m = this.out.slice(from).match(re);
        if (m) { clearInterval(t); clearTimeout(to); resolve(m); }
      }, 20);
      const to = setTimeout(() => {
        clearInterval(t);
        reject(new Error(`timeout waiting for ${re}; tail:\n${JSON.stringify(this.out.slice(-600))}`));
      }, timeoutMs);
    });
  }

  send(s) { this.emu.serial0_send(s); }

  /** Run a shell command as the student; returns {stdout, code}. */
  async run(cmd, timeoutMs = 30_000) {
    const id = Math.random().toString(36).slice(2, 10);
    const from = this.out.length;
    this.send(`printf '@@%s@@\\n' B${id}; ${cmd}; printf '@@%s %s@@\\n' E${id} $?\n`);
    const m = await this.waitFor(new RegExp(`@@B${id}@@\\r?\\n([\\s\\S]*?)@@E${id} (\\d+)@@`), timeoutMs, from);
    await new Promise((r) => setTimeout(r, 150)); // next prompt + DSR reply
    return { stdout: m[1].replace(/\r/g, ""), code: Number(m[2]) };
  }

  async destroy() { await this.emu.destroy(); }
}

// `node verify/vmrunner.mjs [--log]` → boot smoke test with a dev bundle
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { bundleFor } = await import("../shared/missions/index.mjs");
  const b = bundleFor("dev-secret", "smoke");
  const vm = new HeadlessVM({ log: process.argv.includes("--log") });
  const ms = await vm.boot(b.overlay);
  console.log(`\nbooted to student prompt in ${ms} ms; installed ${vm.installed === b.sha256 ? "matches" : "DOES NOT match"} bundle`);
  for (const c of ["id", "ls ~/missions", "sleep 2; echo late-output-ok", "seq 1 2000 | tail -2"]) {
    const t0 = Date.now();
    const r = await vm.run(c);
    console.log(`$ ${c}  [exit ${r.code}, ${Date.now() - t0} ms]\n${r.stdout}`);
  }
  await vm.destroy();
}
