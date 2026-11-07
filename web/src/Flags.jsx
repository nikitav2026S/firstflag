// International maritime signal flags, Alfa to Foxtrot: one per mission, in order.
// Uncaptured flags are drawn in outline; captured flags are hoisted in colour.
const Y = "var(--signal-yellow)", B = "var(--signal-blue)", R = "var(--signal-red)", W = "var(--flag-white)";

const SHAPES = {
  A: [{ d: "M0 0H30V40H0Z", fill: W }, { d: "M30 0H60L45 20L60 40H30Z", fill: B }],
  B: [{ d: "M0 0H60L45 20L60 40H0Z", fill: R }],
  C: [
    { d: "M0 0H60V8H0Z", fill: B }, { d: "M0 8H60V16H0Z", fill: W }, { d: "M0 16H60V24H0Z", fill: R },
    { d: "M0 24H60V32H0Z", fill: W }, { d: "M0 32H60V40H0Z", fill: B },
  ],
  D: [{ d: "M0 0H60V10H0Z", fill: Y }, { d: "M0 10H60V30H0Z", fill: B }, { d: "M0 30H60V40H0Z", fill: Y }],
  E: [{ d: "M0 0H60V20H0Z", fill: B }, { d: "M0 20H60V40H0Z", fill: R }],
  F: [{ d: "M0 0H60V40H0Z", fill: W }, { d: "M30 2L58 20L30 38L2 20Z", fill: R }],
};
const OUTLINE = { A: "M0 0H60L45 20L60 40H0Z", B: "M0 0H60L45 20L60 40H0Z" };
export const LETTERS = ["A", "B", "C", "D", "E", "F"];
export const NAMES = { A: "Alfa", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot" };

export function SignalFlag({ letter, captured, size = 36, className = "" }) {
  const outline = OUTLINE[letter] ?? "M0 0H60V40H0Z";
  return (
    <svg
      className={`flag ${captured ? "is-captured" : "is-open"} ${className}`}
      viewBox="-2 -2 64 44" width={size} height={(size * 44) / 64}
      role="img" aria-label={`Signal flag ${NAMES[letter]}${captured ? ", captured" : ""}`}
    >
      <g className="flag-fill">{SHAPES[letter].map((s, i) => <path key={i} d={s.d} fill={s.fill} />)}</g>
      <path className="flag-edge" d={outline} />
    </svg>
  );
}

/** The header halyard: all six flags on one line, the progress indicator. */
export function Halyard({ missions }) {
  return (
    <div className="halyard" aria-label={`${missions.filter((m) => m.solved).length} of ${missions.length} flags captured`}>
      <span className="halyard-line" aria-hidden="true" />
      {missions.map((m, i) => <SignalFlag key={m.id} letter={LETTERS[i]} captured={m.solved} size={26} />)}
    </div>
  );
}
