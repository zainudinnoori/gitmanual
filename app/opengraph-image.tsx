import { ogImage, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "gitmanual: setup manuals for open source";

export default function Image() {
  return ogImage({
    eyebrow: "Setup manuals",
    title: "Open source. Some assembly required.",
    text: "Paste any GitHub link: will it work on your device, what you need, and the steps for macOS, Windows or Linux.",
  });
}
