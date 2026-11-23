import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "@typescript-eslint/typescript-estree";
import ts from "typescript";

const supplied = process.argv.slice(2);
const files = supplied.length
  ? supplied
  : execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
      encoding: "utf8",
    })
      .split("\0")
      .filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !f.startsWith(".agents/"));
for (const file of files) {
  const ast = parse(readFileSync(file, "utf8"), {
    jsx: file.endsWith("x"),
    comment: true,
  });
  if (ast.comments?.length) {
    console.error(file, "no-comments");
    process.exitCode = 1;
  }
}
const web = files.filter((f) => f.startsWith("apps/web/"));
const program = ts.createProgram(web, {
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
  allowJs: true,
});
const checker = program.getTypeChecker();
for (const file of web) {
  const source = program.getSourceFile(file);
  function visit(node: ts.Node) {
    const symbol = checker.getSymbolAtLocation(node);
    const target =
      symbol &&
      (symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol);
    if (
      target &&
      ["useEffect", "useLayoutEffect"].includes(target.name) &&
      target.declarations?.some((d) =>
        d.getSourceFile().fileName.includes("@types/react/"),
      )
    ) {
      console.error(file, "no-direct-effect");
      process.exitCode = 1;
    }
    ts.forEachChild(node, visit);
  }
  if (source) visit(source);
}
