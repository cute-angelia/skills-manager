import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

test("GFM autolinks do not require WebKit regex lookbehind support", async () => {
  const remarkRequire = createRequire(import.meta.resolve("remark-gfm"));
  const gfmRequire = createRequire(remarkRequire.resolve("mdast-util-gfm"));
  const entry = pathToFileURL(gfmRequire.resolve("mdast-util-gfm-autolink-literal"));
  const source = await readFile(new URL("lib/index.js", entry), "utf8");
  assert.doesNotMatch(source, /\(\?<[=!]/, "Regex lookbehind crashes older macOS WebViews");
});

test("skill Markdown retains GFM tables, tasks, strikethrough, and autolinks", () => {
  const content = [
    "# Example skill",
    "",
    "| Name | Value |",
    "| --- | --- |",
    "| Example | Works |",
    "",
    "- [x] Task",
    "",
    "~~Removed~~",
    "",
    "Contact hello@example.com or https://example.com",
  ].join("\n");
  const html = renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, content),
  );
  assert.match(html, /<h1>Example skill<\/h1>/);
  assert.match(html, /<table>/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /<del>Removed<\/del>/);
  assert.match(html, /href="mailto:hello@example.com"/);
  assert.match(html, /href="https:\/\/example.com"/);
});
