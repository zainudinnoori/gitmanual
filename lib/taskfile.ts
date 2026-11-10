const TASK_ENTRY = /^  ([A-Za-z0-9_][A-Za-z0-9_.:*?-]*):(?:[ \t]+(.*))?$/;
const MAP_ENTRY = /^(?:[A-Za-z_][A-Za-z0-9_.-]*):(?:[ \t]+(.*))?$/;
const TOP_LEVEL_TASKS = /^tasks:[ \t]*(?:#.*)?$/;

function ambiguousValue(value: string | undefined): boolean {
  const trimmed = value?.trim();
  return Boolean(trimmed && ["{", "[", "&", "*", "!"].some((prefix) => trimmed.startsWith(prefix)));
}

function blockScalar(value: string | undefined): boolean {
  return Boolean(value && /^[|>][+-]?\d?(?:[ \t]+#.*)?$/.test(value.trim()));
}

export function taskNames(text: string | undefined): string[] {
  if (!text) return [];

  const names: string[] = [];
  const seen = new Set<string>();
  let inTasks = false;
  let foundTasks = false;
  let blockIndent: number | null = null;

  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    if (blockIndent !== null && indent > blockIndent) continue;
    blockIndent = null;
    if (/^\s*#/.test(line)) continue;

    if (!/^\s/.test(line)) {
      if (/^(---|\.\.\.)\s*$/.test(line)) return [];
      if (inTasks) inTasks = false;
      if (/^tasks\b/.test(line)) {
        if (!TOP_LEVEL_TASKS.test(line) || foundTasks) return [];
        foundTasks = true;
        inTasks = true;
      }
      continue;
    }

    if (!inTasks) continue;
    if (line.startsWith("\t")) return [];
    if (indent < 2 || indent % 2 !== 0) return [];
    let value: string | undefined;
    if (indent === 2) {
      const entry = TASK_ENTRY.exec(line);
      if (!entry || seen.has(entry[1])) return [];
      seen.add(entry[1]);
      if (!entry[1].startsWith("_")) names.push(entry[1]);
      value = entry[2];
    } else {
      const content = line.slice(indent);
      const listItem = content === "-" || content.startsWith("- ");
      const nestedEntry = MAP_ENTRY.exec(listItem ? content.slice(1).trimStart() : content);
      if (!nestedEntry && !listItem) return [];
      value = nestedEntry?.[1];
    }

    if (indent === 2 && ambiguousValue(value)) return [];
    if (blockScalar(value)) blockIndent = indent;
  }

  return foundTasks ? names : [];
}
