import assert from "node:assert/strict";
import test from "node:test";
import { createDictionaryPersistence } from "../app/dictionary-persistence.ts";
import { CUSTOM_DICTIONARIES_KEY, LEGACY_DICTIONARIES_KEY } from "../app/dictionaries.ts";
import { createCollectionPersistence, readStoredFavorites } from "../app/persistence.ts";
import { readStoredPresets } from "../app/stored-presets.ts";
import { recoverRetiredWords, readDictionaryFile } from "./dictionary-test-resources.mjs";
import { createJsonResource } from "../app/json-resource.ts";
import { createRetiredDictionaryRecovery, readRetiredBaselines } from "../app/retired-dictionaries.ts";
import { serializeDictionaryExport, parseDictionaryImport } from "../app/dictionaries.ts";

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    values,
    writes: [],
    failWrites: false,
    failReads: false,
    getItem(key) {
      if (this.failReads) throw new Error("storage denied");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (this.failWrites) throw new Error("quota exceeded");
      this.writes.push(key);
      values.set(key, value);
    },
  };
}
function word(index) {
  let value = index;
  let result = "mot";
  do {
    result += String.fromCharCode(97 + value % 26);
    value = Math.floor(value / 26);
  } while (value);
  return result;
}
const custom = { id: "mine", name: "Mes mots", words: ["soleil"] };
const initial = [{ id: "fr-mots", name: "Français", words: ["soleil"] }];

test("retired English migration recovers personal additions without retaining baseline words", async () => {
  const personal = ["brumalexandre", "a".repeat(61)];
  const legacy = JSON.stringify([
    { id: "en-mots", name: "Anglais", words: ["EXAMPLE", "dictionary", ...personal, "Brumalexandre"] },
    custom,
    { id: "dictionnaire-ajouts-migres-en-mots", name: "Ajouts · Anglais · mots courants", words: [] },
  ]);
  const storage = memoryStorage([[LEGACY_DICTIONARIES_KEY, legacy]]);
  const snapshot = await createDictionaryPersistence(storage, async () => [], recoverRetiredWords).load();
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.loadError, "");
  const recovered = snapshot.dictionaries.find(({ id }) => id === "dictionnaire-ajouts-migres-en-mots-2");
  assert.deepEqual(recovered.words, personal);
  assert.equal(recovered.name, "Ajouts · Anglais · mots courants (2)");
  assert.equal(snapshot.dictionaries.some(({ id }) => id === "en-mots"), false);
  assert.equal(storage.values.get(LEGACY_DICTIONARIES_KEY), legacy);
  assert.deepEqual(parseDictionaryImport(serializeDictionaryExport(snapshot.dictionaries), []), snapshot.dictionaries);
  assert.deepEqual((await createDictionaryPersistence(storage).load()).dictionaries, snapshot.dictionaries);
});

test("a failed retired baseline fetch cannot commit v2 and actually refetches on retry", async () => {
  const legacy = JSON.stringify([{ id: "en-mots", name: "Anglais", words: ["example", "brumalexandre"] }]);
  const storage = memoryStorage([[LEGACY_DICTIONARIES_KEY, legacy]]);
  let attempts = 0;
  const resource = createJsonResource(readRetiredBaselines, async (url) => {
    attempts++;
    if (attempts === 1) return new Response("offline", { status: 503 });
    return Response.json(await readDictionaryFile(url));
  });
  const controller = createDictionaryPersistence(storage, async () => [], createRetiredDictionaryRecovery(resource));
  const failed = await controller.load();
  assert.equal(failed.ready, false);
  assert.ok(failed.loadError);
  assert.equal(storage.writes.length, 0);
  assert.equal(storage.values.has(CUSTOM_DICTIONARIES_KEY), false);
  const recovered = await controller.load();
  assert.equal(recovered.ready, true);
  assert.equal(attempts, 2);
  assert.deepEqual(recovered.dictionaries[0].words, ["brumalexandre"]);
  assert.equal(storage.values.get(LEGACY_DICTIONARIES_KEY), legacy);
});

