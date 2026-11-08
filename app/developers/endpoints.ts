// The API reference on /developers, as data: one entry per endpoint. Keep in step with app/api/v1 and lib/catalog.ts.
// Example responses are trimmed real answers ("…" marks what's cut).

export type Param = { name: string; type: string; required?: boolean; about: string; in?: "path" | "query" };
export type Field = [name: string, type: string, about: string];
export type Endpoint = {
  id: string;
  title: string;
  path: string; // {name} marks a path parameter
  summary: string;
  limit: string; // what it costs against the limits
  params: Param[];
  example: Record<string, string>; // parameter values for the examples and "Try it"
  fields: Field[]; // the response's main fields
  response: string;
};

// The example's full URL: path parameters filled in, the rest as the query.
export function exampleUrl(site: string, e: Pick<Endpoint, "path" | "params">, values: Record<string, string>): string {
  let path = e.path;
  const query = new URLSearchParams();
  for (const p of e.params) {
    const v = values[p.name]?.trim();
    if (p.in === "path") path = path.replace(`{${p.name}}`, encodeURIComponent(v || p.name));
    else if (v) query.set(p.name, v);
  }
  // owner/repo reads better with its slash left as is.
  return `${site}${path}${query.size ? `?${query.toString().replace(/%2F/g, "/")}` : ""}`;
}

const OS_PARAM: Param = { name: "os", type: "mac | windows | linux", about: "Only this system." };

