import { LAYERS } from "../flags.mjs";

export default {
  id: "04-layers",
  version: 1,
  title: "Layers",
  difficulty: 2,
  concepts: ["encodings", "base64", "rot13 with tr", "rev", "undoing steps in reverse order"],
  briefing:
    "We intercepted a transmission. The sender disguised the flag by applying three encodings, one after another. notes.txt says which ones, in the order they were applied. To get the flag back, undo them — last one first.",
  hints: [
    "If someone applied A, then B, then C, which one do you have to undo first?",
    "`base64 -d` decodes base64. `tr 'A-Za-z' 'N-ZA-Mn-za-m'` undoes rot13. `rev` reverses text. Pipes `|` chain them.",
    "Chain the decoders in reverse order of notes.txt, e.g. `cat file | <undo last> | <undo middle> | <undo first>`.",
  ],
  build(r, flag) {
    const dir = "missions/04-layers";
    const order = r.shuffle(Object.keys(LAYERS)); // applied in this order
    let data = flag;
    for (const l of order) data = LAYERS[l](data);
    return {
      files: [
        { path: `${dir}/README.txt`, content: `MISSION 04 — Layers\n\n${this.briefing}\n` },
        { path: `${dir}/transmission.txt`, content: `${data}\n` },
        { path: `${dir}/notes.txt`, content: `intercept notes\n---------------\nlayers applied (in order): ${order.join(",")}\n` },
      ],
    };
  },
  solve: [
    "cd ~/missions/04-layers; d=$(cat transmission.txt)",
    "for l in $(sed -n 's/^layers applied (in order): //p' notes.txt | tr ',' '\\n' | sed '1!G;h;$!d'); do",
    "case $l in base64) d=$(echo \"$d\" | base64 -d);; rot13) d=$(echo \"$d\" | tr 'A-Za-z' 'N-ZA-Mn-za-m');; rev) d=$(echo \"$d\" | rev);; esac; done",
    "echo \"$d\"",
  ].join("; ").replace("do;", "do"),
};
