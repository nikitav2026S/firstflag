import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { bootMachine } from "./vm.js";

const THEME = {
  background: "#0F1B30", foreground: "#E4EAF4", cursor: "#F2C230", cursorAccent: "#0F1B30",
  selectionBackground: "#2A4B86", black: "#15223B", red: "#F0705F", green: "#7FD49B", yellow: "#F2C230",
  blue: "#7DA6F0", magenta: "#C79AF0", cyan: "#7FD0E0", white: "#E4EAF4",
};

/**
 * A real Linux machine in the browser. Exposes the rolling terminal transcript
 * (for the tutor) through `transcriptRef`. `bootKey` changes → reboot.
 */
export function Terminal({ token, bootKey, transcriptRef, onState }) {
  const host = useRef(null);
  const [status, setStatus] = useState({ phase: "download", progress: 0 });

  useEffect(() => {
    let disposed = false, machine = null;
    const term = new XTerm({
      theme: THEME, fontFamily: '"Martian Mono", ui-monospace, monospace', fontSize: 13, lineHeight: 1.25,
      cursorBlink: true, scrollback: 4000, convertEol: false, allowProposedApi: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    transcriptRef.current = "";

    const start = async () => {
      await document.fonts?.load?.('13px "Martian Mono"').catch(() => {});
      if (disposed) return;
      term.open(host.current);
      fit.fit();
      try {
        machine = await bootMachine({
          token,
          onStatus: (s) => { if (!disposed) { setStatus((p) => ({ ...p, ...s })); onState?.(s); } },
          onOutput: (text) => {
            term.write(text);
            transcriptRef.current = (transcriptRef.current + text).slice(-20000);
          },
        });
        if (disposed) { machine.destroy(); return; }
        term.onData((d) => machine.send(d));
        // Ctrl+C copies when text is selected (otherwise it interrupts, as in any terminal)
        term.attachCustomKeyEventHandler((e) => {
          const isCopy = e.type === "keydown" && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c";
          if (isCopy && term.hasSelection()) {
            navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
            return false;
          }
          return true;
        });
      } catch (e) {
        if (!disposed) setStatus({ phase: "error", error: e.message });
      }
    };
    start();

    const ro = new ResizeObserver(() => { try { fit.fit(); } catch { /* not open yet */ } });
    ro.observe(host.current);
    return () => { disposed = true; ro.disconnect(); machine?.destroy(); term.dispose(); };
  }, [token, bootKey]);

  useEffect(() => {
    if (status.phase === "ready") host.current?.querySelector("textarea")?.focus();
  }, [status.phase]);

  return (
    <div className="terminal-wrap">
      <div className="terminal-host" ref={host} />
      {status.phase !== "ready" && <BootCard status={status} />}
    </div>
  );
}

function BootCard({ status }) {
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, []);
  if (status.phase === "error") {
    return <div className="boot-card" role="alert"><p className="boot-title">The machine stopped</p><p>{status.error}</p></div>;
  }
  const downloading = status.phase === "download";
  const secs = status.startedAt ? ((now - status.startedAt) / 1000).toFixed(1) : null;
  return (
    <div className="boot-card" aria-live="polite">
      <p className="boot-title">{downloading ? "Downloading your machine" : "Booting Linux 4.15"}</p>
      <div className="boot-bar"><span style={{ transform: `scaleX(${downloading ? status.progress ?? 0 : 1})` }} className={downloading ? "" : "is-indeterminate"} /></div>
      <p className="boot-note">
        {downloading
          ? "A real x86 kernel and your six missions, about 9 MB. Nothing runs on our servers."
          : `An emulated PC is starting the kernel inside this tab. ${secs}s`}
      </p>
    </div>
  );
}
