import assert from "node:assert/strict";
import { test } from "node:test";
import { analyze, selectFiles } from "../lib/detect";
import { addonLinks, installChoices, maintainCommands, pythonRange, readmeInstallCommands, venvAgain, withVenv, type InstallCommand } from "../lib/install";

// Group 2 of the PDF review, on microsoft/markitdown's shape: a README that lists several pip installs (they're
// choices, not steps), a Python package kept in a subfolder, and a Docker route.

const pip = (command: string): InstallCommand => ({ command, method: "pip", os: ["mac", "windows", "linux"], script: false, kind: "app" });

test("Python version ranges read the way people say them", () => {
  assert.equal(pythonRange(">=3.10,<3.15"), "3.10–3.14");
  assert.equal(pythonRange(">=3.9"), "3.9 or newer");
  assert.equal(pythonRange("==3.11.*"), "==3.11.*");
  assert.equal(pythonRange(null), null);
});

test("several pip installs become one recommended way, a smaller one, and optional extras", () => {
  const choices = installChoices(
    [
      pip("pip install 'markitdown[pdf, docx, pptx]'"),
      pip("pip install markitdown-ocr"),
      pip("pip install 'markitdown[all]'"),
      pip("pip install 'markitdown[az-content-understanding]'"),
    ],
    { name: "markitdown" },
    { name: "markitdown", requiresPython: ">=3.10,<3.15" },
    { addons: addonLinks(["packages/markitdown-ocr/pyproject.toml"], "https://github.com/microsoft/markitdown", "main") },
  );
  assert.deepEqual(
    choices.map((c) => [c.role, c.command]),
    [
      ["recommended", "pip install 'markitdown[all]'"],
      ["alternative", "pip install 'markitdown[pdf, docx, pptx]'"],
      ["optional", "pip install markitdown-ocr"],
      ["optional", "pip install 'markitdown[az-content-understanding]'"],
    ],
  );
  assert.deepEqual(
    choices.map((c) => c.label),
    ["Recommended: pip", "Smaller install: pdf, docx, pptx", "Optional add-on: markitdown-ocr", "Optional: az-content-understanding"],
  );
  assert.equal(choices[0].note, "Installs all built-in optional features.");
  assert.equal(choices[2].link, "https://github.com/microsoft/markitdown/tree/main/packages/markitdown-ocr");
  assert.deepEqual(choices[0].needs, ["Python 3.10–3.14"]);
  assert.equal(choices[0].venv, true);
  assert.equal(choices[2].venv, false); // an add-on goes into the same environment
  assert.match(choices[3].note!, /may cost money/);
});

test("a Go app's README installing its Python client doesn't make pip the recommended way; a download does", () => {
  const choices = installChoices(
    [
      { command: "curl -fsSL https://ollama.com/install.sh | sh", method: "install script", os: ["mac", "linux"], script: true, kind: "app" },
      pip("pip install ollama"),
      { command: "npm i ollama", method: "Add to your JS project", os: ["mac", "windows", "linux"], script: false, kind: "library" },
    ],
    { name: "ollama" },
    null,
    { download: true },
  );
  assert.deepEqual(
    choices.map((c) => [c.role, c.label]),
    [
      ["alternative", "Alternative: install script"],
      ["alternative", "Alternative: pip"],
      ["library", "For your own code: JS"],
    ],
  );
  assert.equal(choices[1].venv, false);
});

test("a virtual environment comes first, in its own folder, the way each system activates it", () => {
  assert.equal(withVenv("pip install x", "mac", "x"), "mkdir -p ~/x\ncd ~/x\npython3 -m venv .venv\nsource .venv/bin/activate\npip install x");
  assert.equal(
    withVenv("pip install x", "windows", "x"),
    'mkdir "$HOME\\x" -Force | Out-Null\ncd "$HOME\\x"\npython -m venv .venv\n.venv\\Scripts\\Activate.ps1\npip install x',
  );
  assert.equal(venvAgain("linux", "x"), "cd ~/x\nsource .venv/bin/activate");
});

