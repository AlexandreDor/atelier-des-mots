import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataFiles = [
  "app/data/dictionaries-primary.json",
  "app/data/dictionaries-secondary.json",
  "app/data/place-dictionaries.json",
  "app/data/nature-dictionaries.json",
];
const dictionaries = (
  await Promise.all(
    dataFiles.map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  )
).flat();

test("chaque corpus actif possède une provenance et une licence", () => {
  assert.equal(dictionaries.length, 23);
  for (const dictionary of dictionaries) {
    for (const key of [
      "source",
      "sourceUrl",
      "license",
      "licenseUrl",
      "sourceVersion",
      "accessedAt",
      "transformations",
      "licenseReviewedAt",
    ]) {
      assert.ok(dictionary[key], `${dictionary.id}: ${key} manquant`);
    }
  }
});

test("les corpus TAXREF ambigus ne sont plus distribués", () => {
  const ids = new Set(dictionaries.map(({ id }) => id));
  assert.equal(ids.has("fr-nature-animaux"), false);
  assert.equal(ids.has("fr-nature-plantes"), false);
  assert.equal(ids.has("fr-nature-champignons"), false);
});

test("les dérivés CC BY-SA restent identifiés CC BY-SA", () => {
  for (const dictionary of dictionaries.filter(
    ({ license }) => license === "CC-BY-SA-4.0",
  )) {
    assert.equal(dictionary.derivedDataLicense, "CC-BY-SA-4.0");
  }
});

test("le corpus anglais reste inchangé", () => {
  const english = dictionaries.find(({ id }) => id === "en-mots");
  assert.ok(english);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(english.words))
    .digest("hex");
  assert.equal(english.words.length, 9974);
  assert.equal(
    fingerprint,
    "d283c0910bc1a42e24a861094f7e884ef0180a9bb7c6ea711ccb10d911dd9ff7",
  );
});
