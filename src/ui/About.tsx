// The "About Maths Board" sheet (burger menu -> About & credits): open-source
// acknowledgements, the data/privacy policy, and the licence. The prose is
// authored as Markdown in ABOUT.md at the repo root — the single source of
// truth, also readable on GitHub — and imported verbatim via Vite's `?raw`, so
// this page and the repo doc can never drift apart. Rendered by the tiny
// in-house Markdown component (no runtime dependency). Renders only the modal
// .card body per the dialog contract; the Modal shell owns .card and its scroll.

import aboutMarkdown from "../../ABOUT.md?raw";
import { Markdown } from "@/ui/Markdown";

export function About(): JSX.Element {
  return (
    <div className="about">
      <Markdown source={aboutMarkdown} />
    </div>
  );
}
