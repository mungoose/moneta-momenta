/**
 * Production build with a hash-based script CSP (`npm run build`).
 *
 * Next writes inline scripts into every prerendered page (the RSC payload and
 * the chunk loader), so `script-src` needs either `'unsafe-inline'`, per-request
 * nonces (which make every page dynamic) or the hash of each inline script.
 * The hashes are only known once the pages exist, but `next.config.ts` turns
 * headers into the routes manifest before it prerenders them. So this builds
 * twice: the first build is only hashed, the second one ships with those hashes
 * in its CSP. Both use the same build ID, because the RSC payload contains it;
 * with that fixed the output is byte-for-byte the same.
 *
 * Afterwards it hashes the shipped pages again and fails if any inline script
 * is not covered, so a mismatch fails the build instead of breaking the site.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Where Next writes prerendered HTML. */
const PAGES_DIR = join(".next", "server", "app");

/**
 * Every `<script>` and its body; an external one (`src`) has an empty body.
 * Next escapes `<` inside inline scripts, so a body can't contain `</script>`.
 */
const SCRIPT = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;

/** The project's own Next CLI, so the script also works outside `npm run`. */
const NEXT = join("node_modules", ".bin", "next");

/** Runs `next build` with extra environment variables; exits on failure. */
function nextBuild(env: Record<string, string>): void {
  const result = spawnSync(NEXT, ["build"], { stdio: "inherit", env: { ...process.env, ...env } });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/** Base64 sha256 of each inline script in the prerendered pages, sorted and without duplicates. */
function inlineScriptHashes(): string[] {
  const hashes = new Set<string>();
  const pages = readdirSync(PAGES_DIR, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".html"));
  for (const page of pages) {
    for (const [, body = ""] of readFileSync(join(PAGES_DIR, page), "utf8").matchAll(SCRIPT)) {
      if (body !== "") {
        hashes.add(createHash("sha256").update(body, "utf8").digest("base64"));
      }
    }
  }
  return [...hashes].sort();
}

const STABLE_BUILD_ID = randomUUID();

nextBuild({ STABLE_BUILD_ID });
const CSP_SCRIPT_HASHES = inlineScriptHashes().join(" ");
process.stdout.write(`\nCSP: rebuilding with ${CSP_SCRIPT_HASHES.split(" ").length} inline script hashes\n\n`);
nextBuild({ STABLE_BUILD_ID, CSP_SCRIPT_HASHES });

const allowed = new Set(CSP_SCRIPT_HASHES.split(" "));
const missing = inlineScriptHashes().filter((h) => !allowed.has(h));
if (missing.length > 0) {
  process.stderr.write(`CSP: ${missing.length} inline scripts changed between the two builds and would be blocked.\n`);
  process.exit(1);
}
