export default {
  id: "05-strings",
  version: 1,
  title: "Strings Attached",
  difficulty: 2,
  concepts: ["binary files", "strings", "grep"],
  briefing:
    "firmware.bin is a binary blob from a smart lock. `cat` prints garbage. Somewhere inside, a developer left a readable debug token — the flag.",
  hints: [
    "Binary files are mostly unreadable bytes, but text can still hide inside. Is there a tool that pulls out only the readable parts?",
    "`strings` prints runs of printable characters from any file. Combine it with `grep`.",
    "Try `strings <file> | grep ktp`.",
  ],
  build(r, flag) {
    const dir = `/home/student/missions/05-strings`;
    const before = 2048 + r.int(4096);
    const after = 2048 + r.int(4096);
    return {
      files: [{ path: "missions/05-strings/README.txt", content: `MISSION 05 — Strings Attached\n\n${this.briefing}\n` }],
      run: [
        // random bytes generated in the VM; only the token is ours
        `{ head -c ${before} /dev/urandom; printf '\\000\\001DEBUG_TOKEN=%s\\000\\002' '${flag}'; head -c ${after} /dev/urandom; } > ${dir}/firmware.bin`,
        `chown 1000:1000 ${dir}/firmware.bin`,
      ],
    };
  },
  solve: "strings ~/missions/05-strings/firmware.bin | grep -o 'ktp{[a-z2-7]*}'",
};
