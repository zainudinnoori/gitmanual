import { existsSync } from "node:fs";

// The PDF manual design is private: the gitmanual-pdf package, installed with `npm run pdf:link` (locally) or
// `npm run pdf:install` (on Vercel). Without it, "gitmanual-pdf" points at a stand-in and PDF downloads are off.
const PDF_DESIGN = existsSync(new URL("./node_modules/gitmanual-pdf/package.json", import.meta.url));

// Security headers on every response. The Content-Security-Policy is deliberately light: it doesn't list allowed
// scripts (that would break Carbon, Stripe, Vercel Analytics and Next's own inline scripts), but it stops other sites
// framing gitmanual, injected <base> and plugin tricks, and forms posting anywhere unexpected.
const CSP = [
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self' https://checkout.stripe.com https://github.com",
  "upgrade-insecure-requests",
].join("; ");
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Pages opened in a new tab can't reach back into gitmanual; Stripe and GitHub sign-in open as full pages, so
  // nothing needs that link. Vercel sends HSTS on its own; this adds subdomains (only www, already HTTPS) to it.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false, // no "x-powered-by: Next.js"
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // The private design ships as TypeScript source; Next compiles it with the site.
  transpilePackages: PDF_DESIGN ? ["gitmanual-pdf"] : [],
  turbopack: PDF_DESIGN ? {} : { resolveAlias: { "gitmanual-pdf": "./lib/pdf-missing.ts" } },
  // Lets the download dialog hide the PDF option on copies without the design.
  env: { NEXT_PUBLIC_PDF_DESIGN: PDF_DESIGN ? "on" : "" },
  // Finds are read from content/finds/*.md at runtime, so ship them with every server function.
  // The PDF manual (the private gitmanual-pdf package) reads its fonts from @fontsource at runtime.
  outputFileTracingIncludes: {
    "/**/*": ["./content/**/*"],
    "/api/download": ["./node_modules/@fontsource/{bricolage-grotesque,geist-sans,geist-mono}/files/*-latin-{400,600,700,800}-normal.woff"],
  },
  // Old links used /?url=<GitHub link>; /go turns them into the repo's page (the query string comes along).
  async redirects() {
    return [{ source: "/", has: [{ type: "query", key: "url" }], destination: "/go", permanent: false }];
  },
};
export default nextConfig;
