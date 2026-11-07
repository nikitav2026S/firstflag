// Mission registry. Each mission is a seeded template:
//   build(rng, flag) -> { files, dirs?, run? }   generated per student
//   solve                                          reference solver; uses only what a student can see
// The verifier boots the real VM image and proves every template solvable
// before the server will serve it (see verify/verify.mjs).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deriveFlag, deriveSeed, rng } from "../flags.mjs";
import { packBundle } from "../bundle.mjs";

import m01 from "./01-hidden.mjs";
import m02 from "./02-haystack.mjs";
import m03 from "./03-locked.mjs";
import m04 from "./04-layers.mjs";
import m05 from "./05-strings.mjs";
import m06 from "./06-ghost.mjs";

export const MISSIONS = [m01, m02, m03, m04, m05, m06];
export const byId = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

const HERE = dirname(fileURLToPath(import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");

/**
 * Hash of everything that decides what a mission instance looks like: the
 * mission source, the generator/bundler code and the VM image. A verification
 * result only covers the exact template hash it ran against.
 */
export function templateHash(missionId, imageOutputs) {
  const parts = [
    readFileSync(join(HERE, `${missionId}.mjs`)),
    readFileSync(join(HERE, "..", "flags.mjs")),
    readFileSync(join(HERE, "..", "bundle.mjs")),
    JSON.stringify(imageOutputs),
  ];
  return sha(Buffer.concat(parts.map((p) => Buffer.from(p))));
}

export function instanceFor(secret, userId, mission) {
  const flag = deriveFlag(secret, userId, mission.id);
  const inst = mission.build(rng(deriveSeed(secret, userId, mission.id)), flag);
  return { missionId: mission.id, flag, ...inst };
}

export function bundleFor(secret, userId, missions = MISSIONS) {
  return packBundle(missions.map((m) => instanceFor(secret, userId, m)));
}

/** What the browser may see about a mission — never the solver, never the flag. */
export const publicMission = (m) => ({
  id: m.id, title: m.title, difficulty: m.difficulty, concepts: m.concepts, briefing: m.briefing,
});
