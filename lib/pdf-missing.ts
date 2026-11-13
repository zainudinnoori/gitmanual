import type { ManualDoc } from "./document";

// Stand-in for the PDF design, which is private (the gitmanual-pdf package, not part of this repo). next.config.mjs
// points "gitmanual-pdf" here when the package isn't installed, so this copy builds and runs without it: PDF
// downloads say they aren't available, and everything else, Markdown included, works as usual.
export const available = false;

export async function manualPdf(_doc: ManualDoc): Promise<Buffer> {
  throw new Error("The PDF design (gitmanual-pdf) isn't installed in this copy of gitmanual.");
}
