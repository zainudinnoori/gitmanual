// Picks the repos for the accuracy run (.github/workflows/accuracy.yml): a seeded random sample of the shelf,
// limited to repos whose manual says they run on Linux (the run uses Linux machines), so the result is fair.
//
//   npm run -s accuracy:sample -- 100 > scripts/accuracy-sample.json
import { createClient } from "@libsql/client";
import { fitCheck } from "../lib/fit";
import type { RepoData } from "../lib/pipeline";

const count = Number(process.argv[2] ?? 100);
const db = createClient({ url: `file:${process.env.GITMANUAL_DB ?? "data/gitmanual.db"}` });

// Same seed, same sample: the run can be repeated after a fix and compared.
let seed = 20261106;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

db.execute("SELECT full_name, data FROM repos").then(({ rows }) => {
  const eligible = rows
    .map((r) => ({ repo: String(r.full_name), data: JSON.parse(String(r.data)) as RepoData }))
    .filter(({ data }) => data.analysis?.steps && fitCheck(data.analysis, data.install, "linux", "x64", data.meta.archived).status !== "no")
    .map(({ repo }) => repo)
    .sort();
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  const repos = eligible.slice(0, count).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  process.stdout.write(`${JSON.stringify({ _about: `${repos.length} random shelf repos whose manual says they run on Linux (seed 20261106), for the accuracy run.`, repos }, null, 2)}\n`);
});
