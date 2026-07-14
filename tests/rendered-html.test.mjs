import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Chinese practice homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>语文必背 · 互动练习册<\/title>/);
  assert.match(html, /每天练一点/);
  assert.match(html, /开始 30 题综合练习/);
  assert.match(html, /选择今天要攻克的内容/);
  assert.match(html, /古诗文默写/);
  assert.match(html, /字音、字形 B/);
  assert.match(html, /og-simple\.jpg/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Codex is working/i);
});

test("keeps the finished site free of starter preview assets", async () => {
  const [page, layout, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /className="section-grid"/);
  assert.match(page, /className="hero-stat-card"/);
  assert.match(page, /cycle: "yuwen-cycle-v2"/);
  assert.doesNotMatch(page, /hero-modern\.jpg|SkeletonPreview/);
  assert.match(layout, /og-simple\.jpg/);
  assert.match(css, /--primary:\s*#3f6559/);
  assert.doesNotMatch(css, /radial-gradient|\.hero::after|\.hero-visual/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
