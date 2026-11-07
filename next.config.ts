import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * sha256 sources for the inline scripts Next writes into each prerendered page.
 * `scripts/build.mts` (`npm run build`) measures them in a first build, run with
 * `CSP_MEASURE=1`, and sets this for the second.
 */
const scriptHashes = (process.env.CSP_SCRIPT_HASHES ?? "")
  .split(" ")
  .filter(Boolean)
  .map((hash) => `'sha256-${hash}'`);

/**
 * Throws when a production build would ship `script-src 'self'` with no hashes.
 * Such a build passes and deploys, but the CSP blocks Next's inline scripts so
 * the pages never hydrate. Checked in `headers()` because Next calls it only
 * while building (it bakes the result into the routes manifest); `next start`
 * and `next typegen` load this file too and must not fail.
 * @throws Error  When neither hashes nor the measuring flag are set outside dev.
 */
function assertScriptHashes(): void {
  if (!isDev && scriptHashes.length === 0 && process.env.CSP_MEASURE !== "1") {
    throw new Error("CSP: no inline script hashes. Build with `npm run build` (scripts/build.mts), not `next build`.");
  }
}

/**
 * Content-Security-Policy, kept static so pages stay prerendered (nonces would
 * make every page render per request).
 * `connect-src 'self'` is what backs the README's privacy claim: the page can't
 * send an uploaded file (or anything else) to another origin. If telemetry ever
 * ships to a real collector, add exactly that one origin here.
 * `script-src` allows same-origin chunks and the hashed inline scripts, so an
 * injected `onerror=` handler or `javascript:` link doesn't run. Dev keeps
 * `'unsafe-inline'` (its inline scripts change on every edit) and
 * `'unsafe-eval'` (React uses eval for debug stacks).
 * No `upgrade-insecure-requests`: every source is same-origin, Vercel already
 * redirects to HTTPS and sends HSTS, and Safari applies it to http://localhost,
 * which breaks local dev.
 */
const csp = [
  "default-src 'self'",
  ["script-src 'self'", ...(isDev ? ["'unsafe-inline'", "'unsafe-eval'"] : scriptHashes)].join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  /**
   * The RSC payload inlined in each page contains the build ID, so both passes
   * of `scripts/build.mts` must share one for the script hashes to match.
   * Unset (dev, plain `next build`), Next picks a random one.
   */
  generateBuildId: () => process.env.STABLE_BUILD_ID ?? null,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /**
   * `/` has no page of its own, and an unknown locale (`/lv`, `/EN`) is most
   * likely a guessed or mistyped link: both go to the default locale, keeping
   * the query so a sample link still opens its result. Temporary, so adding a
   * locale later isn't fought by cached redirects. Segments with a dot are left
   * alone, because redirects run before `public/` files (`/favicon.ico`).
   */
  async redirects() {
    return [
      { source: "/", destination: "/en", permanent: false },
      { source: "/:locale((?!(?:en|et)$)[^/.]+)", destination: "/en", permanent: false },
    ];
  },
  /**
   * Any other unknown first segment (`/x.y`, not a file) would match `[locale]`
   * and render its 404 at request time, with inline scripts that contain the
   * path and so aren't in the CSP. Sent instead to a path no route matches, so
   * it gets the prerendered 404, whose scripts are hashed. Not to `/_not-found`
   * itself: Vercel serves a rewrite to that page with status 200. The
   * destination has two segments because one would match `[locale]` again.
   * `afterFiles` runs after `public/` files, so `/favicon.ico` still resolves.
   */
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [{ source: "/:locale((?!(?:en|et)$)[^/]+)", destination: "/en/_no-page" }],
      fallback: [],
    };
  },
  async headers() {
    assertScriptHashes();
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
