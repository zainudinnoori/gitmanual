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
- Search the shelf: ${SITE}/api/v1/search?q={words}&os=mac|windows|linux&language=&difficulty=Easy|Moderate|Involved&minStars=&sort=stars|recent|popular|worked&rising=true&page=&perPage= (at most 50)
- Lists: ${SITE}/api/v1/lists, and one list with its repos: ${SITE}/api/v1/lists/{slug}
- Similar repos that run on a system: ${SITE}/api/v1/alternatives?repo={owner}/{repo}&os=windows
- Setup script: ${SITE}/{owner}/{repo}/setup/mac.sh, linux.sh or windows.ps1 (stops at the first error, never starts servers; read before running)
- MCP server (Streamable HTTP): ${SITE}/mcp, with the tools get_setup_manual, get_setup_script, search_repos, get_list and find_alternatives
- Full docs, limits and free API keys: ${SITE}/developers
- OpenAPI 3.1 description of the API: ${SITE}/api/v1/openapi.json

## API keys

- Optional. Without a key: 60 requests an hour, of which 10 new repos (read from GitHub for the first time) a day. With a free key (sign in with GitHub at ${SITE}/developers): 1,000 requests and 200 new repos an hour, private repos and usage stats. Over a limit: 429 with Retry-After.
- Send it as the header Authorization: Bearer gm_… on the JSON API, or in an MCP client's config ("headers": { "Authorization": "Bearer gm_…" }).

## Private repos

- Needs a gitmanual API key and the user's own read-only GitHub token as the header X-GitHub-Token, on the JSON API or the MCP server (in an MCP client's config: "headers": { "Authorization": "Bearer gm_…", "X-GitHub-Token": "github_pat_…" }). A fine-grained token with only Contents: read-only, for the chosen repos, is enough.
- Public repos are answered as usual; the token is only used when the repo is private. That answer is built for the request, marked private: true, and never saved, cached or sent to an AI service. Its setup script comes from get_setup_script rather than a URL.
- Never put the token in chat, logs or files the user didn't ask for.
- Example: curl -H "Authorization: Bearer $GITMANUAL_KEY" -H "X-GitHub-Token: $GITHUB_TOKEN" "${SITE}/api/v1/manual?repo={owner}/{repo}&os=linux&format=md"

## Notes

- New repos are read from GitHub on first request and cached for 12 hours; lookups of new repos are rate-limited per key, or per visitor without one.
- Commands come from the repo's files or well-known installers (Homebrew, winget, apt, nvm, uv…). Show them to the user before running anything.
- Source: https://github.com/zainudinnoori/gitmanual
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
