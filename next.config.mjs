/** @type {import('next').NextConfig} */
const nextConfig = {
  // Finds are read from content/finds/*.md at runtime, so ship them with every server function.
  outputFileTracingIncludes: { "/**/*": ["./content/**/*"] },
  // Old links used /?url=<GitHub link>; /go turns them into the repo's page (the query string comes along).
  async redirects() {
    return [{ source: "/", has: [{ type: "query", key: "url" }], destination: "/go", permanent: false }];
  },
};
export default nextConfig;
