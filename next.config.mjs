/** @type {import('next').NextConfig} */
const nextConfig = {
  // Finds are read from content/finds/*.md at runtime, so ship them with every server function.
  outputFileTracingIncludes: { "/**/*": ["./content/**/*"] },
};
export default nextConfig;
