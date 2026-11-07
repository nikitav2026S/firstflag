// Browser side of the VM: download the shared image and this student's mission
// overlay, append the overlay to the initrd, and boot v86. Output is held back
// until /init reports which bundle it installed, so the student never sees the
// install step, and we can check the reported hash against the server's.
import { V86 } from "v86";

async function fetchWithProgress(url, onBytes, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Couldn't download ${url} (${res.status}).`);
  const reader = res.body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); n += value.length; onBytes(value.length);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return { bytes: out, headers: res.headers };
}

export async function bootMachine({ token, onStatus, onOutput }) {
  const image = await (await fetch("/vm/image.json")).json();
  const files = ["bzImage", "initrd.cpio.gz", "seabios.bin", "vgabios.bin"];
  const total = { bzImage: 7.72e6, "initrd.cpio.gz": 0.95e6, "seabios.bin": 0.13e6, "vgabios.bin": 0.04e6, bundle: 0.01e6 };
  const expected = Object.values(total).reduce((a, b) => a + b, 0);
  let got = 0;
  const tick = (n) => { got += n; onStatus({ phase: "download", progress: Math.min(1, got / expected) }); };

  onStatus({ phase: "download", progress: 0 });
  const [kernel, initrd, bios, vgabios, bundle] = await Promise.all([
    ...files.map((f) => fetchWithProgress(`/vm/${f}`, tick)),
    fetchWithProgress("/api/bundle", tick, { headers: { authorization: `Bearer ${token}` } }),
  ]);
  const expectedSha = bundle.headers.get("X-FF-Bundle-SHA256");

  // the kernel unpacks every cpio archive in the initrd, in order
  const combined = new Uint8Array(initrd.bytes.length + bundle.bytes.length);
  combined.set(initrd.bytes, 0);
  combined.set(bundle.bytes, initrd.bytes.length);

  onStatus({ phase: "boot", startedAt: performance.now() });
  const emu = new V86({
    wasm_path: "/vm/v86.wasm",
    memory_size: image.memory_mb * 1024 * 1024,
    vga_memory_size: 2 * 1024 * 1024,
    bios: { buffer: bios.bytes.buffer },
    vga_bios: { buffer: vgabios.bytes.buffer },
    bzimage: { buffer: kernel.bytes.buffer },
    initrd: { buffer: combined.buffer },
    cmdline: image.cmdline,
    autostart: true,
    disable_keyboard: true,
    disable_mouse: true,
    disable_speaker: true,
  });

  const decoder = new TextDecoder();
  let pending = [];
  let held = ""; // output before the install marker
  let live = false;
  let raf = 0;
  const flush = () => {
    raf = 0;
    if (!pending.length) return;
    const text = decoder.decode(new Uint8Array(pending), { stream: true });
    pending = [];
    if (live) { onOutput(text); return; }
    held += text;
    const m = held.match(/@@FF:(INSTALLED|INSTALL_FAILED|NO_BUNDLE) ?([0-9a-f]*)@@\r?\n?/);
    if (!m) return;
    live = true;
    onStatus({
      phase: m[1] === "INSTALLED" ? "ready" : "error",
      installedSha: m[2] || null,
      expectedSha,
      verified: m[1] === "INSTALLED" && m[2] === expectedSha,
      error: m[1] === "INSTALLED" ? null : "Your missions didn't install. Restart the machine to try again.",
    });
    onOutput(held.slice(m.index + m[0].length).replace(/^\r?\n+/, ""));
  };
  emu.add_listener("serial0-output-byte", (b) => {
    pending.push(b);
    if (!raf) raf = requestAnimationFrame(flush);
  });

  return {
    send: (s) => emu.serial0_send(s),
    destroy: () => emu.destroy(),
  };
}
