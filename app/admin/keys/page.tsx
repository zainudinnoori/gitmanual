import type { Metadata } from "next";
import { DocPage } from "../../doc";
import { KeysAdmin } from "./list";

export const metadata: Metadata = { title: "API keys (admin)", robots: { index: false, follow: false } };

// Every API key, its owner and use, with a switch to turn one off. Only for ADMIN_GITHUB_LOGINS (checked by the API).
export default function AdminKeys() {
  return (
    <DocPage eyebrow="Admin" title="API keys">
      <KeysAdmin />
    </DocPage>
  );
}
