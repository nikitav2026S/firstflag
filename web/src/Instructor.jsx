import { useEffect, useState } from "react";
import { api } from "./api.js";
import { SignalFlag, LETTERS } from "./Flags.jsx";

export function Instructor() {
  const [key, setKey] = useState(() => { try { return sessionStorage.getItem("ff.instructor") || ""; } catch { return ""; } });
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  async function load(k = key) {
    try { const d = await api.instructor(k); setData(d); setErr(null); try { sessionStorage.setItem("ff.instructor", k); } catch { /* private mode */ } }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { if (key) load(); }, []);
  useEffect(() => { if (!data) return; const t = setInterval(() => load(), 5000); return () => clearInterval(t); }, [data !== null]);

  if (!data) {
    return (
      <main className="welcome">
        <h1>Instructor view</h1>
        <form className="welcome-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <label htmlFor="key">Instructor key</label>
          <div className="welcome-row">
            <input id="key" type="password" value={key} onChange={(e) => setKey(e.target.value)} required />
            <button type="submit">Open class</button>
          </div>
          {err && <p className="form-error" role="alert">{err}</p>}
        </form>
      </main>
    );
  }

  const titles = Object.fromEntries(data.missions.map((m) => [m.id, m.title]));
  return (
    <main className="instructor">
      <header className="instructor-head">
        <h1>Class progress</h1>
        <p>{data.students.length} students. Updates every 5 seconds.</p>
      </header>
      <div className="instructor-grid">
        <section aria-labelledby="progress-h">
          <h2 id="progress-h">Flags captured</h2>
          <table className="progress-table">
            <thead>
              <tr><th scope="col">Student</th>{data.missions.map((m, i) => <th key={m.id} scope="col" title={m.title}><SignalFlag letter={LETTERS[i]} captured size={22} /></th>)}</tr>
            </thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.id}>
                  <th scope="row">{s.name}</th>
                  {data.missions.map((m, i) => {
                    const st = s.missions[m.id];
                    return <td key={m.id}><SignalFlag letter={LETTERS[i]} captured={st.solved} size={20} /><span className="attempts">{st.attempts || ""}</span></td>;
                  })}
                </tr>
              ))}
              {data.students.length === 0 && <tr><td colSpan={7}>No students yet. Share the site link with your class.</td></tr>}
            </tbody>
          </table>
        </section>
        <section aria-labelledby="sharing-h">
          <h2 id="sharing-h">Shared flags</h2>
          <p className="instructor-note">Every machine has its own flag, so a flag submitted by the wrong student shows exactly where it came from.</p>
          <ul className="event-list">
            {data.sharing.length === 0 && <li>None so far.</li>}
            {data.sharing.slice().reverse().map((e, i) => (
              <li key={i}><strong>{e.submittedBy}</strong> submitted <strong>{e.flagOwner}</strong>'s flag for {titles[e.mission] ?? e.mission} <time>{new Date(e.ts).toLocaleTimeString()}</time></li>
            ))}
          </ul>
          <h2>Tutor</h2>
          <p className="instructor-note">{data.tutor.requests} questions asked, {data.tutor.redactions} secrets removed from terminals before they reached the model, {data.tutor.blocked.length} replies blocked by the guard.</p>
          <ul className="event-list">
            {data.tutor.blocked.map((b, i) => <li key={i}>{b.student}, {titles[b.mission_id] ?? b.mission_id}: {b.reasons} <time>{new Date(b.ts).toLocaleTimeString()}</time></li>)}
          </ul>
        </section>
      </div>
    </main>
  );
}
