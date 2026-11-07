// Copies the v86 WebAssembly core next to the VM image so the browser can load it.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(dirname(createRequire(import.meta.url).resolve("v86")), "v86.wasm");
mkdirSync(join(ROOT, "web", "public", "vm"), { recursive: true });
copyFileSync(src, join(ROOT, "web", "public", "vm", "v86.wasm"));
console.log("copied v86.wasm → web/public/vm/");
