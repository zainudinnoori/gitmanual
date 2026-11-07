import type { Metadata } from "next";
import { githubApp } from "@/lib/session";
import { PrivateHome } from "./home";

export const metadata: Metadata = {
  title: "Private repos",
  description: "Setup manuals for your private GitHub repos: read-only access to the repos you pick, and nothing is saved.",
  alternates: { canonical: "/private" },
};

export default function PrivatePage() {
  return <PrivateHome appAvailable={Boolean(githubApp())} />;
}
