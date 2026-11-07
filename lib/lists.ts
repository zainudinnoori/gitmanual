import { OS_LABEL, OS_LIST, OS_SLUG, type OS } from "./os";

// Curated lists built from the shelf: one theme ("Self-hosted apps") per system, e.g. /lists/self-hosted-apps-windows.
// Each is a facets query (lib/facets.ts), so new repos join the right lists on their own.
type Theme = {
  id: string;
  short: string; // the theme on its own, for the homepage ("AI tools")
  title: (os: string) => string; // the page's heading, phrased the way people search
  intro: (os: string) => string;
  any?: string[]; // GitHub topics, at least one of which a repo must have
  download?: boolean; // needs a ready-made download for the system, not just "runs on it"
};

const THEMES: Theme[] = [
  {
    id: "self-hosted-apps",
    short: "Self-hosted apps",
    title: (os) => `Self-hosted apps that run on ${os}`,
    intro: (os) => `Open-source apps you can host yourself, checked to run on ${os}. Each one opens a setup manual with the exact steps.`,
    any: ["self-hosted", "selfhosted", "self-hosting", "homelab", "homeserver"],
  },
  {
    id: "ai-tools",
    short: "AI tools",
    title: (os) => `Open-source AI tools that run on ${os}`,
    intro: (os) => `LLM apps, agents and AI tools from GitHub that run on ${os}, with a setup manual for each.`,
    any: ["ai", "llm", "llms", "ai-agents", "ai-agent", "agents", "machine-learning", "deep-learning", "generative-ai", "openai", "chatgpt", "ollama", "local-llm", "rag", "gpt"],
  },
  {
    id: "command-line-tools",
    short: "Command-line tools",
    title: (os) => `Command-line tools for ${os}`,
    intro: (os) => `Open-source terminal tools and TUIs that run on ${os}, with install commands for each.`,
    any: ["cli", "terminal", "command-line", "command-line-tool", "tui", "shell", "console"],
  },
  {
    id: "mcp-servers",
    short: "MCP servers",
    title: (os) => `MCP servers you can run on ${os}`,
    intro: (os) => `Model Context Protocol servers and tools for AI assistants that run on ${os}, with setup steps for each.`,
    any: ["mcp", "mcp-server", "mcp-servers", "model-context-protocol"],
  },
  {
    id: "apps-with-a-download",
    short: "Ready-made downloads",
    title: (os) => `Open-source apps with a ready-made ${os} download`,
    intro: (os) => `GitHub projects that publish a ${os} app or binary in their releases, so you can install them without building anything.`,
    download: true,
  },
];

// The topics the daily job searches GitHub for, one theme a day (app/api/cron/trending): the main ones per theme.
export const SEED_THEMES = THEMES.filter((t) => t.any).map((t) => ({ id: t.id, topics: t.any!.slice(0, 3) }));

// Below this, a list is too thin to be useful: it isn't linked, listed in the sitemap or indexed.
export const MIN_LIST = 4;

export type List = { slug: string; theme: string; short: string; os: OS; title: string; intro: string; all: string[]; any?: string[] };

export const LISTS: List[] = THEMES.flatMap((t) =>
  OS_LIST.map((os) => ({
    slug: `${t.id}-${OS_SLUG[os]}`,
    theme: t.id,
    short: t.short,
    os,
    title: t.title(OS_LABEL[os]),
    intro: t.intro(OS_LABEL[os]),
    all: [t.download ? `dl:${os}` : `os:${os}`],
    any: t.any?.map((x) => `t:${x}`),
  })),
);

export const listBySlug = (slug: string) => LISTS.find((l) => l.slug === slug) ?? null;
