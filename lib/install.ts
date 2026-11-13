import type { OS } from "./os";

export type Arch = "arm64" | "x64" | "x86" | "armv7" | "universal";

export type Asset = {
  name: string;
  url: string;
  size: number;
  downloads: number;
  os: OS;
  arch: Arch | null;
  kind: string;
  recommended: boolean;
  commands: string[];
  note?: string;
};

// Files installed onto a phone, tablet or TV from the computer (not run on the computer itself).
export type DeviceAsset = { name: string; url: string; size: number; downloads: number; kind: "apk"; commands: string[] };

export type Release = {
  tag: string;
  name: string;
  url: string;
  publishedAt: string;
  prerelease: boolean;
  assets: Asset[];
  deviceAssets: DeviceAsset[];
};

// scaffold: starts a new project from it (npm create astro@latest).
// app: puts the program on your computer. docker: runs a self-hosted app in a container. library: adds it to your own code.
export type InstallKind = "app" | "docker" | "library" | "scaffold";
export type InstallCommand = { command: string; method: string; os: OS[]; script: boolean; kind: InstallKind };

export type InstallOptions = {
  release: Release | null;
  commands: InstallCommand[];
  declared?: { unsupported: OS[]; quote: string } | null; // what the README says about unsupported systems
  platforms: OS[]; // OSes with a ready-made download or an app install command
  downloadPage?: { host: string; platforms: OS[]; urls: Partial<Record<OS, string>> } | null; // the project's own download pages, when apps live there
};

const SKIP = /(\.(sha\d+|sha\d+sum|md5|sig|asc|pem|crt|sbom|spdx|cdx|intoto\.jsonl|blockmap|ya?ml|json|txt|sum|minisig|bundle|aab|ipa|nupkg|whl|vsix|jar|pom)$)|checksums?|sha256sums|^source/i;

const KINDS: [RegExp, string][] = [
  [/\.(tar\.gz|tgz)$/i, "tar.gz"],
  [/\.tar\.xz$/i, "tar.xz"],
  [/\.(tar\.bz2|tbz)$/i, "tar.bz2"],
  [/\.tar\.zst$/i, "tar.zst"],
  [/\.appimage$/i, "AppImage"],
  [/\.deb$/i, "deb"],
  [/\.rpm$/i, "rpm"],
  [/\.snap$/i, "snap"],
  [/\.flatpak(ref)?$/i, "flatpak"],
  [/\.dmg$/i, "dmg"],
  [/\.pkg$/i, "pkg"],
  [/\.exe$/i, "exe"],
  [/\.msi$/i, "msi"],
  [/\.(msix|msixbundle|appx|appxbundle)$/i, "msix"],
  [/\.zip$/i, "zip"],
  [/\.7z$/i, "7z"],
];

function classifyOs(lower: string, kind: string | undefined): OS | null {
  // Check mac first: "darwin" contains "win".
  if (kind === "dmg" || kind === "pkg" || /darwin|macos|mac-?os|osx|apple|\bmac\b|[-_.]mac[-_.]/.test(lower)) return "mac";
  if (kind === "exe" || kind === "msi" || kind === "msix" || /windows|win(32|64)|[-_.]win[-_.]|msvc|mingw/.test(lower)) return "windows";
  if (["AppImage", "deb", "rpm", "snap", "flatpak"].includes(kind ?? "") || /linux|gnu|musl|ubuntu|debian|fedora/.test(lower)) return "linux";
  return null;
}

function classifyArch(lower: string): Arch | null {
  if (/universal/.test(lower)) return "universal";
  if (/aarch64|arm[-_]?64|armv8/.test(lower)) return "arm64";
  if (/armv7|armhf|armv6|[-_]arm([-_.]|$)/.test(lower)) return "armv7";
  if (/x86[_-]64|amd64|x64|win64|intel/.test(lower)) return "x64";
  if (/i[36]86|x86|win32|386/.test(lower)) return "x86";
  return null;
}

