import { useEffect, useRef, useState } from "react";
import { api, session } from "./api.js";
import { SignalFlag, Halyard, LETTERS, NAMES } from "./Flags.jsx";
import { Terminal } from "./Terminal.jsx";
import { Tutor } from "./Tutor.jsx";
import { Instructor } from "./Instructor.jsx";
import { Proof } from "./Proof.jsx";
import { Rich } from "./Rich.jsx";

export default function App() {
  return location.pathname.startsWith("/instructor") ? <Instructor /> : <Student />;
}

function Student() {
  const [me, setMe] = useState(session.get());
  return me ? <Workspace me={me} onLeave={() => { session.clear(); setMe(null); }} /> : <Welcome onStart={setMe} />;
}

function Welcome({ onStart }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  async function go(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { const s = await api.start(name); session.set(s); onStart(s); }
    catch (x) { setErr(x.message); setBusy(false); }
  }
  return (
    <main className="welcome">
      <div className="welcome-flags" aria-hidden="true">
        {LETTERS.map((l) => <SignalFlag key={l} letter={l} captured size={64} />)}
      </div>
      <h1>Break into a real Linux machine. It runs in your browser tab.</h1>
      <p className="welcome-lede">
        Six missions teach the moves real security people use: finding hidden files, searching logs,
        fixing permissions, undoing encodings, pulling text out of binaries, and reading a running process.
        Each one hides a flag. Your flags are yours alone.
      </p>
      <form className="welcome-form" onSubmit={go}>
        <label htmlFor="name">Your name</label>
        <div className="welcome-row">
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" required maxLength={40} placeholder="Ada" />
          <button type="submit" disabled={busy}>{busy ? "Starting…" : "Boot my machine"}</button>
        </div>
        {err && <p className="form-error" role="alert">{err}</p>}
      </form>
      <p className="welcome-foot">Built at KTPHacks 2 for the Franklin Zhang Initiative, in memory of a brother who loved capture the flag.</p>
    </main>
  );
}

function Workspace({ me, onLeave }) {
  const [missions, setMissions] = useState([]);
  const [current, setCurrent] = useState(null);
  const [bootKey, setBootKey] = useState(0);
  const [vm, setVm] = useState({});
  const [showProof, setShowProof] = useState(false);
  const [justCaptured, setJustCaptured] = useState(null);
  const transcriptRef = useRef("");

  const load = () => api.missions().then((ms) => {
    setMissions(ms);
    setCurrent((c) => c ?? ms.find((m) => m.served && !m.solved)?.id ?? ms[0]?.id);
  }).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);

  const idx = missions.findIndex((m) => m.id === current);
  const mission = missions[idx];
  const solved = missions.filter((m) => m.solved).length;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="FirstFlag home">
          <SignalFlag letter="D" captured size={22} /> FirstFlag
        </a>
        {missions.length > 0 && <Halyard missions={missions} />}
        <p className="topbar-who">{me.name}, {solved} of {missions.length || 6} flags</p>
        <nav className="topbar-nav">
          <button className="link" onClick={() => setShowProof(true)}>How we verify</button>
          <button className="link" onClick={() => setBootKey((k) => k + 1)}>Restart machine</button>
          <button className="link" onClick={onLeave}>Sign out</button>
        </nav>
      </header>

      <aside className="missions" aria-label="Missions">
        <ol>
          {missions.map((m, i) => (
            <li key={m.id}>
              <button
                className={`mission-tab ${m.id === current ? "is-current" : ""} ${justCaptured === m.id ? "is-hoisting" : ""}`}
                onClick={() => setCurrent(m.id)} disabled={!m.served}
                aria-current={m.id === current ? "true" : undefined}
              >
                <SignalFlag letter={LETTERS[i]} captured={m.solved} size={34} />
                <span className="mission-tab-text">
                  <span className="mission-tab-title">{m.title}</span>
                  <span className="mission-tab-meta">
                    {NAMES[LETTERS[i]]}, {["", "starter", "intermediate", "challenge"][m.difficulty]}
                    {!m.served && ", not verified yet"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <main className="bench">
        {mission && (
          <header className="mission-head">
            <h1>{mission.title}</h1>
            <p><Rich text={mission.briefing} /></p>
            <p className="mission-where">Mission files: <code>~/missions/{mission.id}</code></p>
          </header>
        )}
        <Terminal token={me.token} bootKey={bootKey} transcriptRef={transcriptRef} onState={(s) => setVm((v) => ({ ...v, ...s }))} />
        <IntegrityLine vm={vm} />
        {mission && (
          <FlagForm
            mission={mission}
            transcriptRef={transcriptRef}
            onCaptured={() => { setJustCaptured(mission.id); load(); setTimeout(() => setJustCaptured(null), 1600); }}
          />
        )}
      </main>

      {mission && <Tutor key={mission.id} mission={mission} transcriptRef={transcriptRef} />}
      {showProof && <Proof onClose={() => setShowProof(false)} vm={vm} />}
    </div>
  );
}

function IntegrityLine({ vm }) {
  if (vm.phase !== "ready") return <p className="integrity" aria-live="polite">&nbsp;</p>;
  return (
    <p className={`integrity ${vm.verified ? "" : "is-bad"}`} aria-live="polite">
      {vm.verified
        ? <>Missions installed. The machine reported bundle <code>{vm.installedSha.slice(0, 12)}</code>, which matches what the server built.</>
        : <>The machine installed a different bundle than the server built. Restart the machine.</>}
    </p>
  );
}

function FlagForm({ mission, onCaptured, transcriptRef }) {
  const [flag, setFlag] = useState("");
  const [result, setResult] = useState(null);
  const [seen, setSeen] = useState(null); // most recent flag-shaped text in the terminal
  useEffect(() => { setFlag(""); setResult(null); }, [mission.id]);
  useEffect(() => {
    const t = setInterval(() => {
      const all = (transcriptRef.current || "").match(/ktp\{[a-z2-7]{16}\}/g);
      setSeen(all ? all[all.length - 1] : null);
    }, 700);
    return () => clearInterval(t);
  }, [transcriptRef]);
  async function submit(e) {
    e.preventDefault();
    try {
      const r = await api.submit(mission.id, flag);
      setResult(r);
      if (r.result === "correct") { setFlag(""); onCaptured(); }
    } catch (x) { setResult({ result: "error", message: x.message }); }
  }
  return (
    <form className="flag-form" onSubmit={submit}>
      <label htmlFor="flag">{mission.solved ? "Captured. Submit again any time." : "Found it? Paste the flag."}</label>
      <div className="flag-row">
        <input id="flag" value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="ktp{...}" spellCheck={false} autoComplete="off" />
        <button type="submit" disabled={!flag.trim()}>Submit flag</button>
      </div>
      {seen && seen !== flag && (
        <button type="button" className="link flag-from-terminal" onClick={() => setFlag(seen)}>
          Use <code>{seen}</code> from the terminal
        </button>
      )}
      {result && <p className={`flag-result is-${result.result}`} role="status">{result.message}</p>}
    </form>
  );
}
