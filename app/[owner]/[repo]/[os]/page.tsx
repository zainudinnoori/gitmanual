import { RepoManual, generateMetadata, type Props } from "../manual";

// The same manual for one system (/owner/repo/macos, /windows, /linux), with its own title for search.
// Any other value shows the not-found page (noindex).
export { generateMetadata };
export default function RepoOsPage(props: Props) {
  return <RepoManual {...props} />;
}
