export type OS = "mac" | "windows" | "linux";
export const OS_LIST: OS[] = ["mac", "windows", "linux"];
export const OS_LABEL: Record<OS, string> = { mac: "macOS", windows: "Windows", linux: "Linux" };

export function majorMinor(v: string | undefined): string | undefined {
  return v?.match(/(\d+(?:\.\d+)?)/)?.[1];
}

export function major(v: string | undefined): string | undefined {
  return v?.match(/(\d+)/)?.[1];
}

type RuntimeCtx = {
  version?: string;
  pinnedFile?: boolean; // version comes from a file the version manager reads itself (.nvmrc, .python-version…)
  packageManager?: string;
};

// Commands to install a runtime on each OS. Lines starting with "#" are guidance, not commands.
export function runtimeInstall(name: string, os: OS, ctx: RuntimeCtx): string[] {
  const v = ctx.version;
  switch (name) {
    case "Node.js": {
      // ">=18" is a minimum, not a target: the current LTS satisfies it and is what dependencies expect.
      const ver = v && /^\s*>=?/.test(v) ? undefined : major(v);
      if (os === "windows") {
        return ["winget install CoreyButler.NVMforWindows", `nvm install ${ver ?? "lts"}`, `nvm use ${ver ?? "lts"}`];
      }
      const pre = os === "mac" ? "# needs nvm: brew install nvm (or https://github.com/nvm-sh/nvm)" : "# needs nvm: https://github.com/nvm-sh/nvm";
      return [pre, ...(ctx.pinnedFile ? ["nvm install", "nvm use"] : [`nvm install ${ver ?? "--lts"}`])];
    }
    case "Python": {
      if (ctx.packageManager === "uv") {
        // uv downloads the right Python itself during `uv sync`.
        return [
          os === "mac" ? "brew install uv" : os === "windows" ? "winget install astral-sh.uv" : "curl -LsSf https://astral.sh/uv/install.sh | sh",
        ];
      }
      const mm = majorMinor(v)?.includes(".") ? majorMinor(v) : undefined;
      const base =
        os === "mac"
          ? [`brew install python${mm ? `@${mm}` : ""}`]
          : os === "windows"
            ? [`winget install Python.Python.${mm ?? "3.12"}`]
            : ctx.pinnedFile
              ? ["# needs pyenv: https://github.com/pyenv/pyenv", "pyenv install --skip-existing"]
              : [`sudo apt install python3${mm ? ` python${mm}` : ""} python3-venv  # Debian/Ubuntu`];
      if (ctx.packageManager === "poetry") base.push("pipx install poetry");
      if (ctx.packageManager === "pipenv") base.push("pipx install pipenv");
      if (ctx.packageManager === "pdm") base.push("pipx install pdm");
      return base;
    }
    case "Go":
      return os === "mac" ? ["brew install go"] : os === "windows" ? ["winget install GoLang.Go"] : ["sudo snap install go --classic  # or https://go.dev/dl/"];
    case "Rust":
      return [
        os === "windows" ? "winget install Rustlang.Rustup" : "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
        ...(ctx.pinnedFile ? ["rustup show  # installs the pinned toolchain"] : []),
      ];
    case "Ruby":
      if (os === "windows") return ["# Install Ruby+Devkit from https://rubyinstaller.org (or use WSL — recommended for Ruby)"];
      return [
        os === "mac" ? "brew install rbenv ruby-build" : "# needs rbenv: https://github.com/rbenv/rbenv#installation",
        ctx.pinnedFile ? "rbenv install --skip-existing" : `rbenv install ${v ?? "--list"}`,
      ];
    case "PHP":
      return os === "mac"
        ? ["brew install php composer"]
        : os === "windows"
          ? ["scoop install php composer  # needs scoop: https://scoop.sh"]
          : ["sudo apt install php-cli php-mbstring php-xml php-curl unzip composer  # Debian/Ubuntu"];
    case "JDK": {
      const j = major(v) ?? "21";
      return os === "mac"
        ? [`brew install openjdk@${j}`]
        : os === "windows"
          ? [`winget install EclipseAdoptium.Temurin.${j}.JDK`]
          : [`sudo apt install openjdk-${j}-jdk  # Debian/Ubuntu`];
    }
    case "Deno":
      return os === "mac" ? ["brew install deno"] : os === "windows" ? ["winget install DenoLand.Deno"] : ["curl -fsSL https://deno.land/install.sh | sh"];
    case "Bun":
      return os === "windows" ? ['powershell -c "irm bun.sh/install.ps1 | iex"'] : ["curl -fsSL https://bun.sh/install | bash"];
    case "Elixir":
      return os === "mac" ? ["brew install elixir"] : os === "windows" ? ["# https://elixir-lang.org/install.html#windows"] : ["sudo apt install elixir  # Debian/Ubuntu"];
    case ".NET SDK": {
      const m = major(v) ?? "8";
      return os === "mac"
        ? ["brew install --cask dotnet-sdk"]
        : os === "windows"
          ? [`winget install Microsoft.DotNet.SDK.${m}`]
          : [`sudo apt install dotnet-sdk-${m}.0  # Ubuntu 22.04+; other distros: https://learn.microsoft.com/dotnet/core/install/linux`];
    }
    case "Flutter":
      return os === "mac"
        ? ["brew install --cask flutter"]
        : os === "windows"
          ? ["# Install Flutter: https://docs.flutter.dev/get-started/install/windows"]
          : ["sudo snap install flutter --classic"];
    case "Dart":
      return os === "mac" ? ["brew tap dart-lang/dart", "brew install dart"] : os === "windows" ? ["choco install dart-sdk"] : ["# Install Dart: https://dart.dev/get-dart"];
    case "C/C++ compiler":
      return os === "mac"
        ? ["xcode-select --install"]
        : os === "windows"
          ? ["winget install Microsoft.VisualStudio.2022.BuildTools  # then add the \"Desktop development with C++\" workload"]
          : ["sudo apt install build-essential  # Debian/Ubuntu"];
    case "CMake":
      return os === "mac" ? ["brew install cmake"] : os === "windows" ? ["winget install Kitware.CMake"] : ["sudo apt install cmake"];
    case "Meson":
      return os === "mac" ? ["brew install meson ninja"] : os === "windows" ? ["pip install meson ninja"] : ["sudo apt install meson ninja-build"];
    case "Swift":
      return os === "mac"
        ? ["xcode-select --install"]
        : os === "windows"
          ? ["winget install Swift.Toolchain"]
          : ["# Install Swift: https://www.swift.org/install/linux/"];
    case "Clojure CLI":
      return os === "mac" ? ["brew install clojure/tools/clojure"] : ["# Install the Clojure CLI: https://clojure.org/guides/install_clojure"];
    case "Leiningen":
      return os === "mac" ? ["brew install leiningen"] : os === "windows" ? ["choco install lein"] : ["# Install Leiningen: https://leiningen.org/#install"];
    case "SCons":
      return ["pip install scons"];
    default:
      return [];
  }
}

export function miseInstall(os: OS): string[] {
  return [os === "mac" ? "brew install mise" : os === "windows" ? "winget install jdx.mise" : "curl https://mise.run | sh", "mise install"];
}

export function dockerInstall(os: OS): string {
  return os === "mac"
    ? "brew install --cask docker  # Docker Desktop"
    : os === "windows"
      ? "winget install Docker.DockerDesktop"
      : "# needs Docker Engine: https://docs.docker.com/engine/install/";
}

// Rewrites a POSIX shell command into its PowerShell equivalent where they differ.
export function adaptCommand(cmd: string, os: OS): string {
  if (os !== "windows") return cmd;
  return cmd
    .replace(/^source \.venv\/bin\/activate$/, ".venv\\Scripts\\Activate.ps1")
    .replace(/^cp (\S+) (\S+)$/, "Copy-Item $1 $2")
    .replace(/^\.\/mvnw\b/, ".\\mvnw.cmd")
    .replace(/^\.\/gradlew\b/, ".\\gradlew.bat")
    .replace(/^bin\/(rails|dev|setup)\b/, "ruby bin/$1");
}
