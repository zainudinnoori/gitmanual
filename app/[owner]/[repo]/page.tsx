import { RepoManual, generateMetadata, type Props } from "./manual";

// gitmanual.com/owner/repo mirrors github.com/owner/repo, so swapping "hub" for "manual" in a URL just works.
export { generateMetadata };
export default function RepoPage(props: Props) {
  return <RepoManual {...props} />;
}
