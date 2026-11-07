import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy without nonces, so pages stay statically generated.
 * `connect-src 'self'` is what backs the README's privacy claim: the page can't
 * send an uploaded file (or anything else) to another origin. If telemetry ever
 * ships to a real collector, add exactly that one origin here.
 * `'unsafe-eval'` is dev-only (React uses eval for debug stacks).
 * No `upgrade-insecure-requests`: Safari applies it to http://localhost too, so
 * every asset of the dev server or a local build fails over https. In production
 * it adds nothing: every source is same-origin, and Vercel already redirects
 * http to https and sends HSTS.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
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
