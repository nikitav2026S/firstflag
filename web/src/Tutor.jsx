import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { Rich } from "./Rich.jsx";

const LEVELS = [
  { n: 1, label: "Nudge", help: "A question to get you thinking" },
  { n: 2, label: "Point", help: "Which idea or tool to use" },
  { n: 3, label: "Show", help: "The command pattern, with placeholders" },
];

export function Tutor({ mission, transcriptRef }) {
  const [level, setLevel] = useState(1);
  const [threads, setThreads] = useState({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef(null);
  const msgs = threads[mission.id] ?? [];

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }); }, [msgs.length]);

  async function ask(e) {
    e?.preventDefault();
    const text = draft.trim() || "I'm stuck. What should I try next?";
    const history = msgs.map((m) => ({ role: m.role, text: m.text }));
    const add = (m) => setThreads((t) => ({ ...t, [mission.id]: [...(t[mission.id] ?? []), m] }));
    add({ role: "student", text });
    setDraft(""); setBusy(true);
    try {
      const r = await api.tutor({ missionId: mission.id, message: text, level, transcript: transcriptRef.current, history });
      add({ role: "tutor", text: r.reply, level: r.level, source: r.source, guard: r.guard, redactions: r.redactions });
    } catch (err) {
      add({ role: "tutor", text: err.message, source: "error" });
    } finally { setBusy(false); }
  }

  return (
    <section className="tutor" aria-label="Tutor">
      <header className="panel-head">
        <h2>Tutor</h2>
        <p className="panel-sub">Sees your terminal. Never sees your flag.</p>
      </header>

      <div className="tutor-log" ref={list} aria-live="polite">
        {msgs.length === 0 && (
          <p className="tutor-empty">Ask anything about this mission. Pick how much help you want first: a nudge, a pointer, or the command pattern.</p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <p>{m.role === "tutor" ? <Rich text={m.text} /> : m.text}</p>
            {m.role === "tutor" && m.source !== "error" && <GuardNote m={m} />}
          </div>
        ))}
        {busy && <div className="msg msg-tutor is-thinking"><p>Thinking…</p></div>}
      </div>

      <fieldset className="levels">
        <legend>How much help</legend>
        {LEVELS.map((l) => (
          <label key={l.n} className={level === l.n ? "is-on" : ""} title={l.help}>
            <input type="radio" name="level" value={l.n} checked={level === l.n} onChange={() => setLevel(l.n)} />
            {l.label}
          </label>
        ))}
      </fieldset>

      <form className="tutor-ask" onSubmit={ask}>
        <textarea
          value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
          placeholder={`Ask about ${mission.title}`}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) ask(e); }}
          aria-label="Your question"
        />
        <button type="submit" disabled={busy}>Ask</button>
      </form>
    </section>
  );
}

function GuardNote({ m }) {
  const bits = [];
  if (m.redactions) bits.push(`Removed ${m.redactions} secret${m.redactions > 1 ? "s" : ""} from your terminal before asking.`);
  if (m.guard?.blocked) bits.push(`Guard blocked the model's reply: ${m.guard.reasons.join("; ")}.`);
  const source = m.source === "claude" ? "Claude" : m.source === "guard" ? "Guard" : "Offline hint";
  return (
    <p className={`guard-note ${m.guard?.blocked ? "is-blocked" : ""}`}>
      <span className="guard-source">{source}, level {m.level}</span>
      {bits.length > 0 && <span> {bits.join(" ")}</span>}
    </p>
  );
}
