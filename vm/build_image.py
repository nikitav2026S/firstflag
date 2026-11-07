#!/usr/bin/env python3
"""Build the FirstFlag VM image from pinned upstream packages. Stdlib only.

Outputs (into web/public/vm/):
  bzImage          Ubuntu 18.04 i386 kernel 4.15 (runs in v86, which emulates a 32-bit x86 PC)
  initrd.cpio.gz   busybox + our /init loader + rootfs/
  seabios.bin      SeaBIOS
  vgabios.bin      SeaBIOS stdvga ROM
and vm/image.lock.json with the sha256 of every input and output, so the
verifier can record exactly which bytes it booted.

Usage: python3 vm/build_image.py [--cache DIR]
"""
import argparse, gzip, hashlib, io, json, lzma, os, stat, sys, tarfile, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "public", "vm")
ROOTFS = os.path.join(ROOT, "vm", "rootfs")
MIRROR = "https://archive.ubuntu.com/ubuntu/"

PACKAGES = {
    "kernel": ("pool/main/l/linux/linux-image-4.15.0-213-generic_4.15.0-213.224_i386.deb",
               "da5497ea532127f11b9be52628cf3f5b6f65100e69866c2291752092f043529d"),
    "busybox": ("pool/main/b/busybox/busybox-static_1.27.2-2ubuntu3.4_i386.deb",
                "5185502a1fa5893b87cbf17b2f39492b8cf3d7ad73d79bd215f405949d80a34b"),
    "seabios": ("pool/main/s/seabios/seabios_1.13.0-1ubuntu1.1_all.deb",
                "9e4346f971c7ba71f86e493182dccf2d4cceeec118aac86c7c24a0f3925f6e5e"),
}

STUDENT_UID = 1000


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def fetch(name, cache):
    path, want = PACKAGES[name]
    local = os.path.join(cache, os.path.basename(path))
    if os.path.exists(local):
        data = open(local, "rb").read()
    else:
        print(f"  downloading {os.path.basename(path)}")
        data = urllib.request.urlopen(MIRROR + path, timeout=120).read()
        open(local, "wb").write(data)
    got = sha256(data)
    if got != want:
        sys.exit(f"sha256 mismatch for {name}: got {got}, pinned {want}. Refusing to build.")
    return data


def deb_data_tar(deb):
    """Parse the `ar` container of a .deb and return its data.tar as a TarFile."""
    assert deb[:8] == b"!<arch>\n", "not a deb"
    pos = 8
    while pos < len(deb):
        hdr = deb[pos:pos + 60]
        name = hdr[:16].decode().strip().rstrip("/")
        size = int(hdr[48:58].decode().strip())
        body = deb[pos + 60:pos + 60 + size]
        pos += 60 + size + (size & 1)
        if name.startswith("data.tar"):
            if name.endswith(".xz"):
                body = lzma.decompress(body)
            elif name.endswith(".gz"):
                body = gzip.decompress(body)
            elif name.endswith(".zst"):
                sys.exit("zstd data.tar not supported by this stdlib-only builder")
            return tarfile.open(fileobj=io.BytesIO(body))
    sys.exit("no data.tar in deb")


def member(tar, path):
    for m in tar.getmembers():
        if m.name.lstrip("./") == path.lstrip("/"):
            return tar.extractfile(m).read()
    sys.exit(f"{path} not found in package")


class Cpio:
    """Writer for the `newc` cpio format the kernel unpacks as initramfs."""

    def __init__(self):
        self.buf = io.BytesIO()
        self.ino = 1

    def _entry(self, name, mode, data=b"", uid=0, gid=0):
        name_b = name.encode() + b"\0"
        hdr = "070701" + "".join(f"{v:08X}" for v in (
            self.ino, mode, uid, gid, 1, 0, len(data), 0, 0, 0, 0, len(name_b), 0))
        self.ino += 1
        self.buf.write(hdr.encode() + name_b)
        self.buf.write(b"\0" * ((4 - (110 + len(name_b)) % 4) % 4))
        self.buf.write(data)
        self.buf.write(b"\0" * ((4 - len(data) % 4) % 4))

    def dir(self, name, perm=0o755, uid=0, gid=0):
        self._entry(name, stat.S_IFDIR | perm, uid=uid, gid=gid)

    def file(self, name, data, perm=0o644, uid=0, gid=0):
        self._entry(name, stat.S_IFREG | perm, data, uid, gid)

    def done(self):
        self._entry("TRAILER!!!", 0)
        return self.buf.getvalue()