test("retired recovery cannot overwrite newer durable data or commit an abandoned load", async () => {
  for (const cancel of [false, true]) {
    const legacy = JSON.stringify([{ id: "en-mots", name: "Anglais", words: ["personal"] }]);
    const storage = memoryStorage([[LEGACY_DICTIONARIES_KEY, legacy]]);
    let resolve;
    let active = true;
    const recovery = new Promise((done) => { resolve = done; });
    const controller = createDictionaryPersistence(storage, async () => [], () => recovery);
    const pending = controller.load({ isCurrent: () => active });
    await Promise.resolve();
    if (cancel) active = false;
    else storage.values.set(CUSTOM_DICTIONARIES_KEY, JSON.stringify([custom]));
    resolve(["personal"]);
    const snapshot = await pending;
    assert.equal(storage.writes.length, 0);
    assert.equal(storage.values.get(LEGACY_DICTIONARIES_KEY), legacy);
    if (cancel) {
      assert.equal(snapshot.ready, false);
      assert.equal(storage.values.has(CUSTOM_DICTIONARIES_KEY), false);
    } else {
      assert.equal(snapshot.ready, true);
      assert.deepEqual(snapshot.dictionaries, [custom]);
    }
  }
});

test("historical v2 retains 270000 words, long fields and more than 100 lists without load writes", async () => {
  const dictionaries = Array.from({ length: 3 }, (_, index) => ({
    id: `large-${index}`, name: `Grande liste ${index}`,
    words: Array.from({ length: 90_000 }, (_, offset) => word(index * 90_000 + offset)),
  }));
  dictionaries.push({ id: "i".repeat(121), name: "n".repeat(101), words: ["a".repeat(61)] });
  for (let i = 0; i < 101; i++) dictionaries.push({ id: `empty-${i}`, name: `Vide ${i}`, words: [] });
  const original = JSON.stringify(dictionaries);
  const storage = memoryStorage([[CUSTOM_DICTIONARIES_KEY, original]]);
  const controller = createDictionaryPersistence(storage);
  const snapshot = await controller.load();
  assert.equal(snapshot.ready, true);
  assert.deepEqual(snapshot.dictionaries, dictionaries);
  assert.equal(storage.writes.length, 0);
  controller.save(snapshot.dictionaries);
  assert.equal(storage.writes.length, 0);
  const changed = [...snapshot.dictionaries, { id: "another", name: "Autre", words: [] }];
  controller.save(changed);
  assert.equal(storage.writes.length, 1);
  assert.deepEqual((await createDictionaryPersistence(storage).load()).dictionaries, changed);
});

test("legacy additions above 100000 and 60 letters survive migration and reload, retaining v1 backup", async () => {
  const additions = Array.from({ length: 100_001 }, (_, index) => word(index));
  additions.push("a".repeat(61));
  const legacy = JSON.stringify([{ ...initial[0], words: ["soleil", ...additions] }]);
  const storage = memoryStorage([[LEGACY_DICTIONARIES_KEY, legacy]]);
  const snapshot = await createDictionaryPersistence(storage, async () => initial).load();
  assert.equal(snapshot.ready, true);
  assert.deepEqual(snapshot.dictionaries[0].words, additions);
  assert.equal(storage.values.get(LEGACY_DICTIONARIES_KEY), legacy);
  assert.deepEqual((await createDictionaryPersistence(storage).load()).dictionaries, snapshot.dictionaries);
});

test("a failed legacy download cannot write an empty v2 and can be retried successfully", async () => {
  const legacy = JSON.stringify([{ ...initial[0], words: ["soleil", "lune"] }]);
  const storage = memoryStorage([[LEGACY_DICTIONARIES_KEY, legacy]]);
  let failed = true;
  const controller = createDictionaryPersistence(storage, async () => {
    if (failed) throw new Error("network failed");
    return initial;
  });
  const failure = await controller.load();
  assert.equal(failure.ready, false);
  assert.ok(failure.loadError);
  assert.equal(controller.save([]).loadError, failure.loadError);
  assert.equal(storage.values.has(CUSTOM_DICTIONARIES_KEY), false);
  assert.equal(storage.writes.length, 0);
  failed = false;
  const success = await controller.load();
  assert.equal(success.ready, true);
  assert.equal(success.loadError, "");
  assert.deepEqual(success.dictionaries[0].words, ["lune"]);
  assert.equal(storage.values.get(LEGACY_DICTIONARIES_KEY), legacy);
});

