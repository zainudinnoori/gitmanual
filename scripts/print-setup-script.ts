// Prints a repo's setup script, built by this checkout's code (not the live site), so CI can test a change
// before it's deployed.
//
//   npm run -s setup-script -- owner/repo linux > setup.sh     (mac | linux | windows; needs GITHUB_TOKEN for many repos)
import { loadRepo } from "../lib/pipeline";
import { OS_LIST, type OS } from "../lib/os";
import { buildScript } from "../lib/script";

const [repo, os] = process.argv.slice(2) as [string, OS];
const [owner, name] = repo?.split("/") ?? [];
if (!owner || !name || !OS_LIST.includes(os)) {
  console.error("Usage: setup-script owner/repo mac|linux|windows");
  process.exit(2);
}
loadRepo({ owner, repo: name }).then(({ data: { meta, analysis } }) => {
  const text = buildScript(analysis.steps[os], os, meta.fullName, process.env.NEXT_PUBLIC_SITE_URL || "https://gitmanual.com").text;
  // Same as the download route: Windows PowerShell 5.1 needs the byte-order mark to read the file as UTF-8.
  process.stdout.write(os === "windows" ? `\uFEFF${text}` : text);
});
