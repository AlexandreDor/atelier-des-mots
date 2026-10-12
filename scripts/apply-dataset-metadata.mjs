import { ACTIVE_DICTIONARY_FILES, updateDictionaryCorpora } from "./dictionary-inventory.mjs";
import {
  DATASET_METADATA,
  SUSPENDED_DATASETS,
} from "./dataset-metadata.mjs";

const seen = new Set();

await updateDictionaryCorpora((collections) => {
  const updates = {};
  for (const file of ACTIVE_DICTIONARY_FILES) {
    updates[file] = collections[file]
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
  }
  const missing = Object.keys(DATASET_METADATA).filter(
    (id) => !SUSPENDED_DATASETS.includes(id) && !seen.has(id),
  );
  if (missing.length) throw new Error(`Corpus absents : ${missing.join(", ")}`);
  return updates;
});

console.log(`${seen.size} corpus actifs documentés.`);
