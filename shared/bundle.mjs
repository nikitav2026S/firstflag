// Turns generated mission instances into one shell script that the VM's /init
// runs once as root at boot, then deletes. The script travels inside a small
// cpio archive appended to the shared initrd (see shared/cpio.mjs). File
// contents are base64 + busybox uudecode so binary data survives intact.
import { createHash as hash } from "node:crypto";
import { cpio } from "./cpio.mjs";

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function buildInstallScript(instances) {
  const out = ["set -e", "umask 022", "HOME_DIR=/home/student", ""];
  for (const inst of instances) {
    out.push(`# --- mission ${inst.missionId} ---`);
    for (const f of inst.files) {
      const path = f.path.startsWith("/") ? f.path : `/home/student/${f.path}`;
      const dir = path.slice(0, path.lastIndexOf("/"));
      const data = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, "utf8");
      const owner = f.owner ?? "1000:1000";
      out.push(`mkdir -p ${q(dir)}`);
      out.push(`{ echo 'begin-base64 644 -'; cat <<'__FF_EOF__'`);
      out.push(...(data.toString("base64").match(/.{1,76}/g) ?? [""]));
      out.push(`__FF_EOF__`, `echo '===='; } | uudecode -o - > ${q(path)}`);
      out.push(`chown ${owner} ${q(path)}`, `chmod ${(f.mode ?? 0o644).toString(8)} ${q(path)}`);
    }
    for (const d of inst.dirs ?? []) {
      out.push(`mkdir -p ${q(d.path)} && chown ${d.owner ?? "1000:1000"} ${q(d.path)} && chmod ${(d.mode ?? 0o755).toString(8)} ${q(d.path)}`);
    }
    for (const line of inst.run ?? []) out.push(line);
    out.push("");
  }
  // mission directories belong to the student (file ownership stays as declared)
  out.push("find /home/student/missions -type d -exec chown 1000:1000 {} \\; 2>/dev/null || true");
  out.push("echo installed");
  return out.join("\n") + "\n";
}

/**
 * Per-student initrd overlay: /opt/ff/install.sh, run by /init and then deleted.
 * `sha256` is what /init reports after installing, so the browser can confirm
 * the VM installed exactly the bundle the server built.
 */
export function packBundle(instances) {
  const script = buildInstallScript(instances);
  const overlay = cpio([
    { path: "opt", dir: true },
    { path: "opt/ff", dir: true, mode: 0o700 },
    { path: "opt/ff/install.sh", data: script, mode: 0o700 },
  ]);
  return { overlay, sha256: hash("sha256").update(script, "utf8").digest("hex"), bytes: overlay.length };
}
