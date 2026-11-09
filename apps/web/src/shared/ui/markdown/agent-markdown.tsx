import { Markdown } from "markdown-to-jsx/react";
import type { MarkdownToJSX } from "markdown-to-jsx/react";

/**
 * Raw HTML in the agent's text stays text, so the agent's reply never adds elements or scripts to
 * the page. Links open in a new tab without access to this page; the library drops unsafe links,
 * such as `javascript:`.
 */
const options: MarkdownToJSX.Options = {
  disableParsingRawHTML: true,
  overrides: {
    // oxlint-disable-next-line eslint/id-length -- the key is the HTML tag of a link
    a: { props: { target: "_blank", rel: "noopener noreferrer" } },
  },
};

/** The agent's Markdown as formatted text: emphasis, lists, code, tables and links. */
export function AgentMarkdown({ text }: { text: string }) {
  return (
    <Markdown className="agent-markdown" options={options}>
      {text}
    </Markdown>
  );
}