// Higher is better: installers first, then the common architectures.
function score(a: Omit<Asset, "recommended" | "commands">): number {
  const kindRank: Record<OS, string[]> = {
    mac: ["dmg", "pkg", "zip", "tar.gz", "tar.xz"],
    windows: ["exe", "msi", "msix", "zip", "7z"],
    linux: ["AppImage", "deb", "tar.gz", "tar.xz", "rpm", "snap", "flatpak", "tar.bz2", "tar.zst", "zip"],
  };
  const k = kindRank[a.os].indexOf(a.kind);
  const archRank: Record<OS, (Arch | null)[]> = {
    mac: ["universal", "arm64", null, "x64"],
    windows: ["x64", null, "arm64", "x86"],
    linux: ["x64", null, "arm64", "armv7", "x86"],
  };
  const r = archRank[a.os].indexOf(a.arch);
  let s = (k === -1 ? 0 : 50 - k * 5) + (r === -1 ? 0 : 20 - r * 5);
  if (a.os === "windows" && a.kind === "exe" && /setup|install/i.test(a.name)) s += 8;
  if (a.os === "linux" && /musl/i.test(a.name)) s -= 2; // gnu builds are the usual default
  return s;
}

function assetCommands(a: Omit<Asset, "recommended" | "commands">): { commands: string[]; note?: string } {
  const dl = a.os === "windows" ? `Invoke-WebRequest "${a.url}" -OutFile "${a.name}"` : `curl -LO "${a.url}"`;
  const tarFlags: Record<string, string> = { "tar.gz": "-xzf", "tar.xz": "-xJf", "tar.bz2": "-xjf", "tar.zst": "--zstd -xf" };
  const extracted = "Move the extracted binary onto your PATH (e.g. /usr/local/bin).";
  switch (a.kind) {
    case "dmg":
      return { commands: [dl, `open "${a.name}"`], note: "Drag the app into Applications." };
    case "pkg":
      return { commands: [dl, `sudo installer -pkg "${a.name}" -target /`] };
    case "AppImage":
      return { commands: [dl, `chmod +x "${a.name}"`, `./"${a.name}"`] };
    case "deb":
      return { commands: [dl, `sudo apt install ./"${a.name}"`] };
    case "rpm":
      return { commands: [dl, `sudo dnf install ./"${a.name}"`] };
    case "snap":
      return { commands: [dl, `sudo snap install --dangerous ./"${a.name}"`] };
    case "flatpak":
      return { commands: [dl, `flatpak install ./"${a.name}"`] };
    case "exe":
      return { commands: [dl, `Start-Process ".\\${a.name}"`], note: /setup|install/i.test(a.name) ? "Runs the installer." : "Standalone executable — no install needed." };
    case "msi":
      return { commands: [dl, `msiexec /i "${a.name}"`] };
    case "msix":
      return { commands: [dl, `Add-AppxPackage ".\\${a.name}"`] };
    case "zip":
      return a.os === "windows"
        ? { commands: [dl, `Expand-Archive "${a.name}" -DestinationPath .`], note: "Add the extracted folder to your PATH if it's a CLI tool." }
        : { commands: [dl, `unzip "${a.name}"`], note: a.os === "mac" ? "If it contains an .app, move it to Applications." : extracted };
    default:
      if (tarFlags[a.kind]) {
        return {
          commands: [dl, `tar ${tarFlags[a.kind]} "${a.name}"`],
          note: a.os === "mac" ? `${extracted} If macOS blocks it: xattr -d com.apple.quarantine <binary>` : extracted,
        };
      }
      return { commands: [dl] };
  }
}