def build_initrd(busybox):
    c = Cpio()
    for d in ["bin", "sbin", "usr", "usr/bin", "usr/sbin", "usr/local", "usr/local/bin",
              "usr/local/sbin", "etc", "proc", "sys", "dev", "run", "opt", "var", "var/log"]:
        c.dir(d)
    c.dir("tmp", 0o1777)
    c.dir("root", 0o700)
    c.dir("home")
    c.dir("home/student", 0o755, STUDENT_UID, STUDENT_UID)
    c.dir("home/student/missions", 0o755, STUDENT_UID, STUDENT_UID)
    c.file("bin/busybox", busybox, 0o755)
    for dirpath, dirnames, filenames in sorted(os.walk(ROOTFS)):
        rel = os.path.relpath(dirpath, ROOTFS)
        for fn in sorted(filenames):
            src = os.path.join(dirpath, fn)
            name = fn if rel == "." else f"{rel}/{fn}"
            perm = 0o755 if (fn == "init" or "/bin/" in f"/{name}" or "/sbin/" in f"/{name}") else 0o644
            c.file(name, open(src, "rb").read(), perm)
    gz = gzip.compress(c.done(), compresslevel=9, mtime=0)
    # Zero-pad to 512 bytes: the kernel skips zeros between initramfs archives
    # and needs each appended (per-student) cpio to start 4-byte aligned.
    return gz + b"\0" * (-len(gz) % 512)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(ROOT, "vm", ".cache"))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    print("fetching pinned packages")
    debs = {k: fetch(k, args.cache) for k in PACKAGES}
    kernel = member(deb_data_tar(debs["kernel"]), "boot/vmlinuz-4.15.0-213-generic")
    busybox = member(deb_data_tar(debs["busybox"]), "bin/busybox")
    sb = deb_data_tar(debs["seabios"])
    bios = member(sb, "usr/share/seabios/bios.bin")
    vgabios = member(sb, "usr/share/seabios/vgabios-stdvga.bin")
    initrd = build_initrd(busybox)

    outputs = {"bzImage": kernel, "initrd.cpio.gz": initrd, "seabios.bin": bios, "vgabios.bin": vgabios}
    for name, data in outputs.items():
        open(os.path.join(OUT, name), "wb").write(data)
        print(f"  wrote web/public/vm/{name:15s} {len(data):>9,} bytes")

    lock = {
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "inputs": {k: {"path": v[0], "sha256": v[1]} for k, v in PACKAGES.items()},
        "rootfs": {os.path.relpath(os.path.join(d, f), ROOTFS): sha256(open(os.path.join(d, f), "rb").read())
                   for d, _, fs in os.walk(ROOTFS) for f in fs},
        "outputs": {k: sha256(v) for k, v in outputs.items()},
        "cmdline": "console=ttyS0 quiet loglevel=1 tsc=reliable mitigations=off random.trust_cpu=on nokaslr",
        "memory_mb": 128,  # v86 loads the initrd at the 64 MiB mark, so RAM must exceed that
    }
    json.dump(lock, open(os.path.join(ROOT, "vm", "image.lock.json"), "w"), indent=2, sort_keys=True)
    # what the browser needs to boot the same bytes the verifier booted
    json.dump({k: lock[k] for k in ("cmdline", "memory_mb", "outputs")},
              open(os.path.join(OUT, "image.json"), "w"), indent=2, sort_keys=True)
    print("  wrote vm/image.lock.json and web/public/vm/image.json")


if __name__ == "__main__":
    main()
