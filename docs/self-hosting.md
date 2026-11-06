# Self-hosting gitmanual

Running gitmanual locally needs nothing but Node.js. A public deployment needs three things: a **GitHub token**, a **database** and the **site's address**. This guide sets them up on Vercel and Turso (both have free tiers), but any Node.js host works.

- [1. Run it locally](#1-run-it-locally)
- [2. A GitHub token](#2-a-github-token)
- [3. A database (Turso)](#3-a-database-turso)
- [4. Deploy to Vercel](#4-deploy-to-vercel)
- [5. Optional: rising repos, every day](#5-optional-rising-repos-every-day)
- [6. Optional: AI guides](#6-optional-ai-guides)
- [7. Optional: Finds from a Facebook Page](#7-optional-finds-from-a-facebook-page)
- [All settings](#all-settings)

## 1. Run it locally

```bash
git clone https://github.com/zainudinnoori/gitmanual.git
cd gitmanual
npm install
cp .env.example .env.local
npm run dev                  # http://localhost:3000
```

Without a database URL, history is kept in `data/gitmanual.db` (SQLite). Set `GITMANUAL_DB` to use another path. The `data/` folder is git-ignored.

## 2. A GitHub token

Without a token GitHub allows 60 API requests an hour, and each new repo uses 3, so about 20 repos an hour. With a token it's 5,000.

1. Open <https://github.com/settings/personal-access-tokens/new> (fine-grained token).
2. **Repository access:** *Public repositories*. **Permissions:** leave them all as they are; none are needed.
3. Generate it and put it in `.env.local` (and later in your host's settings):

   ```
   GITHUB_TOKEN=github_pat_…
   ```

Use separate tokens for your machine and for production, so you can revoke one without breaking the other.

## 3. A database (Turso)

The database keeps the 12-hour analysis cache, the shelf, votes and cached AI guides. Turso is hosted SQLite, so it's the same engine as the local file.

```bash
brew install tursodatabase/tap/turso      # or: curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create gitmanual
turso db show gitmanual --url            # → TURSO_DATABASE_URL
turso db tokens create gitmanual         # → TURSO_AUTH_TOKEN
```

Tables are created on the first request, and new columns are added automatically on upgrades. If a deployment has no database, gitmanual still works, just with no cache, shelf or votes.

## 4. Deploy to Vercel

1. Push your fork to GitHub and import it at <https://vercel.com/new>, or use the **Deploy** button in the README.
2. Add these environment variables:

   | Variable | Value |
   |---|---|
   | `GITHUB_TOKEN` | From step 2 |
   | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | From step 3 |
   | `NEXT_PUBLIC_SITE_URL` | Your address, e.g. `https://gitmanual.com` |
   | `NEXT_PUBLIC_REPO_URL` | Optional: your fork, e.g. `https://github.com/you/gitmanual` |

3. Deploy, then add your domain under **Settings → Domains**.
4. After launch: submit `https://<your-site>/sitemap.xml` in Google Search Console.

## 5. Optional: rising repos, every day

`vercel.json` also runs `/api/cron/trending` daily at 06:00 UTC. It looks up repos gaining stars fast on GitHub (its search API; there's no API for the Trending page) and adds manuals for up to 15 new ones, so they're on the shelf and in the sitemap while people search for them. It needs `CRON_SECRET`.

Only repos that look like real projects are added: a description and a license, some use (issues or forks), no giveaway, cracking or adult words, and an owner account that's at least a year old (an organization, or a person with 20+ followers). Star-farmed and malware repos usually come from fresh accounts. The rules are in `risingRepos` in `lib/github.ts`.

## 6. Optional: AI guides

Set `ANTHROPIC_API_KEY` to turn on **"Write my guide"** on each manual. Claude reads the repo's key files on the server (the browser only sends the repo name). Each guide is generated once per repo and system and then served from the database, so costs stay bounded by the number of different repos people ask about.

New guides are rate-limited: 5 a day per visitor and 100 a day in all. Guides that are already written are never limited. The numbers are in `lib/limit.ts`.

## 7. Optional: Finds from a Facebook Page

Finds is a `/finds` page that shows a Facebook Page's posts (posters and Reels) as a feed. Each post links to its repo's manual, the repo's page shows a "Featured in …" block, and Reels play in the feed (Facebook's player loads only when someone presses ▶). **It's off unless `FINDS_NAME` is set.**

### Turn it on

```
FINDS_NAME=My Finds
FINDS_ABOUT=Open-source finds, one poster or Reel at a time.
FINDS_URL=https://www.facebook.com/<your-page>
# FINDS_AVATAR=https://…   (defaults to the Page's own profile picture when FB_PAGE_ID is set)
```

### Sync the Page automatically

A post shows up when it points to a repo, checked in this order:
1. a `gitmanual.com/owner/repo` or `github.com/owner/repo` link in the caption,
2. the same kind of link in the Page's own comments,
3. the caption naming a repo that's already on the shelf.

Posts without a match are skipped. Images are copied into the database, because Facebook's links expire.

1. Create an app at <https://developers.facebook.com/apps> and add the **"Manage everything on your Page"** use case. Under its permissions add `pages_show_list`, `pages_read_engagement` and `pages_read_user_content`.
2. In the [Graph API Explorer](https://developers.facebook.com/tools/explorer/), select the app, add the same permissions, click **Generate Access Token**, and pick your Page.
3. Extend the token in the [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) (**Extend Access Token**).
4. With the extended token, run `<page-id>?fields=name,access_token`, or `me/accounts?fields=id,name,access_token`. The Page's `access_token` doesn't expire.
   - If `me/accounts` is empty or skips your Page, ask for the Page directly by its ID. Pages owned by a Business portfolio can also need the `business_management` permission, and your account needs **full control** of the Page.
5. Set the sync settings:

   ```
   FB_PAGE_ID=1234567890
   FB_PAGE_TOKEN=EAAB…
   CRON_SECRET=<any long random string>
   ```

`vercel.json` runs the sync daily at 07:00 UTC, the limit on Vercel's Hobby plan. On Pro you can run it hourly (`0 * * * *`). To sync right after posting:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-site>/api/cron/facebook
# ?images=1 also re-downloads images for posts already saved
```

The response lists what was added, updated and skipped, with the reason for each skip.

### Add posts by hand

Put a file in `content/finds/` (e.g. `2026-11-04-peekaboo.md`): a few settings between `---` lines, then the caption exactly as written.

```
---
repo: openclaw/Peekaboo
kind: poster              # or: reel
image: https://example.com/peekaboo.png
url: https://www.facebook.com/<your-page>/posts/…
date: 2026-11-04
---
Your AI can actually SEE your screen now? 😳
#macos #opensource
```

A file with the same `url` as a synced post overrides it, which is handy for fixing a caption.

## All settings

| Variable | Needed | What for |
|---|---|---|
| `GITHUB_TOKEN` | production | GitHub API limit 60 → 5,000 requests/hour |
| `NEXT_PUBLIC_SITE_URL` | production | Canonical links, sitemap, share images and posters |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | production | Hosted database. Locally a SQLite file is used |
| `GITMANUAL_DB` | | Path of the local SQLite file (default `data/gitmanual.db`) |
| `ANTHROPIC_API_KEY` | | "Write my guide" (Claude) |
| `NEXT_PUBLIC_REPO_URL` | | GitHub link with stars in the menu; "Report a wrong setup" |
| `FINDS_NAME`, `FINDS_ABOUT`, `FINDS_URL`, `FINDS_AVATAR` | | The Finds page (on when `FINDS_NAME` is set) |
| `FB_PAGE_ID`, `FB_PAGE_TOKEN`, `FB_GRAPH_VERSION` | | Facebook Page sync (Graph API version defaults to `v23.0`) |
| `CRON_SECRET` | with the sync | Protects `/api/cron/facebook` |
| `NEXT_CHROME_EXTENSION_URL` | | The browser extension's store page: a link in the footer and on the home page |
| `CONTACT_FORM_URL` | | A ShareText form's embed link (`https://sharetext.net/form/<code>/embed`): adds "Contact" to the footer. Its script loads only when someone opens the form |
| `LIMIT_SALT` | production | Any long random string; keeps the daily visitor codes used for rate limits unguessable |
| `RATE_LIMITS` | | `off` turns rate limits off (they're on by default; see `lib/limit.ts`) |
