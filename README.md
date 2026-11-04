<h1 align="center">gitsetup</h1>

<p align="center">
  <b>Open source. Some assembly required.</b><br />
  Turn any GitHub repo into a setup manual: will it work on my device, what do I need, and the exact steps for macOS, Windows or Linux.
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/__OWNER__/gitsetup&env=GITHUB_TOKEN,TURSO_DATABASE_URL,TURSO_AUTH_TOKEN&envDescription=See%20.env.example&project-name=gitsetup"><img src="https://vercel.com/button" alt="Deploy with Vercel" /></a>
</p>

![gitsetup landing page](docs/landing.png)

## Why

Plenty of people find a project on GitHub and don't know how to run it. The README assumes you already know which runtime, package manager and database it needs. gitsetup reads the repo for you and writes the manual.

**Shortcut:** replace `hub` with `setup` in any GitHub URL. `github.com/ollama/ollama` becomes `gitsetup.com/ollama/ollama` <!-- update the domain once it's live -->.

## What you get for every repo

![gitsetup report for ollama/ollama](docs/report.png)

- **Start here**: the best way in, picked for your OS. The options are the ready-made download, the maintainers' own setup guide (shown inline), the project's website and docs, a setup script in the repo, or "Open in Codespaces" when the repo ships a dev container.
- **Will it work on my device?**: a yes, maybe or no for your OS and chip. It's based on the release files, Windows/WSL needs, separate devices (phones, TVs) and the README's supported-devices list.
- **Parts list**: runtimes with versions, tools, package managers, databases and `.env` settings.
- **Assembly steps**: copy-paste commands for macOS (zsh), Windows (PowerShell) or Linux (bash), with fixes for the errors people hit most.
- **Install the app**: the right download for your OS and CPU, plus brew / winget / apt / scoop… commands found in the README.
- **Did you get it running?**: per-OS votes, so the next person knows what to expect.
- **AI guide** (optional): Claude reads the key files and writes a guide. It's generated once per repo and OS, then cached.

## How it works

No cloning and no code execution. gitsetup makes 3 GitHub API calls per repo: metadata, file tree and releases. It then downloads only the files that matter (manifests, version pins, lockfile names, Docker/compose, CI workflows, `.env` examples, README, setup guides) from `raw.githubusercontent.com`.

| Module | Does |
|---|---|
| `lib/github.ts` | GitHub API + raw file downloads |
| `lib/detect.ts` | Rule-based detection: Node/Deno/Bun, Python, Go, Rust, Ruby, PHP, Java/Kotlin, Elixir; version pins; package managers; services; env vars; frameworks; per-OS steps |
| `lib/os.ts` | Per-OS runtime installs (nvm, uv, brew, winget, apt…) and PowerShell rewrites |
| `lib/install.ts` | Classifies release files by OS/arch and picks the best download; extracts install commands from the README |
| `lib/readme.ts` | Finds the README's quick start, compatibility and undo sections; tool detection; troubleshooting tips |
| `lib/guides.ts` | The "Start here" options: website, docs link, setup guides, setup scripts, dev container |
| `lib/fit.ts` | The "Will it work on my device?" verdict |
| `lib/db.ts` | Turso / SQLite: 12-hour analysis cache, history, votes, cached AI guides |
| `lib/pipeline.ts` | Ties it together: cache → GitHub → analysis → save |

Pages: `/` (landing + recently set up), `/[owner]/[repo]` (the manual; `?ref=branch&os=windows&mode=source` are kept in the URL).

## Run it locally

Requires Node.js 20 or newer.

```bash
git clone https://github.com/__OWNER__/gitsetup.git
cd gitsetup
npm install
cp .env.example .env.local   # optional: add GITHUB_TOKEN and ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. Without Turso settings, history is stored in `data/gitsetup.db`, a local SQLite file.

## Deploy to Vercel with Turso

1. **Create the database** ([Turso](https://turso.tech), free tier is plenty):
   ```bash
   brew install tursodatabase/tap/turso   # or: curl -sSfL https://get.tur.so/install.sh | bash
   turso auth signup
   turso db create gitsetup
   turso db show gitsetup --url           # → TURSO_DATABASE_URL
   turso db tokens create gitsetup        # → TURSO_AUTH_TOKEN
   ```
   The tables are created automatically on the first request.
2. **Create a GitHub token** at <https://github.com/settings/personal-access-tokens>: fine-grained, public repositories, no extra permissions. Without one you get 60 requests/hour, which is about 20 repos.
3. **Deploy**: click the button above, or import the repo at <https://vercel.com/new>. Add `GITHUB_TOKEN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and, optionally, `ANTHROPIC_API_KEY`.

| Variable | Needed | What for |
|---|---|---|
| `GITHUB_TOKEN` | in production | GitHub API limit 60 → 5,000 requests/hour |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | in production | History, 12-hour cache, votes, cached guides. Without them a Vercel deploy still works, just with no history or cache |
| `ANTHROPIC_API_KEY` | optional | "Write my guide" |
| `GITSETUP_DB` | optional | Path of the local SQLite file (default `data/gitsetup.db`) |

## Contributing

Detection rules are the easiest place to help. If a repo gets the wrong steps, open an issue with the link, or add a rule in `lib/detect.ts`, `lib/install.ts` or `lib/readme.ts`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
