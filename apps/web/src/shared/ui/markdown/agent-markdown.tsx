import { Markdown } from "markdown-to-jsx/react";
import type { MarkdownToJSX } from "markdown-to-jsx/react";

const linkProps = { target: "_blank", rel: "noopener noreferrer" } as const;

/**
 * An image of the agent's text as a link to it: the page never loads a remote address by itself,
 * so an image cannot report that the Candidate read the reply.
 */
function ImageLink({ alt = "", src }: { alt?: string; src?: string }) {
  const name = `Изображение: ${alt === "" ? (src ?? "") : alt}`;
  return src === undefined ? (
    <span>{name}</span>
  ) : (
    <a href={src} {...linkProps}>
      {name}
    </a>
  );
}

/**
 * Raw HTML in the agent's text stays text, so the agent's reply never adds elements or scripts to
 * the page. Links open in a new tab without access to this page; the library drops unsafe links,
 * such as `javascript:`. Images become links.
 */
const options: MarkdownToJSX.Options = {
  disableParsingRawHTML: true,
  overrides: {
    // oxlint-disable-next-line eslint/id-length -- the key is the HTML tag of a link
    a: { props: linkProps },
    img: { component: ImageLink },
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
