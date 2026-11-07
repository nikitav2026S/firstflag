export default {
  id: "06-ghost",
  version: 1,
  title: "Ghost in the Process",
  difficulty: 3,
  concepts: ["processes", "ps", "/proc filesystem", "environment variables"],
  briefing:
    "A background service on this machine is phoning home with a secret session token. It's not in any file. Running programs carry their own environment variables — and Linux exposes every process under /proc.",
  hints: [
    "How can you see which programs are running right now? Which one looks out of place?",
    "`ps` lists processes. Each process has a folder `/proc/<PID>/`, and `environ` inside it holds its environment variables.",
    "Find the PID with `ps`, then read `/proc/<PID>/environ`. The variables are separated by NUL bytes — `tr '\\0' '\\n'` makes them readable.",
  ],
  build(r, flag) {
    const name = r.pick(["telemetryd", "updaterd", "beacond", "syncd"]);
    const svc = `#!/bin/sh\n# ${name}: reports status to the mothership\nwhile :; do sleep 3600; done\n`;
    return {
      files: [
        { path: "missions/06-ghost/README.txt", content: `MISSION 06 — Ghost in the Process\n\n${this.briefing}\n` },
        { path: `/usr/local/sbin/${name}`, content: svc, mode: 0o755, owner: "0:0" },
      ],
      // runs as the student so the student may read its environ; the token lives
      // only in that process's memory
      run: [`su student -c 'exec env -i PATH=/bin:/usr/bin HOME=/home/student SESSION_TOKEN=${flag} setsid /usr/local/sbin/${name}' >/dev/null 2>&1 &`, "sleep 1"],
    };
  },
  solve: "for p in /proc/[0-9]*; do tr '\\0' '\\n' < $p/environ 2>/dev/null; done | grep -o 'ktp{[a-z2-7]*}' | sort -u",
};
