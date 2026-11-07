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
 * Afterwards it hashes the shipped pages again and fails unless every inline
 * script is in the `script-src` of the header the build actually wrote, so a
 * mismatch fails the build instead of breaking the site.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  if (!existsSync(PAGES_DIR)) {
    return [];
  }
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

/** Stops the build with a message. */
function fail(message: string): never {
  process.stderr.write(`CSP: ${message}\n`);
  process.exit(1);
}

/**
 * The `script-src` sources of every Content-Security-Policy header the build
 * shipped, read back from the routes manifest that `next start` and Vercel
 * serve headers from. An unreadable manifest fails the build rather than
 * skipping the check.
 */
function shippedScriptSources(): string[][] {
  const manifest = JSON.parse(readFileSync(join(".next", "routes-manifest.json"), "utf8")) as {
    headers?: { headers?: { key: string; value: string }[] }[];
  };
  const policies = (manifest.headers ?? [])
    .flatMap((route) => route.headers ?? [])
    .filter((header) => header.key.toLowerCase() === "content-security-policy")
    .map((header) => header.value);
  if (policies.length === 0) {
    fail("no Content-Security-Policy header in .next/routes-manifest.json.");
  }
  return policies.map((policy) => {
    const directive = policy.split(";").find((d) => d.trim().startsWith("script-src ")) ?? "";
    return directive.trim().split(/\s+/).slice(1);
  });
}

const STABLE_BUILD_ID = randomUUID();

nextBuild({ STABLE_BUILD_ID, CSP_MEASURE: "1" });
const measured = inlineScriptHashes();
if (measured.length === 0) {
  // Most likely Next moved its prerendered HTML; shipping no hashes would block hydration.
  fail(`no inline scripts found under ${PAGES_DIR}.`);
}
process.stdout.write(`\nCSP: rebuilding with ${measured.length} inline script hashes\n\n`);
nextBuild({ STABLE_BUILD_ID, CSP_SCRIPT_HASHES: measured.join(" ") });

// Check the pages that ship against the header that ships, not against the first pass.
const shipped = inlineScriptHashes();
if (shipped.length === 0) {
  fail(`no inline scripts found under ${PAGES_DIR} after the second build.`);
}
for (const sources of shippedScriptSources()) {
  const missing = shipped.filter((hash) => !sources.includes(`'sha256-${hash}'`));
  if (missing.length > 0) {
    fail(`${missing.length} inline scripts are not in the shipped script-src and would be blocked.`);
  }
}
