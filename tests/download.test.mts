import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";

// The "Download PDF manual" dialog's files: the PDF and Markdown, both GitManual Pro. The route runs
// for real against a throwaway database; making the file itself (lib/download.ts) is a stand-in here, and the
// Markdown is checked on its own below.

process.env.GITMANUAL_DB = join(mkdtempSync(join(tmpdir(), "gitmanual-dl-")), "test.db");
delete process.env.TURSO_DATABASE_URL;
process.env.STRIPE_SECRET_KEY = "sk_test_fake";

const lib = (path: string) => new URL(`../lib/${path}`, import.meta.url).href;

let signedIn: { id: number; login: string } | null = null;
let pro = false;
const made: string[] = [];
mock.module(lib("viewer.ts"), {
  exports: { viewer: async () => ({ user: signedIn && { ...signedIn, token: "t" }, settle: (r: unknown) => r }), isAdmin: () => false },
});
mock.module(lib("pro.ts"), { exports: { isPro: async () => pro, proFor: async () => ({ pro, subscription: null }) } });
mock.module(lib("download.ts"), {
  exports: {
    manualFile: async (repo: string, os: string, format: string) => {
      made.push(`${repo} ${os} ${format}`);
      return format === "pdf"
        ? { body: new Uint8Array(Buffer.from("%PDF-1.3 fake")), type: "application/pdf", filename: "name-macos-setup-manual.pdf" }
        : { body: "# owner/name", type: "text/markdown; charset=utf-8", filename: "name-macos-setup-manual.md" };
    },
  },
});

const { GET } = await import("../app/api/download/route");
const { manualDocMarkdown } = await import("../lib/document");
const get = (q: string) => GET(new Request(`http://localhost/api/download?${q}`));

test("Markdown is Pro too: sign-in first, then Pro, then it's saved as a file", async () => {
  process.env.PRO_ENABLED = "on";
  const before = made.length;
  signedIn = null;
  let res = await get("repo=owner/name&os=mac&format=md");
  assert.equal(res.status, 307);
  assert.match(res.headers.get("location")!, /signin=1&back=%2Fowner%2Fname%2Fmacos%23pdf/);
  signedIn = { id: 5, login: "free" };
  pro = false;
  res = await get("repo=owner/name&os=mac&format=md");
  assert.match(res.headers.get("location")!, /\/pro\?back=%2Fowner%2Fname%2Fmacos%23pdf&from=md$/);
  assert.equal(made.length, before);
  pro = true;
  res = await get("repo=owner/name&os=mac&format=md");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type")!, /text\/markdown/);
  assert.match(res.headers.get("content-disposition")!, /attachment; filename="name-macos-setup-manual\.md"/);
  assert.equal(made.at(-1), "owner/name mac md");
});

test("bad requests are refused before anything is made", async () => {
  const before = made.length;
  for (const q of ["repo=owner&os=mac&format=md", "repo=owner/name&os=amiga&format=md", "repo=owner/name&os=mac&format=docx"])
    assert.equal((await get(q)).status, 400);
  assert.equal(made.length, before);
});

test("PDF: off while Pro is off; sign-in first; then Pro only", async () => {
  const before = made.length;
  process.env.PRO_ENABLED = "";
  assert.equal((await get("repo=owner/name&os=windows&format=pdf")).status, 404);

  process.env.PRO_ENABLED = "on";
  signedIn = null;
  let res = await get("repo=owner/name&os=windows&format=pdf");
  assert.equal(res.status, 307);
  assert.match(res.headers.get("location")!, /\/api\/github\/connect\?signin=1&back=%2Fowner%2Fname%2Fwindows%23pdf/);

  signedIn = { id: 5, login: "free" };
  pro = false;
  res = await get("repo=owner/name&os=windows&format=pdf");
  assert.equal(res.status, 307);
  assert.match(res.headers.get("location")!, /\/pro\?back=%2Fowner%2Fname%2Fwindows%23pdf&from=pdf$/);
  assert.equal(made.length, before); // nothing was made for anyone without Pro

  pro = true;
  res = await get("repo=owner/name&os=windows&format=pdf");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.match(Buffer.from(await res.arrayBuffer()).toString(), /^%PDF/);
});

test("the Markdown manual: checklist, commands with warnings, settings and credits", () => {
  const md = manualDocMarkdown({
    repo: "owner/name",
    owner: "owner",
    name: "name",
    description: "A tool",
    os: "linux",
    system: "Linux",
    manualUrl: "https://gitmanual.com/owner/name/linux",
    github: "https://github.com/owner/name",
    website: null,
    docs: "https://docs.example.com",
    maintainersGuide: null,
    license: "MIT",
    language: "TypeScript",
    topics: ["cli"],
    maintainedBy: "person",
    release: null,
    systems: [{ os: "linux", system: "Linux", tone: "yes", headline: "Yes, it runs on Linux" }],
    facts: { difficulty: "Easy", time: "about 5 min", stars: 1234, activity: "Updated this month", lastChange: "2026-11-10T00:00:00Z", gotItRunning: 0 },
    readAt: "2026-11-12T10:00:00.000Z",
    branch: "main",
    verdict: { tone: "yes", headline: "Yes, it runs on Linux", reasons: ["Built with Node.js."] },
    beforeYouStart: [{ question: "Is name free?", answer: "Yes", detail: "Open source (MIT).", tone: "yes" }],
    parts: [{ name: "Node.js 22", kind: "runtime" }],
    download: null,
    downloadPage: null,
    installCommands: [
      {
        method: "install script",
        role: "recommended",
        label: "Recommended: install script",
        needs: [],
        command: { text: "curl -fsSL https://example.com/i.sh | sh", risks: ["Downloads a script and runs it immediately"] },
      },
    ],
    start: {
      download: null,
      downloadPage: null,
      install: {
        method: "install script",
        role: "recommended",
        label: "Recommended: install script",
        needs: [],
        command: { text: "curl -fsSL https://example.com/i.sh | sh", risks: ["Downloads a script and runs it immediately"] },
      },
      check: { command: { text: "name --help", risks: [] }, expect: "It prints name's help." },
      nextTime: null,
      undocumented: ["upkeep"],
    },
    maintain: null,
    routes: [
      { label: "Recommended: install with install script", needs: [] },
      { label: "Build from source", needs: ["Node.js 22"] },
    ],
    steps: [{ title: "Install dependencies", commands: [{ text: "npm install", risks: [] }] }],
    setupScript: null,
    envVars: [{ name: "API_KEY", secret: true, optional: false }],
  });
  assert.match(md, /^# owner\/name: setup manual for Linux/);
  assert.match(md, /- \*\*Build from source:\*\* Node\.js 22/);
  assert.match(md, /\*\*Recommended: install script\*\*/);
  assert.match(md, /### Check it works\n\n```bash\nname --help\n```/);
  assert.match(md, /gitmanual hasn't run these steps/);
  assert.match(md, /### Update or remove it\n\nNot documented in the repository\. Check its README\./);
  assert.match(md, /```bash\ncurl -fsSL https:\/\/example\.com\/i\.sh \| sh\n```\n> \*\*Careful:\*\* Downloads a script/);
  assert.match(md, /### 1\. Install dependencies/);
  assert.match(md, /\| `API_KEY` \| secret: keep it private \|/);
  assert.match(md, /MIT license/);
  assert.match(md, /Read every command before you run it/);
  assert.doesNotMatch(md, /\n\n\n/);
});
