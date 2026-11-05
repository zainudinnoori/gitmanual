import type { TreeEntry } from "./github";
import { OS_LIST, adaptCommand, dockerInstall, miseInstall, runtimeInstall, type OS } from "./os";
import { COMPAT_SECTIONS, UNDO_SECTIONS, extractReadmeSection, tipsFor, toolsFor, type ReadmeSection } from "./readme";

export type Item = { name: string; detail?: string; source: string };
export type EnvVar = { name: string; example: string; secret: boolean; source: string };
export type Step = { title: string; commands: string[]; note?: string; tips?: string[] };

export type Analysis = {
  stacks: string[];
  runtimes: Item[];
  packageManagers: Item[];
  services: Item[];
  envVars: EnvVar[];
  scripts: { name: string; command: string }[];
  hints: string[];
  steps: Record<OS, Step[]>;
  osNotes: Record<OS, string[]>;
  readme: ReadmeSection | null;
  compatibility: ReadmeSection | null;
  readmeFirst: boolean; // the README section holds prerequisites for the steps, so show it before them
  tools: string[];
  needsDevice: boolean;
  difficulty: { label: "Easy" | "Moderate" | "Involved"; score: number };
  otherManifests: string[];
};

// Files whose presence alone tells us something; we don't download them.
const PRESENCE_ONLY = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "poetry.lock",
  "uv.lock",
  "pdm.lock",
  "Pipfile.lock",
  "Gemfile.lock",
  "composer.lock",
  "Cargo.lock",
  "go.sum",
  "manage.py",
  "artisan",
  "bin/rails",
  "mvnw",
  "gradlew",
  "main.go",
  "main.py",
  "app.py",
  "wsgi.py",
  "bin/setup",
  "scripts/setup.sh",
  "setup.sh",
  "prisma/schema.prisma",
  "AGENTS.md",
  "CLAUDE.md",
]);

const ROOT_FILES = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  ".nvmrc",
  ".node-version",
  ".python-version",
  ".ruby-version",
  ".tool-versions",
  "mise.toml",
  ".mise.toml",
  "rust-toolchain",
  "rust-toolchain.toml",
  "runtime.txt",
  "requirements.txt",
  "requirements-dev.txt",
  "pyproject.toml",
  "Pipfile",
  "setup.py",
  "environment.yml",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "deno.json",
  "deno.jsonc",
  "mix.exs",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  "Makefile",
  "justfile",
  "Procfile",
  ".devcontainer/devcontainer.json",
  ".devcontainer.json",
  "prisma/schema.prisma",
  "global.json",
  "Directory.Build.props",
  "pubspec.yaml",
  "CMakeLists.txt",
  "meson.build",
  "SConstruct",
  ".gitmodules",
  "Package.swift",
]);

const ENV_EXAMPLE = /(^|\/)\.env(\.[\w-]+)*\.(example|sample|template|dist|defaults)$|(^|\/)(example|sample)\.env$/;
// Gems used to test, lint or debug a project, never to run it.
const TOOL_GEM = /^(minitest(-.+)?|rubocop(-.+)?|rspec(-.+)?|test-unit|rake|simplecov(-.+)?|standard|pry(-.+)?|byebug|debug|webmock|vcr|mocha|danger(-.+)?|yard|rdoc|overcommit|reek|benchmark-ips|ruby-prof|stackprof)$/;

