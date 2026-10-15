import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request(new URL(pathname, "http://localhost/"), {
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

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  return response.text();
}

test("renders development preview metadata", async () => {
  assert.match(await render("/"), developmentPreviewMeta);
});

test("renders the current license inventory summary", async () => {
  const html = await render("/licences");
  assert.match(html, /<dt>Corpus actifs<\/dt><dd>31<\/dd>/);
  assert.match(html, /en-mots/);
  assert.match(html, /<dt>Mots suspendus<\/dt><dd>9 974<\/dd>/);
});

test("renders route metadata and explicit initial place state", async () => {
  const analysis = await render("/analyse");
  assert.match(analysis, /<title>Analyse des mots · Atelier des mots<\/title>/);
  assert.match(analysis, /name="description" content="Comparez les scores de mots/);

  const places = await render("/lieux");
  assert.match(places, /<title>Générateur de noms de lieux · Atelier des mots<\/title>/);
  assert.match(places, /Générez des noms de lieux français ou des noms russes romanisés/);
  assert.match(places, /lancez une génération pour afficher les propositions/i);
  assert.doesNotMatch(places, /Valebrune|Novoradsk/);
});