test("legacy custom-only migration does not depend on a corpus download", async () => {
  const storage = memoryStorage([[LEGACY_DICTIONARIES_KEY, JSON.stringify([custom])]]);
  const snapshot = await createDictionaryPersistence(storage, async () => {
    throw new Error("No corpus should be requested");
  }).load();
  assert.equal(snapshot.ready, true);
  assert.deepEqual(snapshot.dictionaries, [custom]);
});

test("a pending migration adopts newer durable edits instead of overwriting another tab", async () => {
  const storage = memoryStorage([[LEGACY_DICTIONARIES_KEY, JSON.stringify(initial)]]);
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const slow = createDictionaryPersistence(storage, () => pending);
  const slowLoad = slow.load();
  const fast = createDictionaryPersistence(storage, async () => initial);
  const migrated = await fast.load();
  const edited = [...migrated.dictionaries, custom];
  fast.save(edited);
  const writes = storage.writes.length;
  resolve(initial);
  const result = await slowLoad;
  assert.equal(result.ready, true);
  assert.deepEqual(result.dictionaries, edited);
  assert.deepEqual(JSON.parse(storage.values.get(CUSTOM_DICTIONARIES_KEY)), edited);
  assert.equal(storage.writes.length, writes);
  slow.save(result.dictionaries);
  assert.equal(storage.writes.length, writes);
});

test("an abandoned hook load cannot commit migration after its corpus resolves", async () => {
  const storage = memoryStorage([[LEGACY_DICTIONARIES_KEY, JSON.stringify(initial)]]);
  let resolve;
  let active = true;
  const pending = new Promise((done) => { resolve = done; });
  const controller = createDictionaryPersistence(storage, () => pending);
  const loading = controller.load({ isCurrent: () => active });
  active = false;
  resolve(initial);
  assert.equal((await loading).ready, false);
  assert.equal(storage.values.has(CUSTOM_DICTIONARIES_KEY), false);
  assert.equal(storage.writes.length, 0);
});

test("a changed legacy backup is preserved until migration can retry from its latest value", async () => {
  const storage = memoryStorage([[LEGACY_DICTIONARIES_KEY, JSON.stringify(initial)]]);
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const controller = createDictionaryPersistence(storage, () => pending);
  const loading = controller.load();
  const newer = JSON.stringify([...initial, custom]);
  storage.values.set(LEGACY_DICTIONARIES_KEY, newer);
  resolve(initial);
  const result = await loading;
  assert.equal(result.ready, false);
  assert.ok(result.loadError);
  assert.equal(storage.values.has(CUSTOM_DICTIONARIES_KEY), false);
  assert.equal(storage.values.get(LEGACY_DICTIONARIES_KEY), newer);
  assert.equal(storage.writes.length, 0);
});

test("missing migration corpus is treated as a retryable load failure", async () => {
  const storage = memoryStorage([[LEGACY_DICTIONARIES_KEY, JSON.stringify(initial)]]);
  const result = await createDictionaryPersistence(storage, async () => []).load();
  assert.equal(result.ready, false);
  assert.ok(result.loadError);
  assert.equal(storage.writes.length, 0);
});

test("quota failure retains legacy backup and migrated data, and permits retry", async () => {
  const legacy = JSON.stringify([custom]);
  const storage = memoryStorage([[LEGACY_DICTIONARIES_KEY, legacy]]);
  storage.failWrites = true;
  const controller = createDictionaryPersistence(storage, async () => initial);
  const failure = await controller.load();
  assert.equal(failure.ready, false);
  assert.ok(failure.writeError);
  assert.deepEqual(failure.dictionaries, [custom]);
  assert.equal(storage.values.get(LEGACY_DICTIONARIES_KEY), legacy);
  assert.equal(storage.values.has(CUSTOM_DICTIONARIES_KEY), false);
  controller.save([]);
  storage.failWrites = false;
  assert.equal((await controller.load()).ready, true);
  assert.deepEqual(JSON.parse(storage.values.get(CUSTOM_DICTIONARIES_KEY)), [custom]);
});