// The tool gems, when they're all a Gemfile has; null when it's a Ruby library (gemspec) or has app gems.
function gemfileToolsOnly(gemfile: string): string[] | null {
  if (/^\s*gemspec\b/m.test(gemfile)) return null;
  const gems = [...gemfile.matchAll(/^\s*gem\s+['"]([\w.-]+)['"]/gm)].map((m) => m[1]);
  return gems.length && gems.every((g) => TOOL_GEM.test(g)) ? gems : null;
}

const MANIFEST = /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|go\.mod|Cargo\.toml|Gemfile|composer\.json|pom\.xml|pubspec\.yaml|[^/]+\.csproj|CMakeLists\.txt)$/;

export function selectFiles(entries: TreeEntry[]): TreeEntry[] {
  const picked: TreeEntry[] = [];
  let workflows = 0;
  let nestedEnv = 0;
  const priority = (p: string) => (/test|ci|build|check|lint/i.test(p.split("/").pop()!) ? 0 : 1);
  const ordered = [...entries].sort((a, b) => priority(a.path) - priority(b.path));
  for (const e of ordered) {
    const depth = e.path.split("/").length;
    if (ROOT_FILES.has(e.path) || /^readme(\.\w+)?$/i.test(e.path)) picked.push(e);
    else if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(e.path) && workflows < 6) {
      picked.push(e);
      workflows++;
    } else if (ENV_EXAMPLE.test(e.path) && (depth === 1 || (depth <= 3 && nestedEnv++ < 5))) picked.push(e);
  }
  return picked;
}

export function presentPaths(entries: TreeEntry[]): Set<string> {
  return new Set(entries.map((e) => e.path).filter((p) => PRESENCE_ONLY.has(p) || /^cmd\/[^/]+\/main\.go$/.test(p)));
}

function firstMatch(text: string | undefined, re: RegExp): string | undefined {
  return text?.match(re)?.[1]?.trim();
}

function safeJson(text: string | undefined): any {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toolVersions(text: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text?.split("\n") ?? []) {
    const [tool, version] = line.replace(/#.*/, "").trim().split(/\s+/);
    if (tool && version) out[tool] = version;
  }
  return out;
}

function parseEnv(text: string, source: string): EnvVar[] {
  const out: EnvVar[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const example = m[2].replace(/\s+#.*$/, "").replace(/^['"]|['"]$/g, "");
    out.push({
      name: m[1],
      example,
      secret: /KEY|SECRET|TOKEN|PASSWORD|PASS$|PRIVATE|CREDENTIAL/i.test(m[1]),
      source,
    });
  }
  return out;
}

const SERVICE_PATTERNS: [RegExp, string][] = [
  [/postgres|postgis|timescale|supabase\/postgres/, "PostgreSQL"],
  [/mysql/, "MySQL"],
  [/mariadb/, "MariaDB"],
  [/redis|valkey/, "Redis"],
  [/mongo/, "MongoDB"],
  [/rabbitmq/, "RabbitMQ"],
  [/elasticsearch|opensearch/, "Elasticsearch / OpenSearch"],
  [/kafka|redpanda/, "Kafka"],
  [/minio/, "MinIO (S3)"],
  [/memcached/, "Memcached"],
  [/mailhog|mailpit/, "Mail catcher"],
  [/clickhouse/, "ClickHouse"],
  [/meilisearch/, "Meilisearch"],
  [/qdrant|weaviate|chroma|milvus/, "Vector DB"],
  [/localstack/, "LocalStack (AWS)"],
];

function servicesFromCompose(text: string, source: string): Item[] {
  const out: Item[] = [];
  for (const m of text.matchAll(/^\s*image:\s*['"]?([^\s'"#]+)/gm)) {
    const image = m[1].toLowerCase();
    const known = SERVICE_PATTERNS.find(([re]) => re.test(image));
    // Unknown images are usually the project's own app container, not a dependency.
    if (known) out.push({ name: known[1], detail: image, source });
  }
  return out;
}

const DEP_SERVICES: [RegExp, string][] = [
  [/^(pg|postgres|@neondatabase\/serverless|psycopg2?(-binary)?|psycopg|asyncpg)$/, "PostgreSQL"],
  [/^(mysql2?|pymysql|mysqlclient)$/, "MySQL"],
  [/^(mongoose|mongodb|pymongo|motor)$/, "MongoDB"],
  [/^(redis|ioredis|bullmq|bull|celery\[redis\])$/, "Redis"],
];

function servicesFromDeps(deps: string[], source: string): Item[] {
  const out: Item[] = [];
  for (const d of deps) {
    const hit = DEP_SERVICES.find(([re]) => re.test(d.toLowerCase()));
    if (hit) out.push({ name: hit[1], detail: `dependency: ${d}`, source });
  }
  return out;
}

function pythonDeps(files: Record<string, string>): string[] {
  const deps: string[] = [];
  for (const line of (files["requirements.txt"] ?? "").split("\n")) {
    const name = line.trim().match(/^([A-Za-z0-9_.\-\[\]]+)/)?.[1];
    if (name && !line.trim().startsWith("#") && !line.trim().startsWith("-")) deps.push(name);
  }
  const py = files["pyproject.toml"] ?? "";
  // Quoted requirement strings, one per line or inline in an array (PEP 621 / dependency-groups).
  for (const m of py.matchAll(/["']([A-Za-z][A-Za-z0-9_.\-]*)(?:\[[^\]]*\])?\s*(?:[<>=~!;,]|["'])/g)) deps.push(m[1]);
  for (const m of py.matchAll(/^([A-Za-z0-9_.\-]+)\s*=\s*["{]/gm)) deps.push(m[1]);
  return deps;
}

function dedupe<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function analyze(
  repo: { owner: string; repo: string }, // canonical owner/name, used for clone instructions
  files: Record<string, string>,
  present: Set<string>,
  allPaths: string[],
  language: string | null = null, // GitHub's main language, to tell a project's own stack from its helper tooling
  description: string | null = null,
): Analysis {
  const has = (p: string) => p in files || present.has(p);
  const stacks: string[] = [];
  const runtimes: Item[] = [];
  const packageManagers: Item[] = [];
  const services: Item[] = [];
  const hints: string[] = [];
  const scripts: { name: string; command: string }[] = [];
  const installCmds: string[] = [];
  const dbCmds: string[] = [];
  const runCmds: string[] = [];
  const testCmds: string[] = [];

  const tv = { ...toolVersions(files[".tool-versions"]) };
  const mise = files["mise.toml"] ?? files[".mise.toml"];
  const ci = Object.entries(files).filter(([p]) => p.startsWith(".github/workflows/"));
  const ciText = ci.map(([, t]) => t).join("\n");
  const firstCi = ci[0]?.[0];

  // ---------- Node.js ----------
  const pkg = safeJson(files["package.json"]);
  if (pkg) {
    stacks.push("Node.js");
    const nodeVersion =
      (files[".nvmrc"] && { v: files[".nvmrc"].trim(), s: ".nvmrc" }) ||
      (files[".node-version"] && { v: files[".node-version"].trim(), s: ".node-version" }) ||
      (tv.nodejs && { v: tv.nodejs, s: ".tool-versions" }) ||
      (pkg.volta?.node && { v: pkg.volta.node, s: "package.json (volta)" }) ||
      (pkg.engines?.node && { v: pkg.engines.node, s: "package.json (engines)" }) ||
      (firstMatch(ciText, /node-version:\s*['"]?([\w.\-^~>=<*]+)/) && {
        v: firstMatch(ciText, /node-version:\s*['"]?([\w.\-^~>=<*]+)/)!,
        s: firstCi!,
      }) ||
      undefined;
    runtimes.push({ name: "Node.js", detail: nodeVersion?.v ?? "LTS (no version pinned)", source: nodeVersion?.s ?? "package.json" });

    let pm = "npm";
    let pmSource = "default";
    // "pnpm@9.1.0+sha512.abc…": the hash is for corepack, not for people.
    const declared = typeof pkg.packageManager === "string" ? pkg.packageManager.replace(/\+sha\d+\..*$/, "") : undefined;
    if (declared) {
      pm = declared.split("@")[0];
      pmSource = "package.json (packageManager)";
    } else if (has("pnpm-lock.yaml")) [pm, pmSource] = ["pnpm", "pnpm-lock.yaml"];
    else if (has("yarn.lock")) [pm, pmSource] = ["yarn", "yarn.lock"];
    else if (has("bun.lockb") || has("bun.lock")) [pm, pmSource] = ["bun", "bun lockfile"];
    else if (has("package-lock.json")) pmSource = "package-lock.json";
    packageManagers.push({ name: pm, detail: declared, source: pmSource });

    if (pm === "pnpm" || pm === "yarn") installCmds.push("corepack enable");
    if (pm === "bun") runtimes.push({ name: "Bun", source: pmSource });
    installCmds.push(
      pm === "npm" ? (has("package-lock.json") ? "npm ci" : "npm install") : pm === "yarn" ? "yarn install" : `${pm} install`,
    );

    const run = (s: string) => (pm === "npm" ? `npm run ${s}` : pm === "bun" ? `bun run ${s}` : `${pm} ${s}`);
    for (const [name, command] of Object.entries<string>(pkg.scripts ?? {})) scripts.push({ name, command });
    const runScript = ["dev", "develop", "start:dev", "serve", "start"].find((s) => pkg.scripts?.[s]);
    // Tauri desktop apps: the JS dev script only serves the web view; `tauri dev` builds and opens the real app.
    const tauri = allPaths.includes("src-tauri/tauri.conf.json") || allPaths.includes("src-tauri/Cargo.toml");
    if (tauri) {
      stacks.push("Tauri");
      if (!files["Cargo.toml"]) {
        const tc = files["rust-toolchain.toml"] ?? files["rust-toolchain"];
        runtimes.push({ name: "Rust", detail: firstMatch(tc, /channel\s*=\s*["']([^"']+)/) ?? tv.rust ?? "stable", source: "src-tauri/Cargo.toml" });
      }
      hints.push(
        "Tauri desktop app: it also needs Tauri's system prerequisites (Xcode Command Line Tools on macOS, WebView2 and the C++ build tools on Windows, webkit2gtk on Linux). See https://tauri.app/start/prerequisites/",
      );
    }
    if (tauri && pkg.scripts?.tauri) runCmds.push(run("tauri dev"));
    else if (runScript && !allPaths.includes("bin/dev")) runCmds.push(run(runScript));
    if (pkg.scripts?.test && !/no test specified/.test(pkg.scripts.test)) testCmds.push(pm === "npm" ? "npm test" : run("test"));

    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    services.push(...servicesFromDeps(deps, "package.json"));

    if (files["prisma/schema.prisma"] || deps.includes("prisma")) {
      const provider = firstMatch(files["prisma/schema.prisma"], /provider\s*=\s*"(postgresql|mysql|mongodb|sqlite|sqlserver|cockroachdb)"/);
      if (provider && provider !== "sqlite") {
        const map: Record<string, string> = { postgresql: "PostgreSQL", mysql: "MySQL", mongodb: "MongoDB", sqlserver: "SQL Server", cockroachdb: "CockroachDB" };
        services.push({ name: map[provider], detail: "Prisma datasource", source: "prisma/schema.prisma" });
      }
      dbCmds.push(pm === "npm" ? "npx prisma migrate dev" : pm === "bun" ? "bunx prisma migrate dev" : `${pm} prisma migrate dev`);
    }
    if (files["pnpm-workspace.yaml"] || pkg.workspaces) hints.push("Monorepo (workspaces) — install from the repo root.");
    if (deps.includes("next")) stacks.push("Next.js");
    else if (deps.includes("vite")) stacks.push("Vite");
    if (deps.includes("@nestjs/core")) stacks.push("NestJS");
  }

  // ---------- Deno ----------
  const deno = safeJson(files["deno.json"] ?? files["deno.jsonc"]);
  if (deno || files["deno.jsonc"]) {
    stacks.push("Deno");
    runtimes.push({ name: "Deno", source: "deno.json" });
    if (deno?.tasks?.dev) runCmds.push("deno task dev");
    else if (deno?.tasks?.start) runCmds.push("deno task start");
  }

  // ---------- Python ----------
  // A pyproject.toml that only configures tools (ruff, mypy) isn't a Python project to install.
  const py = /^\[(project|tool\.poetry|build-system)\]/m.test(files["pyproject.toml"] ?? "") ? files["pyproject.toml"] : undefined;
  if (py || files["requirements.txt"] || files["Pipfile"] || files["setup.py"] || files["environment.yml"]) {
    stacks.push("Python");
    const v =
      (files[".python-version"] && { v: files[".python-version"].trim().split("\n")[0], s: ".python-version" }) ||
      (tv.python && { v: tv.python, s: ".tool-versions" }) ||
      (firstMatch(py, /requires-python\s*=\s*["']([^"']+)/) && { v: firstMatch(py, /requires-python\s*=\s*["']([^"']+)/)!, s: "pyproject.toml" }) ||
      (firstMatch(py, /^python\s*=\s*["']([^"']+)/m) && { v: firstMatch(py, /^python\s*=\s*["']([^"']+)/m)!, s: "pyproject.toml (poetry)" }) ||
      (firstMatch(files["runtime.txt"], /python-([\d.]+)/) && { v: firstMatch(files["runtime.txt"], /python-([\d.]+)/)!, s: "runtime.txt" }) ||
      (firstMatch(ciText, /python-version:\s*['"]?([\d.x]+)/) && { v: firstMatch(ciText, /python-version:\s*['"]?([\d.x]+)/)!, s: firstCi! }) ||
      undefined;
    runtimes.push({ name: "Python", detail: v?.v ?? "3.x (no version pinned)", source: v?.s ?? "requirements" });

    if (has("uv.lock") || /\[tool\.uv\]/.test(py ?? "")) {
      packageManagers.push({ name: "uv", source: has("uv.lock") ? "uv.lock" : "pyproject.toml" });
      installCmds.push("uv sync");
    } else if (has("poetry.lock") || /\[tool\.poetry\]/.test(py ?? "")) {
      packageManagers.push({ name: "poetry", source: has("poetry.lock") ? "poetry.lock" : "pyproject.toml" });
      installCmds.push("poetry install");
    } else if (has("pdm.lock")) {
      packageManagers.push({ name: "pdm", source: "pdm.lock" });
      installCmds.push("pdm install");
    } else if (files["Pipfile"]) {
      packageManagers.push({ name: "pipenv", source: "Pipfile" });
      installCmds.push("pipenv install --dev");
    } else if (files["environment.yml"]) {
      packageManagers.push({ name: "conda", source: "environment.yml" });
      installCmds.push("conda env create -f environment.yml");
    } else {
      packageManagers.push({ name: "pip", source: files["requirements.txt"] ? "requirements.txt" : "pyproject.toml" });
      installCmds.push("python -m venv .venv", "source .venv/bin/activate");
      if (files["requirements.txt"]) installCmds.push("pip install -r requirements.txt");
      if (files["requirements-dev.txt"]) installCmds.push("pip install -r requirements-dev.txt");
      if (!files["requirements.txt"] && (py || files["setup.py"])) installCmds.push("pip install -e .");
    }

    const deps = pythonDeps(files).map((d) => d.toLowerCase());
    services.push(...servicesFromDeps(deps, "Python dependencies"));
    // Tools that manage their own venv need commands run through them.
    const pre = installCmds.includes("uv sync")
      ? "uv run "
      : installCmds.includes("poetry install")
        ? "poetry run "
        : installCmds.includes("pipenv install --dev")
          ? "pipenv run "
          : installCmds.includes("pdm install")
            ? "pdm run "
            : "";
    if (deps.includes("pytest") || /\[tool\.pytest/.test(py ?? "")) testCmds.push(`${pre}pytest`);
    if (has("manage.py")) {
      stacks.push("Django");
      dbCmds.push(`${pre}python manage.py migrate`);
      runCmds.push(`${pre}python manage.py runserver`);
    } else if (deps.includes("fastapi") && (has("main.py") || has("app.py"))) {
      stacks.push("FastAPI");
      runCmds.push(`${pre}uvicorn ${has("main.py") ? "main" : "app"}:app --reload`);
    } else if (deps.includes("flask") && (has("app.py") || has("wsgi.py"))) {
      stacks.push("Flask");
      runCmds.push(`${pre}flask run`);
    } else if (deps.includes("streamlit") && (has("app.py") || has("main.py"))) {
      runCmds.push(`${pre}streamlit run ${has("app.py") ? "app.py" : "main.py"}`);
    } else if (has("main.py")) runCmds.push(`${pre}python main.py`);
    else if (has("app.py")) runCmds.push(`${pre}python app.py`);
  }

  // ---------- Go ----------
  if (files["go.mod"]) {
    stacks.push("Go");
    const v = tv.golang ?? firstMatch(files["go.mod"], /^go\s+([\d.]+)/m);
    runtimes.push({ name: "Go", detail: v, source: tv.golang ? ".tool-versions" : "go.mod" });
    installCmds.push("go mod download");
    testCmds.push("go test ./...");
    // With several cmd/ programs, only the one named after the repo is clearly "the app".
    const cmds = allPaths.filter((p) => /^cmd\/[^/]+\/main\.go$/.test(p)).map((p) => p.split("/")[1]);
    const main = cmds.length === 1 ? cmds[0] : cmds.find((c) => c.toLowerCase() === repo.repo.toLowerCase());
    if (has("main.go")) runCmds.push("go run .");
    else if (main) runCmds.push(`go run ./cmd/${main}`);
    else if (cmds.length) hints.push(`Several programs live in cmd/ (${cmds.slice(0, 6).join(", ")}). Run one with \`go run ./cmd/<name>\`; the README says which is the app.`);
  }

  // ---------- Rust ----------
  if (files["Cargo.toml"]) {
    stacks.push("Rust");
    const tc = files["rust-toolchain.toml"] ?? files["rust-toolchain"];
    const v = firstMatch(tc, /channel\s*=\s*["']([^"']+)/) ?? tc?.trim().split("\n")[0] ?? tv.rust;
    runtimes.push({ name: "Rust", detail: v ?? "stable", source: tc ? "rust-toolchain" : "Cargo.toml" });
    installCmds.push("cargo build");
    testCmds.push("cargo test");
    const rootPackage = /^\[package\]/m.test(files["Cargo.toml"]);
    if (rootPackage) runCmds.push("cargo run");
    else if (/\[workspace\]/.test(files["Cargo.toml"])) hints.push("Cargo workspace — pick a crate with `cargo run -p <name>`.");
  }

  // ---------- Ruby ----------
  // A Gemfile of test and lint tools only (fzf's is minitest + rubocop) isn't the app's runtime: Ruby is then
  // needed only to run the tests, so `bundle install` belongs with them.
  const toolGems = files["Gemfile"] && !has("bin/rails") ? gemfileToolsOnly(files["Gemfile"]) : null;
  if (toolGems) {
    hints.push(`The Gemfile only holds test and lint tools (${toolGems.slice(0, 4).join(", ")}): Ruby is needed just to run those.`);
    testCmds.unshift("bundle install"); // before the tests that need it
  } else if (files["Gemfile"]) {
    stacks.push("Ruby");
    const v = files[".ruby-version"]?.trim() ?? tv.ruby ?? firstMatch(files["Gemfile"], /^ruby\s+["']([^"']+)/m);
    runtimes.push({ name: "Ruby", detail: v, source: files[".ruby-version"] ? ".ruby-version" : "Gemfile" });
    packageManagers.push({ name: "bundler", source: "Gemfile" });
    installCmds.push("bundle install");
    if (has("bin/rails")) {
      stacks.push("Rails");
      testCmds.push("bin/rails test");
      dbCmds.push("bin/rails db:prepare");
      runCmds.push(allPaths.includes("bin/dev") ? "bin/dev" : "bin/rails server");
    }
  }

  // ---------- PHP ----------
  const composer = safeJson(files["composer.json"]);
  if (composer) {
    stacks.push("PHP");
    runtimes.push({ name: "PHP", detail: composer.require?.php, source: "composer.json" });
    packageManagers.push({ name: "composer", source: "composer.json" });
    installCmds.push("composer install");
    if (has("artisan")) {
      stacks.push("Laravel");
      dbCmds.push("php artisan key:generate", "php artisan migrate");
      runCmds.push("php artisan serve");
    }
  }

  // ---------- Java / Kotlin ----------
  const pom = files["pom.xml"];
  const gradle = files["build.gradle"] ?? files["build.gradle.kts"];
  if (pom || gradle) {
    stacks.push(gradle && files["build.gradle.kts"] ? "Kotlin/JVM" : "Java");
    const v =
      firstMatch(pom, /<java\.version>([^<]+)</) ??
      firstMatch(pom, /<maven\.compiler\.(?:source|release)>([^<]+)</) ??
      firstMatch(gradle, /languageVersion(?:\.set\()?\s*(?:=\s*)?JavaLanguageVersion\.of\((\d+)\)/) ??
      firstMatch(gradle, /sourceCompatibility\s*=\s*['"]?(?:JavaVersion\.VERSION_)?([\d_.]+)/) ??
      tv.java;
    runtimes.push({ name: "JDK", detail: v, source: pom ? "pom.xml" : "build.gradle" });
    const spring = /spring-boot/.test(pom ?? gradle ?? "");
    if (spring) stacks.push("Spring Boot");
    if (pom) {
      const mvn = has("mvnw") ? "./mvnw" : "mvn";
      packageManagers.push({ name: "Maven", source: "pom.xml" });
      installCmds.push(`${mvn} install -DskipTests`);
      runCmds.push(spring ? `${mvn} spring-boot:run` : `${mvn} exec:java`);
    } else {
      const g = has("gradlew") ? "./gradlew" : "gradle";
      packageManagers.push({ name: "Gradle", source: "build.gradle" });
      installCmds.push(`${g} build -x test`);
      runCmds.push(spring ? `${g} bootRun` : `${g} run`);
    }
  }

  // ---------- Elixir ----------
  if (files["mix.exs"]) {
    stacks.push("Elixir");
    runtimes.push({ name: "Elixir", detail: tv.elixir ?? firstMatch(files["mix.exs"], /elixir:\s*"([^"]+)"/), source: "mix.exs" });
    installCmds.push("mix deps.get");
    if (/:phoenix/.test(files["mix.exs"])) {
      stacks.push("Phoenix");
      dbCmds.push("mix ecto.setup");
      runCmds.push("mix phx.server");
    }
  }

  // ---------- .NET ----------
  const sln = allPaths.find((p) => /^[^/]+\.(sln|slnx)$/.test(p)) ?? allPaths.find((p) => /^src\/[^/]+\.(sln|slnx)$/.test(p));
  const rootProj = allPaths.find((p) => /^[^/]+\.(csproj|fsproj)$/.test(p));
  if (sln || rootProj) {
    stacks.push(".NET");
    const sdk =
      firstMatch(files["global.json"], /"version"\s*:\s*"([\d.]+)/) ??
      firstMatch(files["Directory.Build.props"], /<TargetFramework>net(\d+\.\d+)/);
    runtimes.push({ name: ".NET SDK", detail: sdk, source: files["global.json"] && sdk ? "global.json" : sln ?? rootProj! });
    const target = sln ?? rootProj!;
    installCmds.push(`dotnet restore ${target}`, `dotnet build ${target}`);
    if (rootProj) runCmds.push("dotnet run");
    else hints.push("A .NET solution with several projects: start the app project with `dotnet run --project <path/to/App.csproj>` (the README usually names it).");
    testCmds.push(`dotnet test ${target}`);
  }

  // ---------- Flutter / Dart ----------
  const pubspec = files["pubspec.yaml"];
  if (pubspec) {
    const flutter = /^\s*flutter:\s*$|sdk:\s*flutter/m.test(pubspec);
    stacks.push(flutter ? "Flutter" : "Dart");
    runtimes.push({ name: flutter ? "Flutter" : "Dart", detail: firstMatch(pubspec, /^\s*(?:flutter|sdk):\s*["']?([^"'\n]+)/m), source: "pubspec.yaml" });
    installCmds.push(flutter ? "flutter pub get" : "dart pub get");
    if (flutter) {
      runCmds.push("flutter run");
      testCmds.push("flutter test");
      hints.push("Run `flutter doctor` first: it lists what's missing for each target (Xcode for iOS/macOS, Android Studio for Android, Visual Studio for Windows).");
    } else testCmds.push("dart test");
  }

  // ---------- Swift ----------
  if (allPaths.includes("Package.swift")) {
    stacks.push("Swift");
    runtimes.push({ name: "Swift", source: "Package.swift" });
    installCmds.push("swift build");
    testCmds.push("swift test");
  }

  // ---------- Clojure ----------
  const lein = allPaths.includes("project.clj");
  if (allPaths.includes("deps.edn") || lein) {
    stacks.push("Clojure");
    if (!runtimes.some((r) => r.name === "JDK")) runtimes.push({ name: "JDK", detail: tv.java, source: lein ? "project.clj" : "deps.edn" });
    runtimes.push({ name: lein ? "Leiningen" : "Clojure CLI", source: lein ? "project.clj" : "deps.edn" });
    if (lein) installCmds.push("lein deps");
  }

  // ---------- C / C++ ----------
  const nativeBuild = files["CMakeLists.txt"] ? "CMake" : files["meson.build"] ? "Meson" : files["SConstruct"] ? "SCons" : null;
  // Python can sit next to a native build (helper scripts); a JS/Rust/Go/JVM/.NET project with CMake is that stack's build.
  // When GitHub says the code is mostly C/C++, the native build is the project even if a JVM/JS part sits next to it (scrcpy's server).
  const nativeLang = /^(C|C\+\+|Objective-C)$/.test(language ?? "");
  if (nativeBuild && nativeLang) {
    for (const x of ["Java", "Kotlin/JVM"]) {
      const i = stacks.indexOf(x);
      if (i === -1) continue;
      stacks.splice(i, 1);
      const r = runtimes.findIndex((rt) => rt.name === "JDK");
      if (r !== -1) runtimes.splice(r, 1);
      for (const list of [installCmds, runCmds]) for (let k = list.length - 1; k >= 0; k--) if (/^\.?\/?(gradlew|gradle|mvnw|mvn)\b/.test(list[k])) list.splice(k, 1);
      for (let k = packageManagers.length - 1; k >= 0; k--) if (["Maven", "Gradle"].includes(packageManagers[k].name)) packageManagers.splice(k, 1);
    }
  }
  if (nativeBuild && (nativeLang || !stacks.some((x) => ["Node.js", "Rust", "Go", "Java", "Kotlin/JVM", ".NET", "Flutter", "Dart", "Swift"].includes(x)))) {
    stacks.push(`C/C++ (${nativeBuild})`);
    runtimes.push({ name: "C/C++ compiler", source: nativeBuild === "CMake" ? "CMakeLists.txt" : nativeBuild === "Meson" ? "meson.build" : "SConstruct" });
    runtimes.push({ name: nativeBuild, detail: firstMatch(files["CMakeLists.txt"], /cmake_minimum_required\s*\(\s*VERSION\s+([\d.]+)/i), source: "build files" });
    if (nativeBuild === "CMake") installCmds.push("cmake -S . -B build -DCMAKE_BUILD_TYPE=Release", "cmake --build build");
    if (nativeBuild === "Meson") installCmds.push("meson setup build", "meson compile -C build");
    if (nativeBuild === "SCons") installCmds.push("scons");
    hints.push("Native projects often need extra system libraries. If the build stops with a missing package, check the maintainers' build guide (see Start here).");
  }

  // ---------- Hardware ----------
  const readmeAll = `${description ?? ""}\n${Object.entries(files).find(([p]) => /^readme(\.\w+)?$/i.test(p))?.[1] ?? ""}`;
  if (/\bApple['’]s MLX\b|\bmlx-lm\b|^import mlx\b/m.test(readmeAll)) {
    hints.push("Built on Apple's MLX, which is made for Apple Silicon Macs. On Windows or Linux, check the README before installing.");
  }
  if (/\bCUDA\b/.test(readmeAll)) {
    hints.push("The README mentions NVIDIA CUDA. Check its hardware section: some features (or all of them) may need an NVIDIA GPU.");
  }

  // ---------- Containers & services ----------
  const composePath = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].find((p) => files[p]);
  if (composePath) services.push(...servicesFromCompose(files[composePath], composePath));
  if (files["Dockerfile"]) {
    const base = firstMatch(files["Dockerfile"], /^FROM\s+(?:--\S+\s+)*(\S+)/im);
    hints.push(`Dockerfile available${base ? ` (base image: ${base})` : ""}.`);
    if (stacks.length === 0) {
      stacks.push("Docker");
      runCmds.push(`docker build -t ${repo.repo.toLowerCase()} .`, `docker run --rm -it ${repo.repo.toLowerCase()}`);
    }
  }
  if (files[".devcontainer/devcontainer.json"] || files[".devcontainer.json"]) {
    hints.push("Dev Container config found — you can open it in VS Code Dev Containers or GitHub Codespaces for a zero-setup environment.");
  }
  if (mise || Object.keys(tv).length) {
    hints.push(`Tool versions pinned in ${mise ? "mise.toml" : ".tool-versions"} — \`mise install\` (or \`asdf install\`) installs them all.`);
  }

  // ---------- Env vars ----------
  let envVars: EnvVar[] = [];
  const envFiles = Object.keys(files).filter((p) => ENV_EXAMPLE.test(p));
  for (const p of envFiles) envVars.push(...parseEnv(files[p], p));
  envVars = dedupe(envVars, (e) => e.name);
  for (const e of envVars) {
    const v = e.example.toLowerCase();
    if (/^(database_url|db_url|postgres_url)$/i.test(e.name) && v.startsWith("postgres")) services.push({ name: "PostgreSQL", detail: e.name, source: e.source });
    if (/^(database_url|db_url)$/i.test(e.name) && v.startsWith("mysql")) services.push({ name: "MySQL", detail: e.name, source: e.source });
    if (v.startsWith("redis://") || v.startsWith("rediss://")) services.push({ name: "Redis", detail: e.name, source: e.source });
    if (v.startsWith("mongodb://") || v.startsWith("mongodb+srv://")) services.push({ name: "MongoDB", detail: e.name, source: e.source });
  }

  // ---------- Task runners ----------
  const makeTargets = [...(files["Makefile"] ?? "").matchAll(/^([A-Za-z0-9_.-]+):(?!=)/gm)].map((m) => m[1]);
  const setupTarget = makeTargets.find((t) => /^(setup|bootstrap|install|init|dev-setup)$/.test(t));
  if (setupTarget) hints.push(`Makefile has a \`make ${setupTarget}\` target — it may automate most of these steps.`);
  if (has("bin/setup") || has("scripts/setup.sh") || has("setup.sh")) {
    const s = ["bin/setup", "scripts/setup.sh", "setup.sh"].find((p) => has(p));
    hints.push(`Setup script found: \`${s}\`.`);
  }
  if (files["justfile"]) hints.push("justfile found — run `just --list` to see available tasks.");

  // ---------- README usage & tools ----------
  const readmeText = Object.entries(files).find(([p]) => /^readme(\.\w+)?$/i.test(p))?.[1];
  const readme = extractReadmeSection(readmeText);
  // Our clone step already covers cloning, so drop it from the README's commands.
  const readmeCmds = (readme?.commands ?? []).filter((c) => !/^git clone\b/.test(c) && !/^cd \S+$/.test(c));
  const runtimeNames = new Set(runtimes.map((r) => r.name));
  const tools = toolsFor(readme?.commands ?? []).filter(
    (t) => !(t.name === "Node.js" && runtimeNames.has("Node.js")) && !(t.name === "Python 3" && runtimeNames.has("Python")),
  );
  const shellScripts = allPaths.filter((p) => /\.sh$/.test(p) && !p.includes("node_modules"));
  const runsShellScripts = readmeCmds.some((c) => /\.sh\b/.test(c));
  if (!stacks.length && shellScripts.length) stacks.push("Shell scripts");
  if (has("AGENTS.md") || has("CLAUDE.md")) {
    hints.push(`Has ${has("AGENTS.md") ? "AGENTS.md" : "CLAUDE.md"} — instructions for coding agents. You can open Claude Code (or another agent) in the cloned folder and ask it to do the setup for you.`);
  }
  const useReadmeSteps = readmeCmds.length > 0 && !installCmds.length && !runCmds.length;
  const undo = extractReadmeSection(readmeText, UNDO_SECTIONS);
  const compatibility = extractReadmeSection(readmeText, COMPAT_SECTIONS, { requireCommands: false });
  // adb/fastboot means the project acts on a phone, tablet or TV that the user has to prepare.
  const needsDevice = tools.some((t) => t.name.startsWith("adb"));
  if (needsDevice) hints.unshift("You need the device itself (phone, tablet or TV) on the same network as your computer, with ADB debugging turned on.");

  // ---------- Steps (per OS) ----------
  const uniqServices = dedupe(services, (s) => s.name);
  const rootEnv = envFiles.find((p) => !p.includes("/"));
  const secrets = envVars.filter((e) => e.secret).map((e) => e.name);
  const usesMise = Boolean(mise || Object.keys(tv).length);
  const pinnedFiles = new Set([".nvmrc", ".python-version", ".ruby-version", "rust-toolchain"]);
  const pythonPm = packageManagers.find((p) => ["uv", "poetry", "pipenv", "pdm", "pip", "conda"].includes(p.name))?.name;
  const unixHeavy = stacks.some((s) => s === "Rails" || s === "Phoenix") || has("bin/setup") || has("setup.sh") || runsShellScripts;

  const submodules = has(".gitmodules") || allPaths.includes(".gitmodules");

  const buildSteps = (os: OS): Step[] => {
    const adapt = (cmds: string[]) => dedupe(cmds, (c) => c).map((c) => adaptCommand(c, os));
    const steps: Step[] = [];
    if (compatibility) {
      steps.push({
        title: "Check it supports your device / system",
        commands: [],
        note: `Compare yours with the README's “${compatibility.heading}” list above before installing anything.`,
      });
    }
    steps.push(
      {
        title: "Clone the repository",
        commands: [`git clone ${submodules ? "--recurse-submodules " : ""}https://github.com/${repo.owner}/${repo.repo}.git`, `cd ${repo.repo}`],
        note:
          (os === "windows" ? "Needs Git: winget install Git.Git" : os === "mac" ? "Needs Git: xcode-select --install" : "") +
          (submodules ? `${os === "linux" ? "" : ". "}The repo uses git submodules, so the clone fetches them too.` : "") || undefined,
      },
    );
    if (runtimes.length || tools.length) {
      const runtimeCmds = !runtimes.length
        ? []
        : usesMise
        ? miseInstall(os)
        : runtimes.flatMap((r) =>
            runtimeInstall(r.name, os, {
              version: r.detail?.match(/\d/) ? r.detail : undefined,
              pinnedFile: pinnedFiles.has(r.source),
              packageManager: r.name === "Python" ? pythonPm : undefined,
            }),
          );
      steps.push({
        title: tools.length && !runtimes.length ? "Install the required tools" : "Install the required runtimes",
        commands: [...runtimeCmds, ...tools.map((t) => t.install[os])],
        note: [...runtimes.map((r) => `${r.name}${r.detail ? ` ${r.detail}` : ""}`), ...tools.map((t) => t.name)].join(", "),
      });
    }
    if (rootEnv) {
      const target = has("artisan") || /\.env\.local/.test(rootEnv) ? ".env" : stacks.includes("Next.js") ? ".env.local" : ".env";
      steps.push({
        title: "Configure environment variables",
        commands: adapt([`cp ${rootEnv} ${target}`]),
        note: secrets.length ? `Fill in secrets: ${secrets.slice(0, 8).join(", ")}` : undefined,
      });
    }
    if (uniqServices.length) {
      steps.push({
        title: "Start backing services",
        commands: composePath ? [dockerInstall(os), `docker compose -f ${composePath} up -d`] : [],
        tips: composePath ? tipsFor(["docker compose"]) : undefined,
        note: `Needs: ${uniqServices.map((s) => s.name).join(", ")}${composePath ? "" : " (no compose file — install locally or run via Docker)"}`,
      });
    }
    if (installCmds.length) steps.push({ title: "Install dependencies", commands: adapt(installCmds) });
    if (dbCmds.length) steps.push({ title: "Set up the database / app", commands: adapt(dbCmds) });
    if (runCmds.length) {
      steps.push({ title: "Run it", commands: adapt(runCmds), note: runCmds.length > 1 ? "Run each command in its own terminal." : undefined });
    }
    if (testCmds.length) steps.push({ title: "Run the tests", commands: adapt(testCmds) });
    if (useReadmeSteps) {
      steps.push({
        title: `Follow the README: ${readme!.heading}`,
        commands: readmeCmds,
        tips: tipsFor(readmeCmds),
        note:
          os === "windows" && runsShellScripts
            ? "Run these in Git Bash (installed with Git) or WSL — not PowerShell. Do the README instructions above first."
            : "In the maintainers' order. Do the README instructions above first — they cover steps outside the terminal.",
      });
      if (undo?.commands.length) {
        steps.push({ title: `To undo it later: ${undo.heading}`, commands: undo.commands, note: "From the README." });
      }
    }
    return steps;
  };
  const steps = Object.fromEntries(OS_LIST.map((os) => [os, buildSteps(os)])) as Record<OS, Step[]>;
  const osNotes: Record<OS, string[]> = { mac: [], windows: [], linux: [] };
  if (runsShellScripts) osNotes.windows.push("The steps run shell scripts (.sh). Use Git Bash (`winget install Git.Git`) or WSL2 (`wsl --install`).");
  else if (unixHeavy) osNotes.windows.push("This project relies on Unix tooling. On Windows, WSL2 (`wsl --install`) plus the Linux steps is the smoothest path.");
  if (has("Makefile") && !unixHeavy) osNotes.windows.push("Makefile targets need `make` (e.g. `winget install GnuWin32.Make`) or WSL.");

  // ---------- Difficulty ----------
  const score =
    runtimes.length +
    uniqServices.length * 2 +
    Math.ceil(envVars.filter((e) => e.secret).length / 3) +
    (hints.some((h) => h.startsWith("Monorepo")) ? 1 : 0) +
    tools.length +
    (needsDevice ? 2 : 0) +
    (runCmds.length || testCmds.length || useReadmeSteps ? 0 : 2);
  const label = score <= 2 ? "Easy" : score <= 6 ? "Moderate" : "Involved";

  const otherManifests = allPaths.filter((p) => p.includes("/") && MANIFEST.test(p) && !p.includes("node_modules")).slice(0, 15);

  return {
    stacks: dedupe(stacks, (s) => s),
    runtimes,
    packageManagers,
    services: uniqServices,
    envVars,
    scripts,
    hints,
    steps,
    osNotes,
    readme,
    compatibility,
    readmeFirst: useReadmeSteps,
    tools: tools.map((t) => t.name),
    needsDevice,
    difficulty: { label, score },
    otherManifests,
  };
}
