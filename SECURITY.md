# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Use GitHub's private reporting instead: **Security → Report a vulnerability** on this repository. You'll get a reply within a few days, and a fix or a plan within two weeks for anything serious.

Please include what's affected, how to reproduce it, and what an attacker could do with it.

## Scope

In scope: this codebase and its API routes (`/api/analyze`, `/api/guide`, `/api/vote`, `/api/finds`, `/api/cron/facebook`), the way it renders content from GitHub repos (READMEs and setup guides are untrusted input), and how it handles tokens and secrets.

Out of scope: the repos gitmanual describes. If a repo's own install script is malicious, report it to that project and to GitHub. gitmanual shows commands as their maintainers wrote them and warns before scripts that pipe into a shell.

## Good to know when self-hosting

- Keep `GITHUB_TOKEN`, `TURSO_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `FB_PAGE_TOKEN` and `CRON_SECRET` in your host's environment settings, never in the repo. `.env.local` is git-ignored.
- The GitHub token needs **no permissions**: public read access is enough.
- `/api/guide` only accepts a repo name and loads the files on the server, so it can't be used as a general-purpose Claude proxy. It isn't rate-limited yet, though, so watch your usage or leave `ANTHROPIC_API_KEY` unset.
- `/api/cron/facebook` requires `Authorization: Bearer $CRON_SECRET`.