test("invalid JSON and partially invalid dictionaries remain untouched", async () => {
  for (const corrupt of ["{", "null", JSON.stringify([custom, { id: "broken" }]),
    JSON.stringify([{ ...custom, words: ["mot", null] }]), JSON.stringify([custom, custom])]) {
    const storage = memoryStorage([[CUSTOM_DICTIONARIES_KEY, corrupt]]);
    const controller = createDictionaryPersistence(storage);
    const snapshot = await controller.load();
    assert.equal(snapshot.ready, false, corrupt);
    assert.ok(snapshot.loadError);
    controller.save([]);
    assert.equal(storage.values.get(CUSTOM_DICTIONARIES_KEY), corrupt);
    assert.equal(storage.writes.length, 0);
  }
});

test("a denied storage read blocks writes until initialization succeeds", async () => {
  const storage = memoryStorage([[CUSTOM_DICTIONARIES_KEY, JSON.stringify([custom])]]);
  storage.failReads = true;
  const controller = createDictionaryPersistence(storage);
  assert.equal((await controller.load()).ready, false);
  controller.save([]);
  assert.equal(storage.writes.length, 0);
  storage.failReads = false;
  assert.deepEqual((await controller.load()).dictionaries, [custom]);
});

test("failed edits keep the durable value and retry the unsaved value", async () => {
  const storage = memoryStorage([[CUSTOM_DICTIONARIES_KEY, JSON.stringify([custom])]]);
  const controller = createDictionaryPersistence(storage);
  await controller.load();
  const next = [{ ...custom, words: ["soleil", "lune"] }];
  storage.failWrites = true;
  const failed = controller.save(next);
  assert.ok(failed.writeError);
  assert.deepEqual(failed.dictionaries, next);
  assert.deepEqual(JSON.parse(storage.values.get(CUSTOM_DICTIONARIES_KEY)), [custom]);
  storage.failWrites = false;
  assert.equal(controller.save(failed.dictionaries).writeError, "");
  assert.deepEqual((await createDictionaryPersistence(storage).load()).dictionaries, next);
});

test("301 favorites and 51 presets survive read and deletion, including historical long strings", () => {
  const favorites = Array.from({ length: 301 }, (_, index) => word(index));
  favorites[0] = "a".repeat(61);
  const presets = Array.from({ length: 51 }, (_, index) => ({
    id: `preset-${index}`, name: `Preset ${index}`, config: { algorithm: "markov" }, dictionaryWeights: {},
  }));
  const storage = memoryStorage([["favorites", JSON.stringify(favorites)], ["presets", JSON.stringify(presets)]]);
  for (const [key, values, decode] of [["favorites", favorites, readStoredFavorites], ["presets", presets, readStoredPresets]]) {
    const controller = createCollectionPersistence(storage, key, decode);
    assert.deepEqual(controller.load().value, values);
    const before = storage.writes.length;
    controller.save(values);
    assert.equal(storage.writes.length, before);
    const reduced = values.slice(1);
    assert.equal(controller.save(reduced).error, "");
    assert.deepEqual(createCollectionPersistence(storage, key, decode).load().value, reduced);
  }
});

test("corrupt favorites cannot block or overwrite valid presets; failed saves can retry", () => {
  const storage = memoryStorage([["favorites", "{"], ["presets", "[]"]]);
  const favorites = createCollectionPersistence(storage, "favorites", readStoredFavorites);
  const presets = createCollectionPersistence(storage, "presets", readStoredPresets);
  assert.equal(favorites.load().ready, false);
  assert.equal(presets.load().ready, true);
  assert.ok(favorites.save([]).error);
  assert.equal(storage.values.get("favorites"), "{");
  const next = [{ id: "saved", name: "Saved", config: {}, dictionaryWeights: {} }];
  storage.failWrites = true;
  const failure = presets.save(next);
  assert.ok(failure.error);
  assert.deepEqual(failure.value, next);
  storage.failWrites = false;
  assert.equal(presets.save(failure.value).error, "");
  assert.deepEqual(JSON.parse(storage.values.get("presets")), next);
  assert.equal(storage.values.get("favorites"), "{");
});
