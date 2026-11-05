import type { Step } from "./detect";
import { OS_LABEL, type OS } from "./os";

// Turns a manual's steps into one script you can read and run: bash for macOS and Linux, PowerShell for Windows.
// The script only sets the project up. It stops at the first error and is safe to run again, and it never starts
// a server, runs tests or uses a command that still needs your own values; those are printed at the end.

export type ScriptLine =
  | { kind: "run"; command: string }
  | { kind: "skip"; command: string; why: string }; // written as a comment

export type ScriptStep = { title: string; note?: string; lines: ScriptLine[] };
export type SetupScript = { os: OS; filename: string; steps: ScriptStep[]; next: string[]; reminders: string[]; text: string };

// Commands that keep running (servers, watchers, apps) would block the script, so they go to "next".
const LONG_RUNNING =
  /^(?:(?:npm|pnpm|yarn|bun)(?: run)? (?:dev|start|serve|watch|preview)\b|npx [\w@/.-]+ (?:dev|start)\b|(?:bin\/dev|ruby bin\/dev|\.\/bin\/dev)\b|(?:bundle exec )?rails s(?:erver)?\b|(?:bin\/|ruby bin\/)?rails s(?:erver)?\b|php artisan serve\b|mix phx\.server\b|iex -S mix\b|(?:python3?|uv run|poetry run) (?:-m )?(?:uvicorn|flask run|manage\.py runserver|streamlit run|gradio)\b|uvicorn\b|flask run\b|streamlit run\b|go run\b|cargo run\b|dotnet run\b|deno task (?:dev|start)\b|docker compose up(?!.*(?:\s-d\b|--detach))|docker-compose up(?!.*(?:\s-d\b|--detach))|docker run\b(?!.*(?:\s-d\b|--detach|--rm))|\.\/gradlew (?:bootRun|run)\b|\.\\gradlew\.bat (?:bootRun|run)\b|mvn spring-boot:run\b|\.\/mvnw spring-boot:run\b|flutter run\b|hugo server\b|jekyll serve\b)/;

// Values the reader has to fill in first: <your-key>, YOUR_TOKEN, your-api-key, "xxx".
const PLACEHOLDER = /<[a-z][\w -]*>|\bYOUR_[A-Z_]+\b|\byour[-_](?:api[-_])?(?:key|token|secret|password|username|email|domain)\b|\bxxx+\b/i;

// Installer command → the program it provides, so the script can skip what's already installed.
const PROVIDES: [RegExp, string][] = [
  [/^brew install nvm\b/, "nvm"],
  [/^brew install (?:--cask )?(?:python(?:@[\d.]+)?)\b/, "python3"],
  [/^brew install (?:--cask )?openjdk\b/, "java"],
  [/^brew install (?:--cask )?dotnet-sdk\b/, "dotnet"],
  [/^brew install (?:--cask )?docker\b/, "docker"],
  [/^brew install (?:--cask )?flutter\b/, "flutter"],
  [/^brew install rbenv\b/, "rbenv"],
  [/^brew install leiningen\b/, "lein"],
  [/^brew install clojure\/tools\/clojure\b/, "clojure"],
  [/^brew install meson\b/, "meson"],
  [/^brew install (?:--cask )?([\w.-]+)/, "$1"],
  [/^winget install CoreyButler\.NVMforWindows\b/, "nvm"],
  [/^winget install Python\.Python\b/, "python"],
  [/^winget install GoLang\.Go\b/, "go"],
  [/^winget install Rustlang\.Rustup\b/, "rustup"],
  [/^winget install astral-sh\.uv\b/, "uv"],
  [/^winget install Git\.Git\b/, "git"],
  [/^winget install Kitware\.CMake\b/, "cmake"],
  [/^winget install DenoLand\.Deno\b/, "deno"],
  [/^winget install Microsoft\.DotNet\.SDK\b/, "dotnet"],
  [/^winget install EclipseAdoptium\.\w+/, "java"],
  [/^winget install jdx\.mise\b/, "mise"],
  [/^winget install Docker\.DockerDesktop\b/, "docker"],
  [/^winget install Swift\.Toolchain\b/, "swift"],
  [/^winget install GnuWin32\.Make\b/, "make"],
  [/sh\.rustup\.rs/, "cargo"],
  [/astral\.sh\/uv\/install/, "uv"],
  [/deno\.land\/install/, "deno"],
  [/bun\.sh\/install/, "bun"],
  [/mise\.run/, "mise"],
  [/^pipx install ([\w.-]+)/, "$1"],
  [/^sudo snap install ([\w.-]+)/, "$1"],
  [/^sudo apt(?:-get)? install (?:-y )?build-essential\b/, "gcc"],
  [/^sudo apt(?:-get)? install (?:-y )?python3\b/, "python3"],
  [/^sudo apt(?:-get)? install (?:-y )?openjdk-/, "java"],
  [/^sudo apt(?:-get)? install (?:-y )?dotnet-sdk/, "dotnet"],
  [/^sudo apt(?:-get)? install (?:-y )?php-cli\b/, "php"],
  [/^sudo apt(?:-get)? install (?:-y )?ninja-build\b/, "ninja"],
  [/^sudo apt(?:-get)? install (?:-y )?([\w.-]+)(?:\s|$)/, "$1"],
];

