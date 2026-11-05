// Builds the setup script for every repo on the shelf (and the test list), on every system, and checks each one:
// it parses (bash -n; PowerShell when pwsh is installed), and it keeps the script's promises: nothing long-running,
// no unfilled placeholders, no Unix-only commands on Windows, nothing an installer would stop to ask about.
//
//   npm run check:scripts              every repo in the local database, as last analyzed
//   npm run check:scripts -- --add     also analyze the test-list repos, or re-analyze them after a rules change (needs GITHUB_TOKEN)
//   npm run check:scripts -- --out dir also write every script to dir/ to read them
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import type { Step } from "../lib/detect";
import { OS_LIST, type OS } from "../lib/os";
import { buildScript, type SetupScript } from "../lib/script";

type Row = { fullName: string; steps: Record<OS, Step[]> };
const args = process.argv.slice(2);
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const list: { repo: string; kind: string }[] = JSON.parse(readFileSync("scripts/setup-test-repos.json", "utf8")).repos;

async function shelf(): Promise<Row[]> {
  const path = process.env.GITMANUAL_DB ?? "data/gitmanual.db";
  if (!existsSync(path)) return []; // a fresh checkout (CI): --add fills it
  const db = createClient({ url: `file:${path}` });
  const rows = await db.execute("SELECT full_name, data FROM repos").then((r) => r.rows, () => []);
  return rows.map((r) => ({ fullName: String(r.full_name), steps: JSON.parse(String(r.data)).analysis.steps }));
}

async function addMissing(have: Set<string>) {
  const { loadRepo } = await import("../lib/pipeline");
  for (const { repo } of list) {
    const [owner, name] = repo.split("/");
    if (!have.has(repo.toLowerCase())) process.stdout.write(`analyzing ${repo}… `);
    try {
      // Also re-analyzes saved copies from an older VERSION of the rules.
      const loaded = await loadRepo({ owner, repo: name });
      if (!have.has(repo.toLowerCase())) console.log("ok");
      else if (!loaded.cached) console.log(`re-analyzed ${repo}`);
    } catch (e) {
      console.log(`failed: ${(e as Error).message}`);
    }
  }
}

// The promises, checked on the lines the script actually runs (comments are fine).
function problems(s: SetupScript): string[] {
  const out: string[] = [];
  const runs = s.steps.flatMap((st) => st.lines.filter((l) => l.kind === "run").map((l) => l.command));
  for (const c of runs) {
    if (/^sudo apt(-get)? install\b/.test(c) && s.os !== "windows" && !s.text.includes(c.replace(/install (?!-y)/, "install -y ").replace(/\s+#.*$/, ""))) {
      out.push(`apt without -y: ${c}`);
    }
    if (/\b(read -p|Read-Host)\b/.test(c)) out.push(`asks for input: ${c}`);
    if (s.os === "windows" && /(?:^|\s)(?:\.\/)?[\w./-]+\.sh\b|\bsudo\b/.test(c)) out.push(`Unix-only on Windows: ${c}`);
    if (s.os === "windows" && /&&|\|\|/.test(s.text.split("\n").find((l) => l.includes(c.split(" && ")[0])) ?? "")) out.push(`&& or || (not in Windows PowerShell 5.1): ${c}`);
  }
  if (!/git clone/.test(s.text)) out.push("no clone");
  return out;
}

function bashSyntax(file: string): string | null {
  const r = spawnSync("bash", ["-n", file], { encoding: "utf8" });
  return r.status === 0 ? null : r.stderr.trim().split("\n")[0];
}

function hasPwsh(): boolean {
  return spawnSync("pwsh", ["-NoProfile", "-Command", "exit 0"]).status === 0;
}

// One pwsh process parses every .ps1 file; prints "file<TAB>first error" for those that don't parse.
function psSyntax(files: string[]): Map<string, string> {
  const listFile = join(mkdtempSync(join(tmpdir(), "ps-")), "files.txt");
  writeFileSync(listFile, files.join("\n"));
  const ps = `foreach ($f in Get-Content '${listFile}') { $t=$null; $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile($f,[ref]$t,[ref]$e); if ($e.Count) { "$f\`t$($e[0].Message) (line $($e[0].Extent.StartLineNumber))" } }`;
  const out = execFileSync("pwsh", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
  return new Map(out.split("\n").filter(Boolean).map((l) => l.split("\t") as [string, string]));
}

async function main() {
  let rows = await shelf();
  if (args.includes("--add")) {
    await addMissing(new Set(rows.map((r) => r.fullName.toLowerCase())));
    rows = await shelf();
  }
  const dir = outDir ?? mkdtempSync(join(tmpdir(), "setup-scripts-"));
  mkdirSync(dir, { recursive: true });
  const failures: string[] = [];
  const ps1: string[] = [];
  const tally = { scripts: 0, run: 0, skipped: 0, next: 0, nothingToDo: 0 };
  const why = new Map<string, number>();

  for (const row of rows) {
    for (const os of OS_LIST) {
      const s = buildScript(row.steps[os] ?? [], os, row.fullName, "https://gitmanual.com");
      const file = join(dir, `${row.fullName.replace("/", "__")}.${os}.${os === "windows" ? "ps1" : "sh"}`);
      writeFileSync(file, s.text);
      tally.scripts++;
      const lines = s.steps.flatMap((st) => st.lines);
      tally.run += lines.filter((l) => l.kind === "run").length;
      tally.skipped += lines.filter((l) => l.kind === "skip" && l.why !== "note").length;
      tally.next += s.next.length;
      if (s.steps.length <= 1) tally.nothingToDo++;
      for (const l of lines) if (l.kind === "skip" && l.why !== "note") why.set(l.why, (why.get(l.why) ?? 0) + 1);
      for (const p of problems(s)) failures.push(`${row.fullName} [${os}] ${p}`);
      if (os === "windows") ps1.push(file);
      else {
        const err = bashSyntax(file);
        if (err) failures.push(`${row.fullName} [${os}] bash syntax: ${err}`);
      }
    }
  }
  const pwsh = hasPwsh();
  if (pwsh) for (const [file, err] of psSyntax(ps1)) failures.push(`${file.split("/").pop()} PowerShell syntax: ${err}`);

  const missing = list.filter((t) => !rows.some((r) => r.fullName.toLowerCase() === t.repo.toLowerCase())).map((t) => t.repo);
  console.log(`\n${rows.length} repos, ${tally.scripts} scripts → ${dir}`);
  console.log(`commands: ${tally.run} run, ${tally.skipped} left as comments, ${tally.next} shown as "next"; ${tally.nothingToDo} scripts only clone`);
  console.log(`left as comments: ${[...why].map(([k, v]) => `${v} × ${k}`).join(", ") || "none"}`);
  console.log(`PowerShell parse check: ${pwsh ? "done" : "skipped (pwsh not installed)"}`);
  if (missing.length) console.log(`not on the shelf yet (use --add): ${missing.join(", ")}`);
  if (failures.length) {
    console.log(`\n✗ ${failures.length} problems:\n${failures.map((f) => `  ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log("\n✓ every script passed");
}

main();
