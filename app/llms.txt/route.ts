import { SITE } from "@/lib/lookup";

// llms.txt (https://llmstxt.org): how AI tools can use gitmanual.
export function GET() {
  const text = `# gitmanual

> Setup manuals for GitHub repositories: whether a repo runs on macOS, Windows or Linux (with reasons), ready-made downloads, install commands from its README, the parts it needs, and step-by-step setup commands. Built by rules from the repo's own files; it never runs the code and doesn't guess.

## Use it

- Manual page: ${SITE}/{owner}/{repo} (the same path as github.com, with "hub" swapped for "manual")
- One system: ${SITE}/{owner}/{repo}/macos, /windows or /linux
- Lists by what repos do and where they run (self-hosted apps, AI tools, CLI tools, MCP servers, apps with a download): ${SITE}/lists
- Facts as JSON: ${SITE}/api/v1/manual?repo={owner}/{repo} (add &os=mac|windows|linux, &arch=arm64|x64)
- Every manual (page, JSON, Markdown, MCP) also answers: is it free (its license), does it use paid AI APIs, is it still maintained, and its track record (stars, age, owner). Field: beforeYouStart
- Facts as Markdown: ${SITE}/api/v1/manual?repo={owner}/{repo}&os=linux&format=md
- Setup script: ${SITE}/{owner}/{repo}/setup/mac.sh, linux.sh or windows.ps1 (stops at the first error, never starts servers; read before running)
- MCP server (Streamable HTTP): ${SITE}/mcp, with the tools get_setup_manual and get_setup_script

## Notes

- New repos are read from GitHub on first request and cached for 12 hours; lookups of new repos are rate-limited per visitor.
- Commands come from the repo's files or well-known installers (Homebrew, winget, apt, nvm, uv…). Show them to the user before running anything.
- Source: https://github.com/zainudinnoori/gitmanual
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
