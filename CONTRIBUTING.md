# Contributing to gitmanual

Thanks for helping more people get open source running. Every fixed rule fixes the manual for many repos at once.

## The most useful contribution: a wrong setup

If gitmanual gave a wrong step, command or "Will it work?" answer for a repo, [open a "Wrong setup" issue](../../issues/new?template=wrong-setup.yml) with:

- the repo,
- your system (and chip, if it matters),
- what gitmanual said and what actually worked, ideally with a link to where the repo's README or docs say so.

That's often all a fix needs.

## Making a change

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm run build
npm run check:scripts   # setup scripts for every repo you've looked up
```

Add a `GITHUB_TOKEN` to `.env.local` if you'll be looking up many repos ([how](docs/self-hosting.md#2-a-github-token)). After a rule change, open the repos it affects: saved analyses are re-made automatically when `VERSION` in `lib/pipeline.ts` is bumped, so bump it when a change alters results.

### Where things live

| To fix… | Look in |
|---|---|
| A stack, version or framework that isn't detected | `lib/detect.ts`, and `lib/os.ts` for how to install it on each system |
| The wrong download picked from a release | `lib/install.ts` (`classifyOs`, `classifyArch`, `KINDS`) |
| An install command missed, or a dependency shown as the app | `lib/install.ts` (`METHODS`, `installsThisProject`) |
| README sections, tools or troubleshooting tips | `lib/readme.ts` (`TOOLS`, `TIPS`) |
| "Start here": setup guides, scripts, docs links | `lib/guides.ts` |
| "Will it work on my device?" | `lib/fit.ts`, and `lib/platforms.ts` for what READMEs say about systems |
| The setup script (`setup.sh` / `setup.ps1`) | `lib/script.ts`; repos it's tested on: `scripts/setup-test-repos.json` |
| The UI | `app/`, following [DESIGN.md](DESIGN.md) |

### Rules of thumb

- **A missing step beats a wrong one.** Every command shown must come from the repo's own files or a well-known installer (Homebrew, winget, nvm, uv, rustup…). When unsure, point to the maintainers' guide.
- **A "no" needs the project's own words.** Only say a system isn't supported when the repo says so, and quote it.
- **Test on real repos.** In the PR, name one or two repos that show the before and after.
- Match the surrounding code style. Comments explain *why*, not *what*.

## Pull requests

- One change per PR.
- `npm run typecheck`, `npm run build` and `npm run check:scripts -- --add` pass (CI checks all three). The weekly **Setup scripts** workflow also runs the scripts on real macOS, Windows and Linux machines.
- Be kind in reviews. See the [Code of Conduct](CODE_OF_CONDUCT.md).
