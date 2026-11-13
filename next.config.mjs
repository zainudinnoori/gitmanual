import { existsSync } from "node:fs";

// The PDF manual design is private: the gitmanual-pdf package, installed with `npm run pdf:link` (locally) or
// `npm run pdf:install` (on Vercel). Without it, "gitmanual-pdf" points at a stand-in and PDF downloads are off.
const PDF_DESIGN = existsSync(new URL("./node_modules/gitmanual-pdf/package.json", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
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