test("update and uninstall for the ways people install", () => {
  assert.deepEqual(maintainCommands(pip("pip install 'markitdown[all]'"), "mac", "markitdown"), {
    update: "pip install --upgrade 'markitdown[all]'",
    uninstall: "rm -rf ~/markitdown/.venv",
    note: "Update with the environment switched on (see Next time). Removing deletes only the environment these steps created (.venv) and everything installed into it; other files in ~/markitdown stay. Switch it off first with deactivate.",
  });
  const brew = { command: "brew install --cask ollama", method: "Homebrew", os: ["mac"], script: false, kind: "app" } as InstallCommand;
  assert.deepEqual(maintainCommands(brew, "mac"), { update: "brew upgrade --cask ollama", uninstall: "brew uninstall --cask ollama" });
  const npm = { command: "npm install -g @openai/codex", method: "npm", os: ["mac"], script: false, kind: "app" } as InstallCommand;
  assert.deepEqual(maintainCommands(npm, "mac"), { update: "npm update -g @openai/codex", uninstall: "npm uninstall -g @openai/codex" });
  const script = { command: "curl -fsSL https://ollama.com/install.sh | sh", method: "install script", os: ["mac"], script: true, kind: "app" } as InstallCommand;
  assert.equal(maintainCommands(script, "mac"), null);
});

test("a Python package in a subfolder is read, and the README's Docker build and run are used in order", () => {
  const entries = [
    { path: "README.md", size: 1 },
    { path: "Dockerfile", size: 1 },
    { path: "packages/markitdown/pyproject.toml", size: 1 },
    { path: "packages/markitdown/tests/pyproject.toml", size: 1 },
  ];
  assert.deepEqual(
    selectFiles(entries).map((e) => e.path).sort(),
    ["Dockerfile", "README.md", "packages/markitdown/pyproject.toml"].sort(),
  );

  const a = analyze(
    { owner: "microsoft", repo: "markitdown" },
    {
      "README.md": [
        "# MarkItDown",
        "```bash",
        "pip install 'markitdown[all]'",
        "```",
        "## Docker",
        "```sh",
        "docker build -t markitdown:latest .",
        "docker run --rm -i markitdown:latest < ~/your-file.pdf > output.md",
        "```",
      ].join("\n"),
      Dockerfile: "FROM python:3.13-slim",
      "packages/markitdown/pyproject.toml": [
        "[project]",
        'name = "markitdown"',
        'requires-python = ">=3.10,<3.15"',
        "",
        "[project.optional-dependencies]",
        'all = ["pdfminer.six"]',
        'pdf = ["pdfminer.six"]',
        'az-content-understanding = ["azure-ai"]',
        "",
        "[project.scripts]",
        'markitdown = "markitdown.__main__:main"',
        "",
        "[tool.hatch]",
      ].join("\n"),
    },
    new Set(),
    entries.map((e) => e.path),
  );
  assert.deepEqual(a.pythonPackage, {
    name: "markitdown",
    requiresPython: ">=3.10,<3.15",
    extras: ["all", "pdf", "az-content-understanding"],
    path: "packages/markitdown/pyproject.toml",
    scripts: ["markitdown"],
  });
  // Built in Docker: the container has Python, so only Docker is needed.
  assert.deepEqual(a.tools, ["Docker"]);
  const run = a.steps.mac.find((s) => /Docker/.test(s.title))!;
  assert.equal(run.title, "Build and run it with Docker");
  assert.deepEqual(run.commands, ["docker build -t markitdown:latest .", "docker run --rm -i markitdown:latest < ~/your-file.pdf > output.md"]);
  assert.equal(run.note, "Docker Desktop must be open and running."); // one sequence in one terminal, not "its own terminal"
  assert.match(a.steps.windows.find((s) => /Docker/.test(s.title))!.commands[1], /^cmd \/c "docker run --rm -i markitdown:latest < %USERPROFILE%\/your-file\.pdf > output\.md"$/);
});

test("README installs: flags before the package, one entry per install, and which Linux it's for", () => {
  const cmds = readmeInstallCommands(
    ["```", "pip install -U Flask", "sudo apt install lazygit", "apt install lazygit", "sudo emerge dev-vcs/lazygit", "```"].join("\n"),
    { owner: "x", name: "lazygit" },
  );
  assert.deepEqual(cmds.map((c) => c.command), ["sudo apt install lazygit", "sudo emerge dev-vcs/lazygit"]);
  assert.deepEqual(
    installChoices(cmds, { name: "lazygit" }, null, { download: true }).map((c) => c.label),
    ["Alternative: Debian, Ubuntu (apt)", "Alternative: Gentoo (emerge)"],
  );
  assert.equal(readmeInstallCommands("```\npip install -U Flask\n```", { owner: "pallets", name: "flask" })[0]?.command, "pip install -U Flask");
});
