import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cleanFeatureName,
  collectCleanNames,
  deterministicSample,
  normalizePlainName,
} from "../scripts/place-dictionary-utils.mjs";

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
  assert.equal(dictionaries.length, 32);
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

test("les nouveaux corpus géographiques ont les volumes et licences attendus", () => {
  const expected = new Map([
    ["en-lieux-villes", [2500, "CC-BY-4.0"]],
    ["hu-lieux-villes", [1000, "CC-BY-4.0"]],
    ["es-lieux-villes", [2500, "CC-BY-4.0"]],
    ["hu-rues-routes", [5000, "ODbL-1.0"]],
    ["es-rues-routes", [5000, "ODbL-1.0"]],
    ["fr-lieux-forets", [2000, "CC-BY-4.0"]],
    ["fr-lieux-montagnes", [4000, "CC-BY-4.0"]],
    ["fr-lieux-plages", [200, "CC-BY-4.0"]],
  ]);
  for (const [id, [count, license]] of expected) {
    const dictionary = dictionaries.find((item) => item.id === id);
    assert.ok(dictionary, `${id} absent`);
    assert.equal(dictionary.words.length, count, `${id}: volume`);
    assert.equal(dictionary.license, license, `${id}: licence`);
    assert.equal(new Set(dictionary.words).size, count, `${id}: doublons`);
  }
});

test("les types géographiques parasites sont absents des nouveaux corpus", () => {
  const kinds = new Map([
    ["hu-rues-routes", "road-hu"],
    ["es-rues-routes", "road-es"],
    ["fr-lieux-forets", "forest"],
    ["fr-lieux-montagnes", "mountain"],
    ["fr-lieux-plages", "beach"],
  ]);
  for (const [id, kind] of kinds) {
    const dictionary = dictionaries.find((item) => item.id === id);
    assert.ok(dictionary);
    for (const word of dictionary.words) {
      assert.equal(
        cleanFeatureName(word, kind),
        word,
        `${id}: terme parasite dans ${word}`,
      );
      assert.doesNotMatch(word, /\d/u, `${id}: chiffre dans ${word}`);
    }
  }
});

test("le nettoyage retire les désignations sans supprimer les sous-chaînes", () => {
  const fixtures = [
    ["Andrássy út", "road-hu", "Andrássy"],
    ["Kossuth Lajos utca", "road-hu", "Kossuth Lajos"],
    ["Calle de Santa Ana", "road-es", "Santa Ana"],
    ["Avinguda de Catalunya", "road-es", "Catalunya"],
    ["Parque Camino Verde", "road-es", "Parque Camino Verde"],
    ["Határdűlő tanya", "road-hu", "Határ tanya"],
    ["Forêt territoriale de Zonza", "forest", "Zonza"],
    ["Zonza de la forêt", "forest", "Zonza"],
    ["Mont de Vorès", "mountain", "Vorès"],
    ["Plage du Prado", "beach", "Prado"],
    ["Montpellier", "mountain", "Montpellier"],
  ];
  for (const [input, kind, expected] of fixtures) {
    assert.equal(cleanFeatureName(input, kind), expected);
  }
});

test("rejette références, annotations résiduelles et noms invalides", () => {
  for (const [value, kind] of [
    ["Calle N-7", "road-es"],
    ["Calle [projet] 12", "road-es"],
    ["Calle A;B", "road-es"],
    ["Plage A", "beach"],
    ["Forêt territoriale", "forest"],
  ]) {
    assert.equal(cleanFeatureName(value, kind), null, value);
  }
});

test("normalise NFC, déduplique par casse et échantillonne de façon stable", () => {
  assert.equal(normalizePlainName("E\u0301tang"), "Étang");
  const collected = collectCleanNames(
    ["Árvíz", "árvíz", "Andrássy út"],
    "road-hu",
    "hu",
  );
  assert.deepEqual(collected.names, ["Árvíz", "Andrássy"]);
  assert.equal(collected.stats.duplicates, 1);

  const values = ["Zèbre", "alpha", "Élan", "bravo"];
  assert.deepEqual(
    deterministicSample(values, 3, "fr"),
    deterministicSample(values, 3, "fr"),
  );
});

test("les localités russes sont romanisées et suffisamment variées", () => {
  const russianPlaces = dictionaries.find(
    ({ id }) => id === "ru-lieux-localites-romanise",
  );
  assert.ok(russianPlaces);
  assert.equal(russianPlaces.words.length, 5000);
  assert.equal(new Set(russianPlaces.words).size, russianPlaces.words.length);
  russianPlaces.words.forEach((name) => {
    assert.match(name, /^[A-Za-z][A-Za-z .'-]*$/u);
    assert.doesNotMatch(name, /[\u0400-\u04ff]/u);
  });
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

test("le corpus de voies anglaises est présent et normalisé", () => {
  const streets = dictionaries.find(({ id }) => id === "en-rues-routes");
  assert.ok(streets);
  assert.equal(streets.words.length, 3337);
  assert.equal(new Set(streets.words).size, streets.words.length);
  assert.ok(streets.words.every((word) => /^\p{L}+$/u.test(word)));
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
