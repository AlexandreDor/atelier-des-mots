import { readFile, writeFile } from "node:fs/promises";
import { DATASET_METADATA } from "./dataset-metadata.mjs";

const [geonamesPath] = process.argv.slice(2);

if (!geonamesPath) {
  console.error(
    "Usage: node scripts/build-russian-place-dictionary.mjs <RU.txt>",
  );
  process.exit(1);
}

const DICTIONARY_ID = "ru-lieux-localites-romanise";
const TARGET_COUNT = 5000;
const POPULATED_PLACE_CODES = new Set([
  "PPL",
  "PPLA",
  "PPLA2",
  "PPLA3",
  "PPLA4",
  "PPLC",
  "PPLG",
]);

function parseGeoNames(tsv) {
  return tsv
    .trim()
    .split("\n")
    .map((line) => {
      const fields = line.split("\t");
      return {
        asciiName: fields[2],
        featureClass: fields[6],
        featureCode: fields[7],
        population: Number(fields[14] || 0),
      };
    });
}

function usableRomanizedName(value) {
  return (
    value.length >= 2 &&
    value.length <= 42 &&
    /^[A-Za-z][A-Za-z .'-]*$/u.test(value)
  );
}

function buildNames(places) {
  const seen = new Set();
  const names = [];

  for (const place of places
    .filter(
      (item) =>
        item.featureClass === "P" &&
        POPULATED_PLACE_CODES.has(item.featureCode) &&
        item.population > 0 &&
        usableRomanizedName(item.asciiName),
    )
    .sort(
      (first, second) =>
        second.population - first.population ||
        first.asciiName.localeCompare(second.asciiName, "en", {
          sensitivity: "base",
        }),
    )) {
    const name = place.asciiName.normalize("NFC").replace(/\s+/g, " ").trim();
    const key = name.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length === TARGET_COUNT) break;
  }

  return names.sort((first, second) =>
    first.localeCompare(second, "en", { sensitivity: "base" }),
  );
}

const [geonamesText, dictionariesText] = await Promise.all([
  readFile(geonamesPath, "utf8"),
  readFile(
    new URL("../app/data/place-dictionaries.json", import.meta.url),
    "utf8",
  ),
]);
const words = buildNames(parseGeoNames(geonamesText));

if (words.length !== TARGET_COUNT) {
  throw new Error(
    `${DICTIONARY_ID}: ${words.length} noms, ${TARGET_COUNT} attendus`,
  );
}

const dictionary = {
  id: DICTIONARY_ID,
  name: "Russie · villes, bourgs et villages (romanisé)",
  words,
  ...DATASET_METADATA[DICTIONARY_ID],
};
const dictionaries = JSON.parse(dictionariesText).filter(
  ({ id }) => id !== DICTIONARY_ID,
);
dictionaries.push(dictionary);

await writeFile(
  new URL("../app/data/place-dictionaries.json", import.meta.url),
  `${JSON.stringify(dictionaries)}\n`,
);

console.log(`${DICTIONARY_ID}: ${words.length}`);
