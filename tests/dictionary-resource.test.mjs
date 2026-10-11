import assert from "node:assert/strict";
import test from "node:test";
import { createJsonResource } from "../app/json-resource.ts";
import { loadInitialDictionaries } from "../app/dictionaries.ts";

const url = new URL("https://example.test/corpus.json");
const decode = (value) => {
  if (!Array.isArray(value)) throw new Error("invalid corpus");
  return value;
};

test("failed JSON fetches, HTTP errors and invalid payloads retry through the transport", async () => {
  for (const failure of [
    () => { throw new Error("network failed"); },
    () => new Response("failed", { status: 503 }),
    () => new Response("{"),
    () => Response.json({ invalid: true }),
  ]) {
    let attempts = 0;
    const read = createJsonResource(decode, async () => {
      attempts++;
      return attempts === 1 ? failure() : Response.json(["recovered"]);
    });
    await assert.rejects(read(url));
    assert.deepEqual(await read(url), ["recovered"]);
    assert.equal(attempts, 2);
    assert.deepEqual(await read(url), ["recovered"]);
    assert.equal(attempts, 2);
  }
});

test("concurrent callers share one fetch and one failed attempt before a retry", async () => {
  let reject;
  let attempts = 0;
  const read = createJsonResource(decode, async () => {
    attempts++;
    if (attempts === 1) return new Promise((_resolve, fail) => { reject = fail; });
    return Response.json(["ready"]);
  });
  const first = read(url);
  const second = read(url);
  assert.equal(first, second);
  await Promise.resolve();
  reject(new Error("offline"));
  await Promise.all([assert.rejects(first), assert.rejects(second)]);
  assert.deepEqual(await read(url), ["ready"]);
  assert.equal(attempts, 2);
});

test("only requested built-in chunks are fetched and custom IDs need no transport", async () => {
  const requested = [];
  const load = async (url) => {
    requested.push(url.pathname);
    return [{ id: "fr-prenoms", name: "French", words: ["alice"] }];
  };
  assert.deepEqual(await loadInitialDictionaries(["personal"], load), []);
  assert.equal(requested.length, 0);
  assert.deepEqual(await loadInitialDictionaries(["fr-prenoms"], load), [
    { id: "fr-prenoms", name: "French", words: ["alice"] },
  ]);
  assert.equal(requested.length, 1);
  assert.match(requested[0], /dictionaries-primary\.json$/u);
});
