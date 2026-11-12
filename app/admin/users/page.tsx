import type { Metadata } from "next";
import { DocPage } from "../../doc";
import { UsersAdmin } from "./list";

export const metadata: Metadata = { title: "Users (admin)", robots: { index: false, follow: false } };

// Everyone who signed in with GitHub, and their chat use. Only for ADMIN_GITHUB_LOGINS (checked by the API).
export default function AdminUsers() {
  return (
    <DocPage eyebrow="Admin" title="Users">
      <UsersAdmin />
    </DocPage>
  );
}
