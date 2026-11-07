import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * sha256 sources for the inline scripts Next writes into each prerendered page.
 * `scripts/build.mts` (`npm run build`) measures them in a first build and sets
 * this for the second. A production build without it gets `script-src 'self'`
 * only, which blocks those scripts: the pages render but never hydrate, so a
 * build that skipped the script fails loudly instead of shipping a weaker CSP.
 */
const scriptHashes = (process.env.CSP_SCRIPT_HASHES ?? "")
  .split(" ")
  .filter(Boolean)
  .map((hash) => `'sha256-${hash}'`);

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
  /** `/` has no page of its own: send visitors to the default locale. */
  async redirects() {
    return [{ source: "/", destination: "/en", permanent: false }];
  },
  async headers() {
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
