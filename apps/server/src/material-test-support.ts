// Materials of each format for the API tests of Inbox processing (#47), made in the test: a PDF, a
// DOCX and a web page on a local HTTP server, so no test needs the network.
import { createServer } from "node:http";

import { strToU8, zipSync } from "fflate";
import { onTestFinished } from "vitest";

/** A one-page PDF with the lines in Helvetica; the server's PDF reader finds them as text. */
export function pdfWith(lines: readonly string[]): Buffer {
  const text = lines
    .map((line, index) => `${index === 0 ? "" : "0 -16 Td "}(${line}) Tj`)
    .join(" ");
  const content = `BT /F1 12 Tf 72 720 Td ${text} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** A DOCX with one paragraph per line, as Word stores it in `word/document.xml`. */
export function docxWith(paragraphs: readonly string[]): Buffer {
  const body = paragraphs
    .map((paragraph) => `<w:p><w:r><w:t>${paragraph.replaceAll("&", "&amp;")}</w:t></w:r></w:p>`)
    .join("");
  const document = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  return Buffer.from(
    // oxlint-disable-next-line node/no-sync -- a test fixture of a few hundred bytes
    zipSync({
      "[Content_Types].xml": strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      ),
      "word/document.xml": strToU8(document),
    }),
  );
}

/** Serves the HTML at `/page` on a free loopback port; the test ends it. */
export async function localPage(html: string): Promise<string> {
  const page = createServer((request, response) => {
    if (request.url === "/page") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => {
    page.listen(0, "127.0.0.1", resolve);
  });
  onTestFinished(async () => {
    await new Promise((resolve) => {
      page.close(resolve);
    });
  });
  const address = page.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("The page does not listen");
  }
  return `http://127.0.0.1:${address.port}/page`;
}

/** A Question of a material with every field the processing agent gives. */
export function materialQuestion(
  { topicId, sourceId }: { topicId: string; sourceId: string },
  text: string,
) {
  return {
    topicId,
    text,
    level: "senior",
    sectionKind: "topics",
    sourceId,
    part: 1,
    referenceAnswer: {
      points: ["Лёгкий поток рантайма", "Стек растёт по мере нужды", "Планировщик M:N"],
      sample: "Горутина — функция, которую рантайм Go выполняет в лёгком потоке.",
    },
  };
}
