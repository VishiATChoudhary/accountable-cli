import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Package root, whether running from source (src/*.ts) or the bundle (dist/*.js). */
export function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 4; i++) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "assets"))) return dir;
    dir = resolve(dir, "..");
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}