export function parseRelease(r: any): Release | null {
  if (!r) return null;
  const raw: Omit<Asset, "recommended" | "commands">[] = [];
  const deviceAssets: DeviceAsset[] = [];
  for (const a of r.assets ?? []) {
    const name: string = a.name;
    if (SKIP.test(name)) continue;
    if (/\.apk$/i.test(name)) {
      deviceAssets.push({
        name,
        url: a.browser_download_url,
        size: a.size,
        downloads: a.download_count ?? 0,
        kind: "apk",
        commands: ["adb connect <device-ip>:5555", `adb install -r "${name}"`],
      });
      continue;
    }
    const lower = name.toLowerCase();
    const kind = KINDS.find(([re]) => re.test(name))?.[1];
    const os = classifyOs(lower, kind);
    // Extension-less files with an OS in the name are usually raw binaries (e.g. tool-linux-amd64).
    if (!os || (!kind && /\.\w{2,4}$/.test(name))) continue;
    raw.push({ name, url: a.browser_download_url, size: a.size, downloads: a.download_count ?? 0, os, arch: classifyArch(lower), kind: kind ?? "binary" });
  }
  const best: Partial<Record<OS, string>> = {};
  for (const os of ["mac", "windows", "linux"] as OS[]) {
    const top = raw.filter((a) => a.os === os).sort((a, b) => score(b) - score(a) || b.downloads - a.downloads)[0];
    if (top) best[os] = top.name;
  }
  const assets: Asset[] = raw
    .map((a) => {
      const c =
        a.kind === "binary"
          ? {
              commands: [`curl -LO "${a.url}"`, `chmod +x "${a.name}"`],
              note: "Raw binary — move it onto your PATH.",
            }
          : assetCommands(a);
      return { ...a, recommended: best[a.os] === a.name, ...c };
    })
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || score(b) - score(a));
  return {
    tag: r.tag_name,
    name: r.name || r.tag_name,
    url: r.html_url,
    publishedAt: r.published_at,
    prerelease: Boolean(r.prerelease),
    assets,
    deviceAssets,
  };
}

