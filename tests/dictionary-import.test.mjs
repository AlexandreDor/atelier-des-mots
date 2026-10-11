import assert from "node:assert/strict";
import test from "node:test";
import {
  editCustomDictionary, parseDictionaryImport, readStoredDictionaries,
  serializeDictionaryExport, MAX_DICTIONARY_IMPORT_BYTES,
} from "../app/dictionaries.ts";
import { createDictionaryPersistence } from "../app/dictionary-persistence.ts";

function word(index) {
  let result = "mot";
  let value = index;
  do {
    result += String.fromCharCode(97 + value % 26);
    value = Math.floor(value / 26);
  } while (value);
  return result;
}

test("empty, whitespace and missing import IDs get nonempty IDs that survive persistence/reload", async () => {
  const imported = parseDictionaryImport(JSON.stringify([
    { id: "", name: "Vide", words: ["soleil"] },
    { id: "   ", name: "Espaces", words: ["lune"] },
    { name: "Absent", words: ["étoile"] },
  ]), []);
  assert.equal(new Set(imported.map(({ id }) => id)).size, 3);
  assert.ok(imported.every(({ id }) => id.trim()));
  let serialized = null;
  const storage = { getItem: () => serialized, setItem: (_key, value) => { serialized = value; } };
  const controller = createDictionaryPersistence(storage);
  await controller.load();
  controller.save(imported);
  assert.deepEqual((await createDictionaryPersistence(storage).load()).dictionaries, imported);
});

test("generated IDs are collision-free even when every import shares the same timestamp", () => {
  const original = Date.now;
  Date.now = () => 42;
  try {
    const imported = parseDictionaryImport(JSON.stringify([
      { id: "", name: "A", words: [] },
      { id: "dictionnaire-importe-42", name: "B", words: [] },
      { id: " ", name: "C", words: [] },
    ]), [{ id: "dictionnaire-importe-42", name: "Existing", words: [] }]);
    assert.equal(new Set(imported.map(({ id }) => id)).size, 3);
    assert.ok(imported.every(({ id }) => id !== "dictionnaire-importe-42"));
  } finally { Date.now = original; }
});

test("app backup restores historical sizes, long IDs/names/words and more than 100 dictionaries exactly", () => {
  const dictionaries = [
    { id: "i".repeat(121), name: "n".repeat(101), words: ["a".repeat(61)] },
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `large-${index}`, name: `Grande liste ${index}`,
      words: Array.from({ length: 90_000 }, (_, offset) => word(index * 90_000 + offset)),
    })),
    { id: "over-list", name: "Plus de 100000", words: Array.from({ length: 100_001 }, (_, index) => word(index)) },
    ...Array.from({ length: 101 }, (_, index) => ({ id: `empty-${index}`, name: `Vide ${index}`, words: [] })),
  ];
  const exported = serializeDictionaryExport(dictionaries);
  assert.equal(JSON.parse(exported).format, "atelier-des-mots:dictionary-backup");
  assert.deepEqual(parseDictionaryImport(exported, []), dictionaries);
  assert.deepEqual(readStoredDictionaries(parseDictionaryImport(exported, [])), dictionaries);
});

test("backup restore retains content and resolves existing ID/name collisions", () => {
  const dictionary = { id: "mine", name: "n".repeat(101), words: ["a".repeat(61)] };
  const imported = parseDictionaryImport(serializeDictionaryExport([dictionary]), [dictionary]);
  assert.notEqual(imported[0].id, dictionary.id);
  assert.notEqual(imported[0].name, dictionary.name);
  assert.deepEqual(imported[0].words, dictionary.words);
  assert.equal(readStoredDictionaries(imported).length, 1);
});

