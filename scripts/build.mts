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
 * script is in the `script-src` of every header the build actually wrote
 * (including Vercel's Build Output API, when present), so a mismatch fails the
 * build instead of breaking the site.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Where Next writes prerendered HTML. Searched recursively because the layout
 * depends on the build: `server/app/en.html` for `next start`, but
 * `server/route-cache/APP_PAGE/<key>/$/en.html` plus `server/pages/404.html`
 * when a deployment adapter is set, as Vercel does.
 */
const SERVER_DIR = join(".next", "server");

/**
 * Vercel's Build Output API directory: what a Vercel deployment serves, when
 * its adapter writes it during the build. Absent locally.
 */
const VERCEL_OUTPUT = join(".vercel", "output");

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

/** Paths of every `.html` file under `dir`, or none if it doesn't exist. */
function htmlFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".html"))
    .map((f) => join(dir, f));
}

/** Base64 sha256 of each inline script in the given HTML files, sorted and without duplicates. */
function inlineScriptHashes(files: string[]): string[] {
  const hashes = new Set<string>();
  for (const file of files) {
    for (const [, body = ""] of readFileSync(file, "utf8").matchAll(SCRIPT)) {
      if (body !== "") {
        hashes.add(createHash("sha256").update(body, "utf8").digest("base64"));
      }
    }
  }
  return [...hashes].sort();
}

/** What a failure needs for diagnosis: which HTML files exist where. */
function layout(): string {
  const files = [...htmlFiles(".next"), ...htmlFiles(VERCEL_OUTPUT)];
  const listed = files.slice(0, 40).map((f) => `  ${f}`);
  return [
    `HTML files under .next and ${VERCEL_OUTPUT} (${files.length}):`,
    ...listed,
    ...(files.length > listed.length ? ["  …"] : []),
    `${join(VERCEL_OUTPUT, "config.json")} ${existsSync(join(VERCEL_OUTPUT, "config.json")) ? "exists" : "does not exist"}`,
  ].join("\n");
}

/** Stops the build with a message. */
function fail(message: string): never {
  process.stderr.write(`CSP: ${message}\n${layout()}\n`);
  process.exit(1);
}

/** The `script-src` sources of a policy. */
function scriptSources(policy: string): string[] {
  const directive = policy.split(";").find((d) => d.trim().startsWith("script-src ")) ?? "";
  return directive.trim().split(/\s+/).slice(1);
}

/**
 * Every Content-Security-Policy value the build shipped: from the routes
 * manifest (`next start`) and, when present, from the Build Output API routes
 * that a Vercel deployment serves. Either file without one fails the build
 * rather than skipping the check.
 */
function shippedPolicies(): string[] {
  const isCsp = (key: string) => key.toLowerCase() === "content-security-policy";
  const manifest = JSON.parse(readFileSync(join(".next", "routes-manifest.json"), "utf8")) as {
    headers?: { headers?: { key: string; value: string }[] }[];
  };
  const fromManifest = (manifest.headers ?? [])
    .flatMap((route) => route.headers ?? [])
    .filter((header) => isCsp(header.key))
    .map((header) => header.value);
  if (fromManifest.length === 0) {
    fail("no Content-Security-Policy header in .next/routes-manifest.json.");
  }
  const configPath = join(VERCEL_OUTPUT, "config.json");
  if (!existsSync(configPath)) {
    return fromManifest;
  }
  const config = JSON.parse(readFileSync(configPath, "utf8")) as { routes?: { headers?: Record<string, string> }[] };
  const fromVercel = (config.routes ?? [])
    .flatMap((route) => Object.entries(route.headers ?? {}))
    .filter(([key]) => isCsp(key))
    .map(([, value]) => value);
  if (fromVercel.length === 0) {
    fail(`no Content-Security-Policy header in ${configPath}.`);
  }
  return [...fromManifest, ...fromVercel];
}

const STABLE_BUILD_ID = randomUUID();

nextBuild({ STABLE_BUILD_ID, CSP_MEASURE: "1" });
const measured = inlineScriptHashes(htmlFiles(SERVER_DIR));
if (measured.length === 0) {
  // Most likely Next moved its prerendered HTML; shipping no hashes would block hydration.
  fail(`no inline scripts found under ${SERVER_DIR}.`);
}
process.stdout.write(`\nCSP: rebuilding with ${measured.length} inline script hashes\n\n`);
nextBuild({ STABLE_BUILD_ID, CSP_SCRIPT_HASHES: measured.join(" ") });

// Check the pages that ship against the headers that ship, not against the first pass.
const pages = [...htmlFiles(SERVER_DIR), ...htmlFiles(VERCEL_OUTPUT)];
const shipped = inlineScriptHashes(pages);
if (shipped.length === 0) {
  fail(`no inline scripts found after the second build.`);
}
const policies = shippedPolicies();
for (const policy of policies) {
  const sources = scriptSources(policy);
  const missing = shipped.filter((hash) => !sources.includes(`'sha256-${hash}'`));
  if (missing.length > 0) {
    fail(`${missing.length} inline scripts are not in a shipped script-src and would be blocked.`);
  }
}
process.stdout.write(
  `CSP: ${shipped.length} inline scripts in ${pages.length} HTML files match ${policies.length} shipped policies` +
    ` (${existsSync(VERCEL_OUTPUT) ? `including ${VERCEL_OUTPUT}` : `no ${VERCEL_OUTPUT}`})\n`,
);
