/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access -- linkedom and Readability type their DOM with TypeScript's DOM library, which server code does not load; this file keeps those untyped values inside it. */
// The main text of a web page: Readability finds the article on linkedom's DOM.
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

/** The HTML of the page's main article, or of its whole body when Readability finds none. */
export function mainHtml(html: string): string {
  const { document } = parseHTML(html);
  const body: string = document.body?.innerHTML ?? html;
  const article = new Readability(document).parse();
  const content: string | null | undefined = article?.content;
  return content ?? body;
}
