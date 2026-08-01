import { readFile, writeFile } from "node:fs/promises";
import {
  DATASET_METADATA,
  SUSPENDED_DATASETS,
} from "./dataset-metadata.mjs";

const files = [
  "../app/data/dictionaries-primary.json",
  "../app/data/dictionaries-secondary.json",
  "../app/data/place-dictionaries.json",
  "../app/data/nature-dictionaries.json",
];
const seen = new Set();

for (const relativePath of files) {
  const url = new URL(relativePath, import.meta.url);
  const dictionaries = JSON.parse(await readFile(url, "utf8"));
  const enriched = dictionaries
    .filter(({ id }) => !SUSPENDED_DATASETS.includes(id))
    .map((dictionary) => {
      const metadata = DATASET_METADATA[dictionary.id];
      if (!metadata) throw new Error(`Métadonnées manquantes : ${dictionary.id}`);
      seen.add(dictionary.id);
      return { ...dictionary, ...metadata };
    });
  await writeFile(url, `${JSON.stringify(enriched)}\n`);
}

const expected = Object.keys(DATASET_METADATA).filter(
  (id) => !SUSPENDED_DATASETS.includes(id),
);
const missing = expected.filter((id) => !seen.has(id));
if (missing.length) {
  throw new Error(`Corpus absents : ${missing.join(", ")}`);
}

console.log(`${seen.size} corpus actifs documentés.`);
