// Minimal `newc` cpio writer. Linux unpacks every cpio archive concatenated
// into the initrd, so a per-student archive appended after the shared base
// image adds that student's mission installer without rebuilding anything.
export function cpio(entries) {
  const parts = [];
  let ino = 0x4000;
  const pad = (n) => Buffer.alloc((4 - (n % 4)) % 4);
  const push = (name, mode, data = Buffer.alloc(0)) => {
    const nameB = Buffer.from(name + "\0");
    const fields = [ino++, mode, 0, 0, 1, 0, data.length, 0, 0, 0, 0, nameB.length, 0];
    const hdr = Buffer.from("070701" + fields.map((v) => v.toString(16).toUpperCase().padStart(8, "0")).join(""));
    parts.push(hdr, nameB, pad(hdr.length + nameB.length), data, pad(data.length));
  };
  for (const e of entries) {
    if (e.dir) push(e.path, 0o040000 | (e.mode ?? 0o755));
    else push(e.path, 0o100000 | (e.mode ?? 0o644), Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data));
  }
  push("TRAILER!!!", 0);
  return Buffer.concat(parts);
}