// Install commands that end users (not contributors) run, matched against README code.
const METHODS: [RegExp, string, OS[], boolean?][] = [
  [/^brew (install|tap)\b/, "Homebrew", ["mac", "linux"]],
  [/^(sudo )?port install\b/, "MacPorts", ["mac"]],
  [/^mas install\b/, "Mac App Store", ["mac"]],
  [/^winget install\b/i, "winget", ["windows"]],
  [/^choco install\b/i, "Chocolatey", ["windows"]],
  [/^scoop (install|bucket add)\b/i, "Scoop", ["windows"]],
  [/^(sudo )?(apt|apt-get) install\b/, "apt", ["linux"]],
  [/^(sudo )?(dnf|yum) install\b/, "dnf", ["linux"]],
  [/^(sudo )?pacman -S\b/, "pacman", ["linux"]],
  [/^(yay|paru) -S\b/, "AUR", ["linux"]],
  [/^(sudo )?zypper (in|install)\b/, "zypper", ["linux"]],
  [/^(sudo )?apk add\b/, "apk", ["linux"]],
  [/^(sudo )?snap install\b/, "Snap", ["linux"]],
  [/^flatpak install\b/, "Flatpak", ["linux"]],
  [/^(sudo )?(emerge|xbps-install|eopkg it)\b/, "distro package", ["linux"]],
  [/^nix(-env -i| profile install| run)\b/, "Nix", ["mac", "linux"]],
  [/^cargo (install|binstall)\b/, "Cargo", ["mac", "windows", "linux"]],
  [/^(npm (i|install) (-g|--global)|pnpm (add|i|install) -g|yarn global add|bun (add|install|i) -g)\b/, "npm", ["mac", "windows", "linux"]],
  [/^(pipx install|uv tool install|uvx )/, "pipx / uv", ["mac", "windows", "linux"]],
  [/^pip3? install (?:(?:-U|--upgrade|--user|-q|--quiet|--pre)\s+)*(?!-r|-e|--editable|\.)["']?[\w\[]/, "pip", ["mac", "windows", "linux"]],
  [/^go install\b/, "Go", ["mac", "windows", "linux"]],
  // Frameworks: you start a new project with them rather than install them.
  [/^(npm create|npm init|pnpm create|yarn create|bun create|npx (--yes )?create-|pnpm dlx create-|bunx create-|npx nuxi@?\S* init|npx sv create|composer create-project)\b/, "Start a new project", ["mac", "windows", "linux"]],
  // Libraries: "installing" means adding them to your own project.
  [/^(uv add|poetry add|pdm add|pipenv install) ["']?[\w\[]/, "Add to your Python project", ["mac", "windows", "linux"]],
  [/^(npm (i|install)|yarn add|pnpm (add|i)|bun add) (?!-)["']?[@\w]/, "Add to your JS project", ["mac", "windows", "linux"]],
  [/^(cargo add|go get|dotnet add package|composer require|bundle add) \S/, "Add to your project", ["mac", "windows", "linux"]],
  [/^gem install\b/, "RubyGems", ["mac", "windows", "linux"]],
  [/^dotnet tool install\b/, ".NET tool", ["mac", "windows", "linux"]],
  [/^(conda|mamba) install\b/, "conda", ["mac", "windows", "linux"]],
  [/^docker (run|pull)\b/, "Docker", ["mac", "windows", "linux"]],
  // The whole stack from the repo's compose file; "up -d postgres" style partial starts are dev helpers, not the app.
  [/^docker[- ]compose (-f \S+ )?up( -d| --detach| --build)*\s*$/, "Docker", ["mac", "windows", "linux"]],
  [/^(curl|wget)\b.*\|\s*(sudo\s+)?(ba|z)?sh\b/, "install script", ["mac", "linux"], true],
  [/^(iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b.*\|\s*iex\b/i, "install script", ["windows"], true],
  [/^powershell .*\birm\b.*\biex\b/i, "install script", ["windows"], true],
];

export function readmeInstallCommands(readme: string | undefined, repo: { owner: string; name: string }): InstallCommand[] {
  if (!readme) return [];
  const candidates: string[] = [];
  // Join "\"-continued lines so multi-line commands (docker run -d \ ...) stay whole.
  for (const m of readme.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) candidates.push(...m[1].replace(/\\\n\s*/g, " ").split("\n"));
  for (const m of readme.matchAll(/`([^`\n]{6,200})`/g)) candidates.push(m[1]);
  for (const m of readme.matchAll(/<code>([^<\n]{6,200})<\/code>/g)) candidates.push(m[1]);

  const out: InstallCommand[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    const command = raw
      .trim()
      .replace(/^(\$|>|PS>|PS [^>]*>|#)\s+/, "")
      .replace(/&amp;/g, "&")
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<")
      .trim();
    // "sudo apt install x" and "apt install x" are the same install.
    const key = command.replace(/^sudo\s+/, "");
    if (!command || command.length > 200 || seen.has(key)) continue;
    const hit = METHODS.find(([re]) => re.test(command));
    if (!hit) continue;
    seen.add(key);
    const kind: InstallKind =
      hit[1] === "Docker" ? "docker" : hit[1].startsWith("Add to your") ? "library" : hit[1] === "Start a new project" ? "scaffold" : "app";
    // READMEs also install dependencies (brew install ffmpeg, apt install xdotool); only keep commands for this project.
    if (!installsThisProject(command, kind, Boolean(hit[3]), repo)) continue;
    if (kind === "docker" && out.filter((c) => c.kind === "docker").length >= 2) continue;
    // Casks are macOS apps; installers piped into sudo are Linux server scripts.
    const os: OS[] = /^brew install --cask\b/.test(command) ? ["mac"] : hit[3] && /\|\s*sudo\b/.test(command) ? ["linux"] : hit[2];
    out.push({ command, method: hit[1], os, script: Boolean(hit[3]), kind });
    if (out.length >= 12) break;
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function installsThisProject(command: string, kind: InstallKind, script: boolean, repo: { owner: string; name: string }): boolean {
  const name = norm(repo.name);
  const owner = norm(repo.owner);
  const matches = (token: string) => {
    const t = norm(token);
    return t.length >= 3 && (t.includes(name) || (t.length >= 4 && name.includes(t)));
  };
  const words = command.replace(/\s+#.*$/, "").split(/\s+/);
  if (script) return words.some((w) => /^https?:/.test(w) && (norm(w).includes(name) || norm(w).includes(owner)));
  if (kind === "docker" && /compose/.test(command)) return true;
  // create-next-app, create-vite: a create command in a framework's own README is for that framework.
  if (kind === "scaffold") return true;
  if (kind === "docker") {
    // Only published images (ghcr.io/owner/app, owner/app); a bare local tag needs a docker build first.
    return words.some((w) => /^[\w.-]+(\/[\w.-]+)+(:[\w.-]+)?$/.test(w) && !/^\.{0,2}\//.test(w) && (matches(w) || norm(w).includes(owner)) && !/:\d+$/.test(w));
  }
  // The package names: arguments after the install verb, without flags, versions or extras.
  const pkgs = words
    .slice(1)
    .filter((w) => !w.startsWith("-"))
    .map((w) => w.replace(/^["']|["']$/g, "").replace(/[\[@=<>~^].*$/, ""));
  return pkgs.some((p) => matches(p.split("/").pop()!) || (p.startsWith("./") && matches(p)) || matches(p));
}

// ---------- Choosing between install commands ----------
// A README often lists several installs one after another (pip install name[all], name[pdf], name-ocr, name[azure]).
// Read as a list they look like steps to run in turn; they're choices. This sorts them into the one to use, smaller
// or different installs of the same thing, optional add-ons, and installs into your own code, and says what each needs.

export type InstallRole = "recommended" | "alternative" | "optional" | "library";
export type InstallChoice = InstallCommand & {
  role: InstallRole;
  label: string; // "Recommended: pip", "Smaller install: pdf, docx", "Optional add-on: name-ocr"
  note?: string;
  link?: string; // where an add-on explains its own setup
  needs: string[]; // what has to be installed first for this way, e.g. ["Python 3.10–3.14"]
  venv: boolean; // a pip install into a project's own environment: create and activate one first
};

const CLOUD = /\b(az|azure|aws|amazon|bedrock|gcp|google|vertex|openai|anthropic|cohere|cloud)\b/i;

// ">=3.10,<3.15" → "3.10–3.14"; ">=3.9" → "3.9 or newer"; anything else as written.
export function pythonRange(spec: string | null | undefined): string | null {
  if (!spec) return null;
  const min = spec.match(/>=\s*(\d+)\.(\d+)/);
  const below = spec.match(/<\s*(\d+)\.(\d+)/);
  if (min && below && below[1] === min[1] && Number(below[2]) > Number(min[2])) return `${min[1]}.${min[2]}–${below[1]}.${Number(below[2]) - 1}`;
  if (min && !below) return `${min[1]}.${min[2]} or newer`;
  return spec.replace(/\s+/g, "");
}

const NEEDS: [RegExp, string][] = [
  [/^Homebrew$/, "Homebrew"],
  [/^(npm|Add to your JS project|Start a new project)$/, "Node.js"],
  [/^pipx \/ uv$/, "pipx or uv"],
  [/^(pip|Add to your Python project)$/, "Python"],
  [/^conda$/, "conda"],
  [/^Cargo$/, "Rust (cargo)"],
  [/^Go$/, "Go"],
  [/^RubyGems$/, "Ruby"],
  [/^\.NET tool$/, ".NET SDK"],
  [/^Docker$/, "Docker"],
  [/^Scoop$/, "Scoop"],
  [/^Chocolatey$/, "Chocolatey"],
  [/^Nix$/, "Nix"],
];

// Which Linux a distro package is for, so "Alternative: distro package" says "Gentoo (emerge)".
const DISTRO: [RegExp, string][] = [
  [/\b(apt|apt-get) install\b/, "Debian, Ubuntu (apt)"],
  [/\b(dnf|yum) install\b/, "Fedora (dnf)"],
  [/\bpacman -S\b/, "Arch (pacman)"],
  [/^(yay|paru) -S\b/, "Arch, AUR"],
  [/\bzypper (in|install)\b/, "openSUSE (zypper)"],
  [/\bapk add\b/, "Alpine (apk)"],
  [/\bemerge\b/, "Gentoo (emerge)"],
  [/\bxbps-install\b/, "Void (xbps)"],
  [/\beopkg it\b/, "Solus (eopkg)"],
];
export const methodName = (c: InstallCommand) => DISTRO.find(([re]) => re.test(c.command))?.[1] ?? c.method;

// "pip install 'name[pdf, docx]'" → { pkg: "name", extras: ["pdf", "docx"] }
function pipSpec(command: string): { pkg: string; extras: string[] } | null {
  const arg = command.match(/^pip3? install\s+(?:-\S+\s+)*["']?([A-Za-z0-9][\w.-]*)(?:\[([^\]]*)\])?/i);
  return arg ? { pkg: arg[1].toLowerCase(), extras: (arg[2] ?? "").split(",").map((x) => x.trim()).filter(Boolean) } : null;
}

export function installChoices(
  commands: InstallCommand[],
  repo: { name: string },
  python?: { requiresPython: string | null; name?: string } | null,
  // download: a ready-made download exists, so that's the recommended way, not a command.
  // addons: where each add-on package lives in the repo (name → link), so its setup is one click away.
  opts: { download?: boolean; addons?: Record<string, string> } = {},
): InstallChoice[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const own = norm(python?.name ?? repo.name);
  const py = pythonRange(python?.requiresPython);
  const needsFor = (c: InstallCommand) =>
    NEEDS.filter(([re]) => re.test(c.method)).map(([, n]) => (n === "Python" ? (py ? `Python ${py}` : "Python 3") : n));

  const choices: InstallChoice[] = commands.map((c) => {
    const base = { ...c, needs: needsFor(c), venv: false };
    if (c.kind === "library") return { ...base, role: "library", label: `For your own code: ${c.method.replace(/^Add to your /, "").replace(/ project$/, "")}` };
    if (c.kind === "scaffold") return { ...base, role: "library", label: "Start a new project" };
    // Only when the repo is that Python package: "pip install ollama" in a Go app's README is its client library.
    const spec = c.method === "pip" && python?.name && norm(pipSpec(c.command)?.pkg ?? "").startsWith(own) ? pipSpec(c.command) : null;
    if (spec) {
      const venv = true;
      const pkg = norm(spec.pkg);
      // A separate package named after the project (name-ocr, name-mcp): an add-on, not the thing itself.
      if (pkg !== own && pkg.startsWith(own))
        return {
          ...base,
          role: "optional",
          label: `Optional add-on: ${spec.pkg}`,
          note: `A separate package that adds a feature on top. Install it in the same environment, after the main install. It may need its own setup or keys, explained ${opts.addons?.[pkg] ? "in its folder" : "in its README"}.`,
          link: opts.addons?.[pkg],
        };
      if (pkg === own && spec.extras.some((e) => CLOUD.test(e) && !/^all$/i.test(e)))
        return {
          ...base,
          role: "optional",
          label: `Optional: ${spec.extras.join(", ")}`,
          note: "Adds a cloud feature, in the same environment as the main install. It uses a cloud service that needs an account and may cost money; installing it doesn't set that up.",
        };
      if (pkg === own && spec.extras.length && !spec.extras.some((e) => /^all$/i.test(e)))
        return { ...base, venv, role: "alternative", label: `Smaller install: ${spec.extras.join(", ")}`, note: `Only the parts for ${spec.extras.join(", ")}.` };
      return {
        ...base,
        venv,
        role: "recommended",
        label: "Recommended: pip",
        // [all] installs the package's optional dependencies; it doesn't set up cloud services or add separate add-ons.
        note: spec.extras.some((e) => /^all$/i.test(e)) ? "Installs all built-in optional features." : undefined,
      };
    }
    return { ...base, role: "alternative", label: `Alternative: ${methodName(c)}` };
  });

  // One recommended way: the full pip install if there is one, else the README's first install.
  const firstApp = opts.download ? undefined : (choices.find((c) => c.role === "recommended") ?? choices.find((c) => c.role === "alternative"));
  for (const c of choices) {
    if (c === firstApp) {
      if (c.role !== "recommended") c.label = `Recommended: ${methodName(c)}`;
      c.role = "recommended";
    } else if (c.role === "recommended") {
      c.role = "alternative";
      c.label = `Alternative: ${methodName(c)}`;
    }
  }
  const order: Record<InstallRole, number> = { recommended: 0, alternative: 1, optional: 2, library: 3 };
  return choices.map((c, i) => ({ c, i })).sort((a, b) => order[a.c.role] - order[b.c.role] || a.i - b.i).map(({ c }) => c);
}

// Add-on packages kept in the repo (packages/name-ocr/pyproject.toml): name → its folder on GitHub, where its
// README explains its setup.
export function addonLinks(manifests: string[], htmlUrl: string, branch: string): Record<string, string> {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const out: Record<string, string> = {};
  for (const p of manifests) {
    const m = p.match(/^(.*\/)?([^/]+)\/pyproject\.toml$/);
    if (m) out[norm(m[2])] = `${htmlUrl}/tree/${branch}/${p.replace(/\/pyproject\.toml$/, "")}`;
  }
  return out;
}

// A pip install into a fresh virtual environment, as Python's own docs recommend, so it can't clash with other tools.
// It lives in its own folder in your home folder (~/name), so it's easy to find and to delete.
export const venvFolder = (name: string) => name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");

export function withVenv(command: string, os: OS, folder: string): string {
  return [...enterFolder(os, folder, true), ...activate(os), command].filter(Boolean).join("\n");
}

const enterFolder = (os: OS, folder: string, create: boolean) =>
  os === "windows"
    ? [create ? `mkdir "$HOME\\${folder}" -Force | Out-Null` : "", `cd "$HOME\\${folder}"`]
    : [create ? `mkdir -p ~/${folder}` : "", `cd ~/${folder}`];

const activate = (os: OS) =>
  os === "windows" ? ["python -m venv .venv", ".venv\\Scripts\\Activate.ps1"] : ["python3 -m venv .venv", "source .venv/bin/activate"];

// Coming back later: open a terminal, go to the folder and switch the environment back on.
export function venvAgain(os: OS, folder: string): string {
  return [...enterFolder(os, folder, false), os === "windows" ? ".venv\\Scripts\\Activate.ps1" : "source .venv/bin/activate"].filter(Boolean).join("\n");
}

// Keeping it up to date and removing it, for the ways we know how to undo. Null when a way has no standard pair.
export function maintainCommands(c: InstallCommand, os: OS, folder?: string): { update: string; uninstall: string; note?: string } | null {
  const cmd = c.command.trim();
  const words = cmd.split(/\s+/);
  const args = words.filter((w, i) => i > 1 && !w.startsWith("-"));
  const pkg = (args[0] ?? "").replace(/^["']|["']$/g, "");
  if (!pkg) return null;
  const bare = pkg.replace(/\[.*$/, "");
  if (c.method === "pip")
    return {
      update: `pip install --upgrade ${pkg.includes("[") ? `'${pkg}'` : pkg}`,
      // Only what these steps made: the .venv environment, not the folder, which may hold the person's own files.
      uninstall: folder ? (os === "windows" ? `Remove-Item -Recurse -Force "$HOME\\${folder}\\.venv"` : `rm -rf ~/${folder}/.venv`) : `pip uninstall ${bare}`,
      note: folder
        ? `Update with the environment switched on (see Next time). Removing deletes only the environment these steps created (.venv) and everything installed into it; other files in ~/${folder} stay. Switch it off first with deactivate.`
        : undefined,
    };
  if (c.method === "Homebrew" && /^brew install\b/.test(cmd)) {
    const cask = /--cask\b/.test(cmd) ? "--cask " : "";
    return { update: `brew upgrade ${cask}${bare}`, uninstall: `brew uninstall ${cask}${bare}` };
  }
  if (c.method === "npm" && /^npm (i|install) (-g|--global)\b/.test(cmd)) return { update: `npm update -g ${bare}`, uninstall: `npm uninstall -g ${bare}` };
  if (c.method === "pipx / uv" && /^pipx install\b/.test(cmd)) return { update: `pipx upgrade ${bare}`, uninstall: `pipx uninstall ${bare}` };
  if (c.method === "pipx / uv" && /^uv tool install\b/.test(cmd)) return { update: `uv tool upgrade ${bare}`, uninstall: `uv tool uninstall ${bare}` };
  if (c.method === "Cargo" && /^cargo install\b/.test(cmd)) return { update: cmd, uninstall: `cargo uninstall ${bare}`, note: "Updating is the same command again." };
  if (c.method === "winget") {
    const id = cmd.match(/--id[ =](\S+)|-e\s+--id\s+(\S+)/)?.slice(1).find(Boolean) ?? pkg;
    return { update: `winget upgrade --id ${id}`, uninstall: `winget uninstall --id ${id}` };
  }
  if (c.method === "Scoop" && /^scoop install\b/.test(cmd)) return { update: `scoop update ${bare}`, uninstall: `scoop uninstall ${bare}` };
  if (c.method === "Chocolatey") return { update: `choco upgrade ${bare}`, uninstall: `choco uninstall ${bare}` };
  if (c.method === "RubyGems") return { update: `gem update ${bare}`, uninstall: `gem uninstall ${bare}` };
  return null;
}