test("backup marker does not bypass schema validation or reactivate suspended corpora", () => {
  const backup = (dictionaries) => JSON.stringify({ version: 2, format: "atelier-des-mots:dictionary-backup", dictionaries });
  assert.throws(() => parseDictionaryImport(backup([{ id: "mine", name: "Mine", words: [null] }]), []), /invalide/u);
  assert.throws(() => parseDictionaryImport(backup([{ id: "", name: "Mine", words: [] }]), []), /invalide/u);
  const imported = parseDictionaryImport(backup([
    { id: "en-mots", name: "Suspended", words: ["example"] },
    { id: "mine", name: "Mine", words: ["soleil"] },
  ]), []);
  assert.deepEqual(imported.map(({ id }) => id), ["mine"]);
});

test("unmarked imports still enforce new-content bounds", () => {
  for (const payload of [
    [{ name: "Long word", words: ["a".repeat(61)] }],
    [{ name: "Too many", words: new Array(100_001).fill("mot") }],
    Array.from({ length: 101 }, (_, index) => ({ name: `List ${index}`, words: [] })),
    Array.from({ length: 3 }, (_, index) => ({ name: `List ${index}`, words: new Array(90_000).fill("mot") })),
  ]) assert.throws(() => parseDictionaryImport(JSON.stringify(payload), []));
  assert.throws(() => parseDictionaryImport(" ".repeat(MAX_DICTIONARY_IMPORT_BYTES + 1), []), /64 Mo/u);
});

test("historical long fields can be saved unchanged and words can be removed without truncation", () => {
  const dictionary = {
    id: "mine", name: "n".repeat(101),
    words: [...Array.from({ length: 100_001 }, (_, index) => word(index)), "a".repeat(61)],
  };
  assert.deepEqual(editCustomDictionary(dictionary, dictionary.name, dictionary.words.join("\n"), [dictionary]), dictionary);
  const reduced = editCustomDictionary(dictionary, dictionary.name, dictionary.words.slice(1).join("\n"), [dictionary]);
  assert.deepEqual(reduced.words, dictionary.words.slice(1));
  const renamed = editCustomDictionary(dictionary, "Nouveau nom", dictionary.words.join("\n"), [dictionary]);
  assert.deepEqual(renamed.words, dictionary.words);
  assert.equal(editCustomDictionary(dictionary, "x".repeat(101), dictionary.words.join("\n"), [dictionary]).name.length, 101);
  assert.throws(() => editCustomDictionary(dictionary, "x".repeat(102), dictionary.words.join("\n"), [dictionary]), /100 caractères/u);
  assert.throws(() => editCustomDictionary(dictionary, dictionary.name, `${dictionary.words.join("\n")}\n${"b".repeat(61)}`, [dictionary]), /60 lettres/u);
  assert.throws(() => editCustomDictionary(dictionary, dictionary.name, `${dictionary.words.join("\n")}\nuniquenouveau`, [dictionary]), /100 000/u);
});

test("edits over the historical cumulative limit allow preservation/reduction and reject growth", () => {
  const dictionaries = Array.from({ length: 3 }, (_, index) => ({
    id: `large-${index}`, name: `List ${index}`,
    words: Array.from({ length: 90_000 }, (_, offset) => word(index * 90_000 + offset)),
  }));
  const selected = dictionaries[0];
  assert.equal(editCustomDictionary(selected, "Renommé", selected.words.join("\n"), dictionaries).words.length, 90_000);
  assert.equal(editCustomDictionary(selected, selected.name, selected.words.slice(1).join("\n"), dictionaries).words.length, 89_999);
  assert.throws(() => editCustomDictionary(selected, selected.name, `${selected.words.join("\n")}\nuniquenouveau`, dictionaries), /250 000/u);
});

test("new edits exceeding a per-list limit fail without returning silently truncated words", () => {
  const selected = { id: "mine", name: "Mine", words: [] };
  assert.throws(() => editCustomDictionary(selected, selected.name,
    Array.from({ length: 100_001 }, (_, index) => word(index)).join("\n"), [selected]), /100 000/u);
});
