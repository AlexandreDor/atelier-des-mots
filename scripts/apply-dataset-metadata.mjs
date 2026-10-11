import { readFile, writeFile } from "node:fs/promises";
import { ACTIVE_DICTIONARY_FILES, writeDictionaryInventory } from "./dictionary-inventory.mjs";
import {
  DATASET_METADATA,
  SUSPENDED_DATASETS,
} from "./dataset-metadata.mjs";

const seen = new Set();

for (const file of ACTIVE_DICTIONARY_FILES) {
  const url = new URL(`../app/data/${file}`, import.meta.url);
  const dictionaries = JSON.parse(await readFile(url, "utf8"));
  const enriched = dictionaries
    .filter(({ id }) => !SUSPENDED_DATASETS.includes(id))
    .map((dictionary) => {
      const metadata = DATASET_METADATA[dictionary.id];
      if (!metadata) throw new Error(`Métadonnées manquantes : ${dictionary.id}`);
      seen.add(dictionary.id);
      return {
        ...dictionary,
        ...metadata,
        ...(dictionary.sourceSnapshots
          ? {
              sourceVersion: dictionary.sourceVersion,
              accessedAt: dictionary.accessedAt,
              sourceSnapshots: dictionary.sourceSnapshots,
            }
          : {}),
      };
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

await writeDictionaryInventory();

console.log(`${seen.size} corpus actifs documentés.`);
