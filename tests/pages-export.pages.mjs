import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const basePath = "/8shang_yuwen_jichu";
const outputRoot = new URL("../out/", import.meta.url);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(target)));
    } else {
      files.push(target);
    }
  }

  return files;
}

test("GitHub Pages 导出文件使用仓库子路径", async () => {
  const html = await readFile(new URL("index.html", outputRoot), "utf8");

  assert.match(html, new RegExp(`${basePath}/_next/`));
  assert.match(html, new RegExp(`src="${basePath}/illustrations/chengyu\\.jpg"`));
  assert.match(html, new RegExp(`href="${basePath}/question-bank-template\\.json"`));
  assert.match(
    html,
    /https:\/\/renrenlu\.github\.io\/8shang_yuwen_jichu\/og-simple\.jpg/,
  );
  assert.doesNotMatch(html, /(?:href|src)="\/(?:_next|illustrations)\//);

  await Promise.all([
    access(new URL("question-bank-template.json", outputRoot)),
    access(new URL("og-simple.jpg", outputRoot)),
    access(new URL("illustrations/chengyu.jpg", outputRoot)),
    access(new URL("question-crops/chengyu/chengyu-1.webp", outputRoot)),
    access(new URL("source/chengyu/page-01.jpg", outputRoot)),
  ]);

  const staticFiles = await collectFiles(new URL("_next/static/", outputRoot));
  const javascriptFiles = staticFiles.filter((file) => file.pathname.endsWith(".js"));
  const javascript = (
    await Promise.all(javascriptFiles.map((file) => readFile(file, "utf8")))
  ).join("\n");

  assert.match(javascript, /\/8shang_yuwen_jichu/);
  assert.match(javascript, /\/question-crops\//);
  assert.match(javascript, /\/source\//);
});
