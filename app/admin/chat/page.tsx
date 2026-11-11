import type { Metadata } from "next";
import { DocPage } from "../../doc";
import { ChatAdmin } from "./stats";

export const metadata: Metadata = { title: "Chat (admin)", robots: { index: false, follow: false } };

// Chat use, spend and who reached the daily limit. Only for ADMIN_GITHUB_LOGINS (checked by the API).
export default function AdminChat() {
  return (
    <DocPage eyebrow="Admin" title="Chat">
      <ChatAdmin />
    </DocPage>
  );
}
