import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCitations, citedPaths, commandRisks } from "../lib/checks";

const kinds = (cmd: string) => commandRisks(cmd).map((r) => r.kind);

test("commands that download and run a script are flagged, in every shell", () => {
  assert.deepEqual(kinds("curl -fsSL https://example.com/install.sh | sh"), ["pipe"]);
  assert.deepEqual(kinds("curl --proto '=https' -sSf https://sh.rustup.rs | sh"), ["pipe"]);
  assert.deepEqual(kinds("wget -qO- https://x.io/i | sudo bash"), ["pipe", "sudo"]);
  assert.deepEqual(kinds('sh -c "$(curl -fsSL https://x.io/i.sh)"'), ["pipe"]);
  assert.deepEqual(kinds("bash <(curl -s https://x.io/i.sh)"), ["pipe"]);
  assert.deepEqual(kinds("curl -s https://x.io/get.py | python3 -"), ["pipe"]);
  assert.deepEqual(kinds("irm https://get.scoop.sh | iex"), ["pipe"]);
  assert.deepEqual(kinds("iex ((New-Object System.Net.WebClient).DownloadString('https://x.io'))"), ["pipe"]);
});

test("other risky commands are flagged", () => {
  assert.deepEqual(kinds("sudo apt install -y build-essential"), ["sudo"]);
  assert.deepEqual(kinds("rm -rf node_modules"), ["delete"]);
  assert.deepEqual(kinds("rm -r build"), ["delete"]);
  assert.deepEqual(kinds("Remove-Item -Recurse -Force .\\dist"), ["delete"]);
  assert.deepEqual(kinds('echo \'export PATH="$HOME/.cargo/bin:$PATH"\' >> ~/.zshrc'), ["profile"]);
  assert.deepEqual(kinds("echo 'eval \"$(fnm env)\"' | tee -a ~/.bashrc"), ["profile"]);
  assert.deepEqual(kinds("Add-Content $PROFILE 'fnm env | Invoke-Expression'"), ["profile"]);
  assert.deepEqual(kinds("chmod -R 777 ./data"), ["permissions"]);
  assert.deepEqual(kinds("Set-ExecutionPolicy RemoteSigned -Scope CurrentUser"), ["policy"]);
  assert.deepEqual(kinds("sudo dd if=image.iso of=/dev/disk4"), ["sudo", "disk"]);
});

test("ordinary setup commands aren't flagged", () => {
  for (const cmd of [
    "npm install",
    "git clone https://github.com/rust-lang/rustlings.git\ncd rustlings",
    "curl -fsSL https://example.com/install.sh -o install.sh",
    "rm package-lock.json",
    "pip install -r requirements.txt",
    "docker compose up -d",
    "cat ~/.zshrc",
    "sudoku --help",
  ])
    assert.deepEqual(kinds(cmd), [], cmd);
});

test("paths in backticks are picked out; names of tools and frameworks are not", () => {
  const md = [
    "Versions come from `package.json` and `docs/install.md`, see `src/main.rs:42`.",
    "Copy `.env.example` to `.env`, then read the `Makefile`.",
    "This uses `Next.js`, `node.js` and `npm install`; run `--help` or open `https://x.io/a.md`.",
    "```sh\ncat not/a/citation.md\n```",
  ].join("\n");
  assert.deepEqual(citedPaths(md).sort(), [".env", ".env.example", "Makefile", "docs/install.md", "package.json", "src/main.rs"].sort());
});

test("citations are sorted into read, in the repo but unread, and not in the repo", () => {
  const md = "From `package.json`, `install.md` and `CONTRIBUTING.md`; also `docs/missing.md` and `scripts/`.";
  const read = ["package.json", "docs/install.md"];
  const repo = ["package.json", "docs/install.md", "CONTRIBUTING.md", "scripts/setup.sh"];
  assert.deepEqual(checkCitations(md, read, repo), {
    verified: ["package.json", "install.md"],
    notRead: ["CONTRIBUTING.md", "scripts"],
    missing: ["docs/missing.md"],
  });
});

test("files that setup creates aren't reported missing", () => {
  const md = "Copy `.env.example` to `.env`, then `node_modules/` and `target/` appear.";
  assert.deepEqual(checkCitations(md, [".env.example"], [".env.example"]), { verified: [".env.example"], notRead: [], missing: [] });
});

test("a folder the answer's own commands create isn't reported missing", () => {
  const md = "Run `rustlings init`, which makes `rustlings/`.\n\n```sh\nrustlings init\ncd rustlings/\n```";
  assert.deepEqual(checkCitations(md, [], []).missing, []);
});

test("a bare file name that matches two files Claude read isn't counted as verified", () => {
  const read = ["docs/install.md", "web/install.md"];
  assert.deepEqual(checkCitations("See `install.md`.", read, read).verified, []);
});
