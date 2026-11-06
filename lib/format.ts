// Star and view counts, the same everywhere: 999, 1.3k, 12k, 1.2M.
export function compactCount(n: number): string {
  // From 999,500 up, "1000k" would show; that is 1M.
  if (n >= 999_500) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(n);
}