// Runtime names in a step's note ("Go 1.23, Ruby 3.4") → the programs that show they're installed.
const RUNTIME_BIN: [RegExp, string, string][] = [
  [/^Node\.js\b/, "node", "node"],
  [/^Python\b/, "python3", "python"],
  [/^Go\b/, "go", "go"],
  [/^Rust\b/, "cargo", "cargo"],
  [/^Ruby\b/, "ruby", "ruby"],
  [/^(?:JDK|Java)\b/, "java", "java"],
  [/^Deno\b/, "deno", "deno"],
  [/^Bun\b/, "bun", "bun"],
  [/^Elixir\b/, "elixir", "elixir"],
  [/^PHP\b/, "php", "php"],
];

function runtimeBins(note: string | undefined, os: OS): string[] | null {
  if (!note) return null;
  const bins: string[] = [];
  for (const part of note.split(/,\s*/)) {
    const hit = RUNTIME_BIN.find(([re]) => re.test(part));
    if (!hit) return null; // something we can't check: let mise install it
    bins.push(os === "windows" ? hit[2] : hit[1]);
  }
  return bins.length ? bins : null;
}

export function provides(command: string): string | null {
  const cmd = command.replace(/\s+#.*$/, "").trim();
  for (const [re, bin] of PROVIDES) {
    const m = cmd.match(re);
    if (m) return bin.replace("$1", m[1] ?? "");
  }
  return null;
}

// Also "NAME=value command", which only bash understands.
const UNIX_ONLY = /^[A-Z_][A-Z0-9_]*=\S* \S|(?:^|[\s;&|(])(?:\.\/|bash |sh )?[\w./-]*\.sh\b|\bsudo\b|\bchmod\b|\bexport [A-Z_]+=|\bsource \S+\/bin\/activate\b/;

function classify(step: Step, os: OS, repoName: string): { lines: ScriptLine[]; next: string[] } {
  const lines: ScriptLine[] = [];
  const next: string[] = [];
  const isRun = /^Run it$/.test(step.title);
  const isTests = /^Run the tests$/.test(step.title);
  const isUndo = /^To undo it later/.test(step.title);
  const isReadme = /^Follow the README/.test(step.title);
  for (const raw of step.commands) {
    const command = raw.trim();
    if (!command) continue;
    if (command.startsWith("#")) {
      lines.push({ kind: "skip", command: command.replace(/^#\s*/, ""), why: "note" });
      continue;
    }
    // The script already cloned the repo and moved into it.
    if (isReadme && (/^git clone\b/.test(command) || command === `cd ${repoName}`)) {
      lines.push({ kind: "skip", command, why: "already done above" });
      continue;
    }
    if (isUndo) lines.push({ kind: "skip", command, why: "only to undo the setup" });
    else if (isTests) next.push(command);
    else if (isRun || LONG_RUNNING.test(command)) next.push(command);
    else if (PLACEHOLDER.test(command)) lines.push({ kind: "skip", command, why: "fill in your own values, then run it" });
    else if (os === "windows" && UNIX_ONLY.test(command)) lines.push({ kind: "skip", command, why: "needs Git Bash or WSL on Windows" });
    else lines.push({ kind: "run", command });
  }
  return { lines, next };
}

// bash: single quotes are safe for anything except a single quote itself.
const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

// "cmd  # note" → the command and its note, so a note never swallows code that's added after it.
function splitNote(command: string): [string, string | null] {
  const m = command.match(/^(.*?\S)\s+#\s(.*)$/s);
  return m && !m[1].includes("\n") ? [m[1], m[2]] : [command, null];
}

function bashLine(line: ScriptLine, need: string[] | null = null): string {
  if (line.kind === "skip") return `# ${line.why === "note" ? "" : `(${line.why}) `}${line.command}`.replace(/\n/g, "\n# ");
  const [command, note] = splitNote(line.command);
  // apt asks "Do you want to continue?"; the script answers yes, as the reader already chose to install.
  let cmd = command.replace(/^sudo apt(-get)? install (?!-y)/, "sudo apt$1 install -y ");
  const bin = provides(cmd);
  const copy = cmd.match(/^cp (\S+) (\S+)$/);
  if (cmd === "xcode-select --install") cmd = "xcode-select -p >/dev/null 2>&1 || xcode-select --install";
  else if (bin === "nvm") cmd = `have_nvm || have node || { ${cmd} && load_nvm; }`;
  else if (bin === "mise" && need) cmd = `have mise || ${need.map((b) => `have ${b}`).join(" && ")} || ${cmd}`;
  else if (bin) cmd = `have ${bin} || ${cmd}`;
  else if (copy) cmd = `[ -f ${copy[2]} ] || ${cmd}`;
  // mise won't read a repo's own config until it's trusted; running this setup is that choice.
  else if (cmd === "mise install") {
    const install = "mise trust --yes >/dev/null 2>&1 || true\nmise install";
    cmd = need ? `if ${need.map((b) => `have ${b}`).join(" && ")}; then echo "Using the installed ${need.join(", ")}"; else\n${install}\nfi` : install;
  }
  // Without nvm, a Node that's already installed is used as it is.
  else if (/^nvm (install|use)\b/.test(cmd)) cmd = `if have_nvm; then ${cmd}; elif have node; then echo "nvm not found: using Node $(node -v)"; else echo "Needs Node.js: install nvm from https://github.com/nvm-sh/nvm" >&2; exit 1; fi`;
  return note ? `# ${note}\n${cmd}` : cmd;
}

function psLine(line: ScriptLine, need: string[] | null = null): string {
  if (line.kind === "skip") return `# ${line.why === "note" ? "" : `(${line.why}) `}${line.command}`.replace(/\n/g, "\n# ");
  const [command, note] = splitNote(line.command);
  let cmd = command;
  if (/^winget install /.test(cmd) && !/--accept/.test(cmd)) cmd = `${cmd} -e --accept-source-agreements --accept-package-agreements`;
  const bin = provides(cmd);
  const copy = cmd.match(/^Copy-Item (\S+) (\S+)$/);
  if (cmd === "mise install") {
    const install = `Invoke-Step { mise trust --yes }\nInvoke-Step { mise install }\n$env:Path = "$env:LOCALAPPDATA\\mise\\shims;$env:Path"`;
    return need ? `if (${need.map((b) => `(Have ${psQuote(b)})`).join(" -and ")}) { Write-Host ${psQuote(`Using the installed ${need.join(", ")}`)} } else {\n${install}\n}` : install;
  }
  // Like the bash script: without nvm, a Node that's already installed is used as it is.
  if (/^nvm (install|use)\b/.test(cmd)) {
    return `if (Have 'nvm') { Invoke-Step { ${cmd} } } elseif (Have 'node') { Write-Host "nvm not found: using Node $(node -v)" } else { throw 'Needs Node.js: install nvm-windows or Node.js' }`;
  }
  // Windows PowerShell 5.1 has no &&: run each part as its own step, which also stops at the first failure.
  if (/ && /.test(cmd) && !/["']/.test(cmd)) return cmd.split(" && ").map((part) => psLine({ kind: "run", command: part })).join("\n");
  const out = copy
    ? `if (-not (Test-Path ${copy[2]})) { Copy-Item ${copy[1]} ${copy[2]} }`
    : bin
      ? `if (-not (Have ${psQuote(bin)})${bin === "nvm" ? " -and -not (Have 'node')" : ""}${bin === "mise" && need ? ` -and -not (${need.map((b) => `(Have ${psQuote(b)})`).join(" -and ")})` : ""}) { Invoke-Step { ${cmd} }; Update-Path }`
      : `Invoke-Step { ${cmd} }`;
  return note ? `# ${note}\n${out}` : out;
}

export function buildScript(steps: Step[], os: OS, fullName: string, site: string): SetupScript {
  const repoName = fullName.split("/")[1];
  const windows = os === "windows";
  const out: ScriptStep[] = [];
  const next: string[] = [];
  const reminders: string[] = [];
  for (const step of steps) {
    if (step.title === "Clone the repository") {
      const clone = step.commands.find((c) => c.startsWith("git clone"))!;
      out.push({ title: step.title, lines: [{ kind: "run", command: clone }] });
      continue;
    }
    const { lines, next: later } = classify(step, os, repoName);
    next.push(...later);
    if (/^Configure environment variables$/.test(step.title) && step.note) reminders.push(step.note);
    if (/^Check it supports/.test(step.title) && step.note) reminders.push(step.note);
    if (lines.length) out.push({ title: step.title, note: step.note, lines });
  }

  const source = `${site.replace(/\/$/, "")}/${fullName}`;
  const body: string[] = [];
  for (const [i, s] of out.entries()) {
    const title = `${i + 1}/${out.length} ${s.title}`;
    body.push("", windows ? `Write-Step ${psQuote(title)}` : `step ${shQuote(title)}`);
    if (s.note) body.push(`# ${s.note.replace(/\n/g, " ")}`);
    if (s.title === "Clone the repository") {
      const clone = (s.lines[0] as { command: string }).command;
      body.push(
        windows
          ? `if (-not (Test-Path ${psQuote(repoName)})) { Invoke-Step { ${clone} } }\nSet-Location ${psQuote(repoName)}`
          : `[ -d ${shQuote(repoName)} ] || ${clone}\ncd ${shQuote(repoName)}`,
      );
      continue;
    }
    // With secrets to fill in, the rest would fail: stop once the file exists, and carry on when run again.
    const secrets = s.title === "Configure environment variables" && s.note?.startsWith("Fill in secrets") ? s.note : null;
    for (const line of s.lines) {
      const copy = secrets && line.kind === "run" ? line.command.match(/^(?:cp|Copy-Item) (\S+) (\S+)$/) : null;
      if (!copy) {
        const need = line.kind === "run" && (line.command === "mise install" || provides(line.command) === "mise") ? runtimeBins(s.note, os) : null;
        body.push(windows ? psLine(line, need) : bashLine(line, need));
        continue;
      }
      const say = `Created ${copy[2]}. ${secrets} in ${copy[2]}, then run this script again.`;
      body.push(
        windows
          ? `if (-not (Test-Path ${copy[2]})) { Copy-Item ${copy[1]} ${copy[2]}; Write-Host ${psQuote(say)}; exit 0 }`
          : `if [ ! -f ${copy[2]} ]; then cp ${copy[1]} ${copy[2]}; echo ${shQuote(say)}; exit 0; fi`,
      );
    }
  }

  const done = [
    `Set up ${fullName}.`,
    ...reminders,
    ...(next.length ? ["Next, from the project folder:", ...next.map((c) => `  ${c}`)] : []),
    `Manual: ${source}`,
  ];

  const text = windows
    ? [
        `# Setup script for ${fullName} on Windows (PowerShell), from ${source}`,
        "# Read it before you run it: the commands come from the repo's own README and files.",
        "# Run: powershell -ExecutionPolicy Bypass -File .\\setup.ps1",
        '$ErrorActionPreference = "Stop"',
        "function Write-Step($t) { Write-Host \"`n==> $t\" -ForegroundColor Cyan }",
        "# Windows ships a python that only opens the Microsoft Store; it doesn't count.",
        "function Have($c) { $cmd = Get-Command $c -ErrorAction SilentlyContinue; [bool]$cmd -and $cmd.Source -notlike '*\\WindowsApps\\*' }",
        "# New installs change PATH; pick it up without opening a new window.",
        'function Update-Path { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }',
        "# Stop when a program fails, like bash's set -e. Dot-sourced, so cd and venv activation carry on to the next step.",
        'function Invoke-Step([scriptblock]$Block) { $global:LASTEXITCODE = 0; . $Block; if ($LASTEXITCODE) { throw "Failed with exit code $LASTEXITCODE" } }',
        ...body,
        "",
        ...done.map((l) => `Write-Host ${psQuote(l)}`),
        "",
      ].join("\n")
    : [
        "#!/usr/bin/env bash",
        `# Setup script for ${fullName} on ${OS_LABEL[os]}, from ${source}`,
        "# Read it before you run it: the commands come from the repo's own README and files.",
        "# Run: bash setup.sh",
        "set -eo pipefail",
        `trap 'echo "Setup stopped at the step above. Steps and fixes: ${source}" >&2' ERR`,
        "step() { printf '\\n\\033[1m==> %s\\033[0m\\n' \"$1\"; }",
        'have() { command -v "$1" >/dev/null 2>&1; }',
        "# Installers put programs here; make them usable right away.",
        'export PATH="$HOME/.local/share/mise/shims:$HOME/.cargo/bin:$HOME/.local/bin:$HOME/.deno/bin:$HOME/.bun/bin:$PATH"',
        "# nvm is a shell function, so load it into this script when it's installed.",
        'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"',
        `load_nvm() { [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"${os === "mac" ? ' || { have brew && [ -s "$(brew --prefix nvm 2>/dev/null)/nvm.sh" ] && mkdir -p "$NVM_DIR" && . "$(brew --prefix nvm)/nvm.sh"; }' : ""}; }`,
        "have_nvm() { load_nvm >/dev/null 2>&1; type nvm >/dev/null 2>&1; }",
        ...body,
        "",
        ...done.map((l) => `echo ${shQuote(l)}`),
        "",
      ].join("\n");

  return { os, filename: windows ? "setup.ps1" : "setup.sh", steps: out, next, reminders, text };
}
