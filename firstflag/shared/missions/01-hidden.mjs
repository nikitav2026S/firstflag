export default {
  id: "01-hidden",
  version: 1,
  title: "Hidden in Plain Sight",
  difficulty: 1,
  concepts: ["hidden files (dotfiles)", "ls -a", "find"],
  briefing:
    "Someone left a secret in this mission folder, but `ls` shows nothing interesting. On Linux, any file whose name starts with a dot is hidden from a plain listing.",
  hints: [
    "What does a file name starting with `.` mean on Linux? Is `ls` showing you everything?",
    "`ls` has a flag that shows *all* files. `find` can also search by name pattern.",
    "Try listing everything, including inside subfolders: `ls -la <folder>`, or search: `find <folder> -name '.*'`.",
  ],
  build(r, flag) {
    const dir = "missions/01-hidden";
    const sub = r.pick(["archive", "old-drafts", "backup", "misc", "2025"]);
    const secret = r.pick(["notes", "stash", "keep", "todo-secret", "scratch"]);
    return {
      files: [
        { path: `${dir}/README.txt`, content: `MISSION 01 — Hidden in Plain Sight\n\n${this.briefing}\n\nThe flag looks like ktp{...}\n` },
        { path: `${dir}/welcome.txt`, content: "Nothing to see here. Or is there?\n" },
        { path: `${dir}/${sub}/report.txt`, content: "Quarterly report: all systems nominal.\n" },
        { path: `${dir}/${sub}/.${secret}`, content: `you found it!\n${flag}\n` },
      ],
    };
  },
  // A reference solver uses only what a student can see — never the seed.
  solve: "find ~/missions/01-hidden -type f -name '.*' -exec cat {} \\;",
};
