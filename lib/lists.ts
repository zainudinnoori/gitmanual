import { OS_LABEL, OS_LIST, OS_SLUG, type OS } from "./os";

// Curated lists built from the shelf: one theme ("Self-hosted apps") per system, e.g. /lists/self-hosted-apps-windows.
// Each is a facets query (lib/facets.ts), so new repos join the right lists on their own.
type Theme = {
  id: string;
  short: string; // the theme on its own, for the homepage ("AI tools")
  title: (os: string) => string; // the page's heading, phrased the way people search
  intro: (os: string) => string;
  // GitHub topics, at least one of which a repo must have. Only ones that say what a repo is, not what it uses:
  // an app tagged "postgres" or "video" isn't a database or a video tool.
  any?: string[];
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
    id: "local-llms",
    short: "Local LLMs",
    title: (os) => `Run LLMs locally on ${os}`,
    intro: (os) => `Open-source apps and runtimes for running language models on your own ${os} computer, offline, with setup steps for each.`,
    any: ["ollama", "local-llm", "llama", "llamacpp", "llama-cpp", "gguf", "local-ai", "offline-llm", "lmstudio"],
  },
  {
    id: "ai-coding-tools",
    short: "AI coding tools",
    title: (os) => `AI coding agents and tools for ${os}`,
    intro: (os) => `Open-source coding agents, assistants and add-ons for tools like Claude Code and Codex that run on ${os}, with a setup manual for each.`,
    any: ["claude-code", "codex", "coding-agent", "coding-assistant", "ai-coding", "copilot", "agent-skills", "vibe-coding", "code-generation"],
  },
  {
    id: "image-generation",
    short: "Image generation",
    title: (os) => `AI image generators you can run on ${os}`,
    intro: (os) => `Stable Diffusion, ComfyUI and other open-source image generators that run on ${os}, with the steps to set each one up.`,
    any: ["stable-diffusion", "image-generation", "comfyui", "diffusion", "text-to-image", "flux", "sdxl", "diffusers"],
  },
  {
    id: "speech-and-voice",
    short: "Speech and voice",
    title: (os) => `Speech-to-text and voice tools for ${os}`,
    intro: (os) => `Open-source transcription, text-to-speech and voice tools that run on ${os}, with a setup manual for each.`,
    any: ["speech-to-text", "speech-recognition", "whisper", "tts", "text-to-speech", "voice", "asr", "transcription", "voice-cloning"],
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
    id: "developer-tools",
    short: "Developer tools",
    title: (os) => `Open-source developer tools for ${os}`,
    intro: (os) => `Editors, Git tools, API clients and other developer tools from GitHub that run on ${os}, with install steps for each.`,
    any: ["developer-tools", "devtools", "git", "ide", "code-editor", "vscode", "debugging", "testing", "api-client", "devops"],
  },
  {
    id: "databases",
    short: "Databases",
    title: (os) => `Databases and database tools for ${os}`,
    intro: (os) => `Open-source databases, database clients and tools that run on ${os}, with the steps to set each one up.`,
    any: ["database", "nosql", "vector-database", "database-gui", "database-management", "database-client", "sql-client", "dbms", "time-series-database", "key-value-store"],
  },
  {
    id: "web-scraping-tools",
    short: "Web scraping",
    title: (os) => `Web scraping and crawling tools for ${os}`,
    intro: (os) => `Open-source scrapers, crawlers and browser automation tools that run on ${os}, with a setup manual for each.`,
    any: ["web-scraping", "scraping", "scraper", "crawler", "web-crawler", "crawling", "browser-automation", "playwright", "puppeteer", "selenium"],
  },
  {
    id: "note-taking-apps",
    short: "Note-taking apps",
    title: (os) => `Open-source note-taking apps for ${os}`,
    intro: (os) => `Note-taking apps, wikis and knowledge bases from GitHub that run on ${os}, with the steps to install each one.`,
    any: ["note-taking", "notes", "notes-app", "knowledge-base", "knowledge-management", "pkm", "second-brain", "obsidian", "zettelkasten", "notion-alternative", "wiki"],
  },
  {
    id: "video-and-audio-tools",
    short: "Video and audio",
    title: (os) => `Open-source video and audio tools for ${os}`,
    intro: (os) => `Video editors, downloaders, media players and audio tools that run on ${os}, with a setup manual for each.`,
    any: ["ffmpeg", "video-editing", "video-editor", "video-downloader", "video-player", "youtube-dl", "yt-dlp", "music-player", "audio-player", "audio-editor", "media-player", "media-server", "screen-recorder"],
  },
  {
    id: "privacy-and-security",
    short: "Privacy and security",
    title: (os) => `Privacy and security tools that run on ${os}`,
    intro: (os) => `Open-source password managers, encryption, ad blocking and security tools that run on ${os}, with the steps to set each one up.`,
    any: ["privacy", "security", "encryption", "password-manager", "vpn", "ad-blocker", "adblock", "e2ee", "cybersecurity"],
  },
  {
    id: "static-site-generators",
    short: "Static site generators",
    title: (os) => `Static site generators and blog engines for ${os}`,
    intro: (os) => `Open-source static site generators and blogging tools that run on ${os}, with install steps for each.`,
    any: ["static-site-generator", "ssg", "blog-engine", "static-blog", "blogging-platform"],
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
