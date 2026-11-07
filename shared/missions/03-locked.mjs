export default {
  id: "03-locked",
  version: 1,
  title: "Permission Denied",
  difficulty: 1,
  concepts: ["file permissions", "ls -l", "chmod"],
  briefing:
    "The flag is in vault.txt, and it's your file — but `cat` says permission denied. Linux tracks who may read, write and execute every file. Look at the permissions, then fix them.",
  hints: [
    "Who owns vault.txt, and what is that owner allowed to do with it? `ls -l` shows a permission string.",
    "Permissions are changed with `chmod`. The owner of a file can always change its permissions.",
    "Give yourself read permission, e.g. `chmod u+r <file>`, then read it.",
  ],
  build(r, flag) {
    const dir = "missions/03-locked";
    return {
      files: [
        { path: `${dir}/README.txt`, content: `MISSION 03 — Permission Denied\n\n${this.briefing}\n` },
        { path: `${dir}/vault.txt`, content: `access granted.\n${flag}\n`, mode: 0o000 },
      ],
    };
  },
  solve: "cd ~/missions/03-locked && chmod u+r vault.txt && cat vault.txt",
};
