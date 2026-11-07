export default {
  id: "02-haystack",
  version: 1,
  title: "Needle in a Haystack",
  difficulty: 1,
  concepts: ["log files", "grep", "pipes"],
  briefing:
    "This server's SSH log has thousands of failed logins from a brute-force attack. Exactly one login succeeded, and its session id is the flag. Reading it line by line would take hours.",
  hints: [
    "You don't need to read every line. What word would appear only in the successful login?",
    "`grep` prints only the lines that match a pattern. Successful SSH logins say `Accepted`.",
    "Search the file for a word, e.g. `grep Accepted <file>`, or for the flag shape: `grep -o 'ktp{[a-z0-9]*}' <file>`.",
  ],
  build(r, flag) {
    const dir = "missions/02-haystack";
    const users = ["admin", "root", "test", "oracle", "ubuntu", "pi", "guest", "ftp", "postgres", "git"];
    const lines = 2600 + r.int(800);
    const hit = 400 + r.int(lines - 800);
    const ip = `203.0.113.${10 + r.int(200)}`;
    const awkSeed = r.int(1e9);
    // Generated inside the VM by awk so the bundle stays tiny.
    const gen = `awk -v seed=${awkSeed} -v n=${lines} -v hit=${hit} -v ip=${ip} -v flag='${flag}' 'BEGIN{
  srand(seed); split("${users.join(" ")}", u, " ");
  for(i=1;i<=n;i++){
    s=i*7; hh=int(s/3600)%24; mm=int(s/60)%60; ss=s%60; pid=1000+int(rand()*30000);
    if(i==hit){ printf "Nov  7 %02d:%02d:%02d firstflag sshd[%d]: Accepted password for svc-backup from %s port %d ssh2 session=%s\\n", hh,mm,ss,pid,ip,1024+int(rand()*60000),flag }
    else { printf "Nov  7 %02d:%02d:%02d firstflag sshd[%d]: Failed password for invalid user %s from %s port %d ssh2\\n", hh,mm,ss,pid,u[1+int(rand()*10)],ip,1024+int(rand()*60000) }
  }}' > /home/student/${dir}/auth.log`;
    return {
      files: [{ path: `${dir}/README.txt`, content: `MISSION 02 — Needle in a Haystack\n\n${this.briefing}\n\nLog file: auth.log\n` }],
      run: [gen, `chown 1000:1000 /home/student/${dir}/auth.log`],
    };
  },
  solve: "grep Accepted ~/missions/02-haystack/auth.log",
};