export const ENDPOINTS: Endpoint[] = [
  {
    id: "manual",
    title: "Get a setup manual",
    path: "/api/v1/manual",
    summary:
      "Everything the manual page shows for one repo: whether it runs on each system and why, downloads, install commands, step-by-step commands, the parts it needs, the before-you-start answers and how many people got it running.",
    limit: "One request. A repo read from GitHub for the first time also counts as a new repo.",
    params: [
      { name: "repo", type: "string", required: true, about: "owner/repo or any github.com link." },
      { ...OS_PARAM, about: "Only this system. Leave out for all three." },
      { name: "arch", type: "arm64 | x64", about: "The computer's chip, to pick the right download." },
      { name: "format", type: "md", about: "Markdown instead of JSON, ready for an AI agent to read." },
    ],
    example: { repo: "ollama/ollama", os: "mac" },
    fields: [
      ["repo", "string", "owner/repo, as GitHub spells it."],
      ["private", "boolean", "True when read with your GitHub token (never saved)."],
      ["difficulty", "string", "Easy, Moderate or Involved."],
      ["gotItRunning", "object", "How many people said it worked or they got stuck, in all and per system."],
      ["beforeYouStart", "array", "Is it free, does it use paid AI, is it maintained, its track record."],
      ["systems.{os}.verdict", "yes | maybe | no", "Whether it runs on that system; headline and reasons say why."],
      ["systems.{os}.downloads", "array", "Ready-made files from its releases; recommended marks the best one."],
      ["systems.{os}.installCommands", "array", "Install commands from the README (Homebrew, winget, pip…)."],
      ["systems.{os}.steps", "array", "Step-by-step setup from source, each with its commands."],
      ["systems.{os}.flowchart", "string | null", "How it fits together, as a Mermaid diagram (GitHub draws it in READMEs). Null when there's just one way in."],
      ["parts", "object", "Runtimes, tools, services and settings (.env) it needs."],
    ],
    response: `{
  "repo": "ollama/ollama",
  "description": "Get up and running with large language models.",
  "stars": 186263,
  "private": false,
  "manual": "https://gitmanual.com/ollama/ollama",
  "difficulty": "Easy",
  "gotItRunning": { "worked": 12, "stuck": 1, "bySystem": { "mac": { "worked": 7, "stuck": 0 } } },
  "beforeYouStart": [
    { "question": "Is ollama free?", "answer": "Yes", "detail": "Open source (MIT).", "tone": "yes" }
  ],
  "systems": {
    "mac": {
      "verdict": "yes",
      "headline": "Yes, there's a macOS download",
      "downloads": [{ "name": "Ollama.dmg", "url": "https://github.com/…", "arch": null, "recommended": true }],
      "installCommands": [{ "method": "Homebrew", "command": "brew install ollama", "kind": "app" }],
      "steps": [{ "title": "Install Go", "commands": ["brew install go"] }, "…"],
      "setupScript": "https://gitmanual.com/ollama/ollama/setup/mac.sh",
      "flowchart": "flowchart LR\\n  subgraph get[\\"Get it\\"]\\n …"
    }
  },
  "parts": { "runtimes": ["Go 1.24"], "tools": ["Git"], "services": [], "envVars": [] }
}`,
  },
  {
    id: "search",
    title: "Search the shelf",
    path: "/api/v1/search",
    summary: "Every repo people have set up with gitmanual, filtered and sorted like the shelf page. Add rising=true for what's rising on GitHub this week.",
    limit: "One request.",
    params: [
      { name: "q", type: "string", about: "Words in the repo's name or description." },
      { ...OS_PARAM, about: "Only repos that run on this system." },
      { name: "language", type: "string", about: 'Main language as GitHub names it, e.g. "Python".' },
      { name: "difficulty", type: "Easy | Moderate | Involved", about: "How much setup it takes." },
      { name: "minStars", type: "number", about: "At least this many GitHub stars." },
      { name: "sort", type: "stars | recent | popular | worked", about: "Most stars (default), recently looked up, most viewed, or most people got it running." },
      { name: "rising", type: "true", about: "Only repos rising on GitHub this week." },
      { name: "page", type: "number", about: "Page of results, from 1." },
      { name: "perPage", type: "number", about: "Results per page: 20 by default, at most 50." },
    ],
    example: { q: "llm", os: "windows", perPage: "2" },
    fields: [
      ["total", "number", "Repos that match, across all pages."],
      ["page, pages, perPage", "number", "Where you are; ask for the next with page."],
      ["results[].repo", "string", "owner/repo; open its manual with /api/v1/manual."],
      ["results[].difficulty", "string", "Easy, Moderate or Involved."],
      ["results[].gotItRunning", "object", "How many people said it worked or got stuck."],
      ["results[].risingThisWeek", "boolean", "Gaining stars fast on GitHub this week."],
      ["results[].manual", "string", "The manual page on gitmanual."],
    ],
    response: `{
  "total": 5,
  "page": 1,
  "perPage": 2,
  "pages": 3,
  "results": [
    {
      "repo": "ggml-org/llama.cpp",
      "description": "LLM inference in C/C++",
      "stars": 133590,
      "language": "C++",
      "difficulty": "Moderate",
      "gotItRunning": { "worked": 3, "stuck": 1 },
      "risingThisWeek": false,
      "manual": "https://gitmanual.com/ggml-org/llama.cpp",
      "analyzedAt": "2026-11-06T09:12:44.000Z"
    },
    "…"
  ]
}`,
  },
  {
    id: "lists",
    title: "List the lists",
    path: "/api/v1/lists",
    summary: "Every curated list: a theme (self-hosted apps, AI tools, command-line tools, MCP servers, ready-made downloads) on one system. ready is false while a list has fewer than four repos.",
    limit: "One request.",
    params: [],
    example: {},
    fields: [
      ["lists[].slug", "string", "Use with /api/v1/lists/{slug}."],
      ["lists[].theme", "string", "self-hosted-apps, ai-tools, command-line-tools, mcp-servers or apps-with-a-download."],
      ["lists[].os", "mac | windows | linux", "The system every repo on it runs on."],
      ["lists[].repos", "number", "How many repos it has (up to 60)."],
      ["lists[].ready", "boolean", "False while it has fewer than four repos."],
    ],
    response: `{
  "lists": [
    {
      "slug": "ai-tools-windows",
      "title": "Open-source AI tools that run on Windows",
      "theme": "ai-tools",
      "os": "windows",
      "repos": 39,
      "url": "https://gitmanual.com/lists/ai-tools-windows",
      "ready": true
    },
    "…"
  ]
}`,
  },
  {
    id: "list",
    title: "Get a list",
    path: "/api/v1/lists/{slug}",
    summary: "One list and its repos (up to 60), most stars first.",
    limit: "One request.",
    params: [{ name: "slug", type: "string", required: true, in: "path", about: "In the path, from /api/v1/lists, e.g. ai-tools-windows." }],
    example: { slug: "ai-tools-windows" },
    fields: [
      ["title, intro", "string", "What the list is, ready to show people."],
      ["results[]", "array", "Its repos, most stars first, in the same shape as search results."],
    ],
    response: `{
  "slug": "ai-tools-windows",
  "title": "Open-source AI tools that run on Windows",
  "intro": "LLM apps, agents and AI tools from GitHub that run on Windows, with a setup manual for each.",
  "os": "windows",
  "repos": 39,
  "url": "https://gitmanual.com/lists/ai-tools-windows",
  "results": [{ "repo": "microsoft/markitdown", "stars": 94210, "…": "…" }, "…"]
}`,
  },
  {
    id: "alternatives",
    title: "Find alternatives",
    path: "/api/v1/alternatives",
    summary: "Whether a repo runs on a system, and up to five similar repos (by shared GitHub topics) that do. Useful when the answer is no.",
    limit: "One request. A repo read from GitHub for the first time also counts as a new repo.",
    params: [
      { name: "repo", type: "string", required: true, about: "owner/repo or any github.com link." },
      { ...OS_PARAM, required: true, about: "The system it should run on." },
    ],
    example: { repo: "coollabsio/coolify", os: "windows" },
    fields: [
      ["runsOn.verdict", "yes | maybe | no", "Whether the repo itself runs on that system."],
      ["runsOn.headline", "string", "The answer in a sentence."],
      ["alternatives[]", "array", "Up to five similar repos that do run there, closest first."],
    ],
    response: `{
  "repo": "coollabsio/coolify",
  "os": "windows",
  "runsOn": { "verdict": "maybe", "headline": "Yes, with extra tools on Windows" },
  "alternatives": [
    {
      "repo": "gogs/gogs",
      "description": "The painless way to host your own Git service",
      "stars": 47919,
      "manual": "https://gitmanual.com/gogs/gogs"
    },
    "…"
  ]
}`,
  },
];

export const MCP_TOOLS = [
  ["get_setup_manual", "repo, os?, arch?", "A repo's setup manual, as Markdown."],
  ["get_setup_script", "repo, os", "One script that sets the repo up (bash or PowerShell)."],
  ["search_repos", "query?, os?, language?, difficulty?, sort?, rising?, page?", "Search the shelf."],
  ["get_list", "slug?", "A curated list, or all of them."],
  ["find_alternatives", "repo, os", "Similar repos that run on a system."],
];

export const ERRORS = [
  ["400", "Bad request", "A parameter is missing or not one of the allowed values."],
  ["401", "Unauthorized", "The API key is wrong, or a private repo was asked for without one."],
  ["403", "Forbidden", "The API key has been turned off."],
  ["404", "Not found", "No such repo or list, or the repo is private and no GitHub token (or the wrong one) was sent."],
  ["429", "Too many requests", "Over a limit. Retry-After says how many seconds to wait."],
  ["500", "Server error", "Something broke on our side. Try again in a moment."],
];
