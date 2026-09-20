import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const FIXTURES_ROOT = fileURLToPath(new URL("../../fixtures/v1/", import.meta.url));

/** Reads a synthetic fixture relative to `fixtures/v1/`. */
export function fixture(relativePath: string): string {
  return readFileSync(new URL(`../../fixtures/v1/${relativePath}`, import.meta.url), "utf8");
}
