# Contributing to gitsetup

Thanks for helping more people get open source running.

## Reporting a wrong setup

Open an issue with:
- the repo link,
- your OS (and chip, if it matters),
- what gitsetup said and what actually worked.

That's often all a fix needs.

## Making a change

```bash
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # type check
npm run build        # production build
```

Where things live:

- **A stack, runtime or framework isn't detected** → `lib/detect.ts`, plus `lib/os.ts` for how to install it on each OS.
- **Wrong download picked** → `lib/install.ts` (`classifyOs`, `classifyArch`, `KINDS`).
- **README instructions, tools or troubleshooting tips** → `lib/readme.ts` (`TOOLS`, `TIPS`).
- **"Start here" options: setup guides and scripts** → `lib/guides.ts`.
- **"Will it work on my device?"** → `lib/fit.ts`.
- **UI** → `app/` (see `DESIGN.md` for the visual language).

Keep rules conservative: a missing step is better than a wrong command. Every command shown to a user should come from the repo's own files or a well-known installer.

## Pull requests

- One change per PR, with a repo link that shows the before and after.
- `npx tsc --noEmit` and `npm run build` pass.
- Match the surrounding code style. There's no formatter config yet, so follow what's there.
