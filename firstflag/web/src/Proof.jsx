import { useEffect, useState } from "react";
import { api } from "./api.js";

const short = (h) => (h ? `${h.slice(0, 12)}…` : "none");

export function Proof({ onClose, vm }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.proof().then(setP).catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="proof-title" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2 id="proof-title">How we know every mission works</h2>
          <button className="link" onClick={onClose} autoFocus>Close</button>
        </header>
        {err && <p role="alert">{err}</p>}
        {!p ? <p>Loading…</p> : (
          <>
            <p className="sheet-lede">
              Before a mission is served, a verifier boots this exact machine image for several synthetic students,
              runs a reference solver as each one, and checks for that student's exact flag. It also checks that the
              check can fail: a machine with someone else's flags, or with no missions, must not pass.
            </p>
            <table className="proof-table">
              <thead><tr><th scope="col">Mission</th><th scope="col">Status</th><th scope="col">Solved</th><th scope="col">Controls</th><th scope="col">Template</th></tr></thead>
              <tbody>
                {Object.entries(p.missions).map(([id, m]) => (
                  <tr key={id}>
                    <th scope="row">{m.title}</th>
                    <td className={m.status === "verified" ? "ok" : "bad"}>{m.status}</td>
                    <td>{m.passed ?? "none"}</td>
                    <td>{m.controls ? Object.entries(m.controls).map(([k, v]) => `${k.replace("_", "-")} ${v.detected ? "caught" : "missed"}`).join(", ") : "none"}</td>
                    <td><code>{short(m.template_sha256)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="proof-facts">
              <div><dt>Verifier run</dt><dd>{p.verification ? `${p.verification.seeds} students, finished ${new Date(p.verification.finished).toLocaleString()}, git ${p.verification.git?.head ? short(p.verification.git.head) : "none"}${p.verification.authoritative ? "" : " (uncommitted changes, not authoritative)"}` : "not run yet"}</dd></div>
              <div><dt>Machine image</dt><dd>{p.image.matches ? "matches the lockfile" : "does not match the lockfile"}; kernel <code>{short(p.image.lock.bzImage)}</code>, initrd <code>{short(p.image.lock["initrd.cpio.gz"])}</code></dd></div>
              <div><dt>Your machine</dt><dd>{vm?.phase === "ready" ? `installed bundle ${short(vm.installedSha)}, ${vm.verified ? "matches the server" : "does not match the server"}` : "still starting"}</dd></div>
              <div><dt>Tutor</dt><dd>{p.tutor.mode}{p.tutor.model ? ` (${p.tutor.model})` : ""}. The model is never given a flag.</dd></div>
              {p.evals?.suites?.guard && (
                <div><dt>Leak guard</dt><dd>caught {p.evals.suites.guard.caught} simulated leaks, wrongly blocked {p.evals.suites.guard.false_blocks} safe replies; {p.evals.suites.guard.transcript_redaction}</dd></div>
              )}
              {p.evals?.suites?.jailbreak && (
                <div><dt>Jailbreak suite</dt><dd>{p.evals.suites.jailbreak.mode === "live" ? `${p.evals.suites.jailbreak.model}: ` : "offline hints only: "}flag leaks {p.evals.suites.jailbreak.final_leaks}, replies blocked by guard {p.evals.suites.jailbreak.model_attempts_caught_by_guard}, honest questions refused {p.evals.suites.jailbreak.benign_refused}</dd></div>
              )}
            </dl>
            <p className="sheet-note">Known limit: a determined student can dig a flag out of the machine image their browser downloaded. We count that as a solve the hard way.</p>
          </>
        )}
      </section>
    </div>
  );
}
