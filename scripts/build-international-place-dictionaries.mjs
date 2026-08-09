import { readFile, writeFile } from "node:fs/promises";
import { DATASET_METADATA } from "./dataset-metadata.mjs";
import {
  POPULATED_PLACE_CODES,
  collectCleanNames,
  collectNormalizedNames,
  deterministicSample,
  parseGeoNames,
  readGeoJsonSequence,
  roadNamesFromFeature,
} from "./place-dictionary-utils.mjs";

const [gbPath, huPath, esPath, huRoadsPath, esRoadsPath, esCanaryRoadsPath] =
  process.argv.slice(2);

if (
  !gbPath ||
  !huPath ||
  !esPath ||
  !huRoadsPath ||
  !esRoadsPath ||
  !esCanaryRoadsPath
) {
  console.error(
    "Usage: node scripts/build-international-place-dictionaries.mjs <GB.txt> <HU.txt> <ES.txt> <HU-roads.geojsonseq> <ES-roads.geojsonseq> <ES-canary-roads.geojsonseq>",
  );
  process.exit(1);
}

const TARGET_COUNTS = {
  englandCities: 2500,
  hungaryCities: 1000,
  spainCities: 2500,
  hungaryRoads: 5000,
  spainRoads: 5000,
};

function withMetadata(id, name, words) {
  const metadata = DATASET_METADATA[id];
  if (!metadata) throw new Error(`Métadonnées manquantes : ${id}`);
  return { id, name, words, ...metadata };
}

function cityNames(tsv, countryCode, target, admin1Code = null, locale = "en") {
  const candidates = parseGeoNames(tsv)
    .filter(
      (place) =>
        place.countryCode === countryCode &&
        (!admin1Code || place.admin1Code === admin1Code) &&
        place.featureClass === "P" &&
        POPULATED_PLACE_CODES.has(place.featureCode) &&
        place.population > 0,
    )
    .sort(
      (first, second) =>
        second.population - first.population ||
        (first.name || "").localeCompare(second.name || "", locale, {
          sensitivity: "base",
        }),
    )
    .map((place) => place.name);
  const clean = collectNormalizedNames(candidates, locale);
  if (clean.names.length < target) {
    throw new Error(
      `${countryCode} villes : ${clean.names.length} noms nettoyés, ${target} attendus`,
    );
  }
  return {
    names: clean.names.slice(0, target).sort((first, second) =>
      first.localeCompare(second, locale, { sensitivity: "base" }),
    ),
    stats: clean.stats,
  };
}

async function roadCandidates(paths) {
  const values = [];
  for (const path of paths) {
    for await (const feature of readGeoJsonSequence(path)) {
      const name = roadNamesFromFeature(feature);
      if (name) values.push(name);
    }
  }
  return values;
}

function roadNames(values, kind, target, locale) {
  const clean = collectCleanNames(values, kind, locale);
  if (clean.names.length < target) {
    throw new Error(
      `${kind} : ${clean.names.length} noms nettoyés, ${target} attendus`,
    );
  }
  return {
    names: deterministicSample(clean.names, target, locale),
    stats: clean.stats,
  };
}

const [gbText, huText, esText, existingText] = await Promise.all([
  readFile(gbPath, "utf8"),
  readFile(huPath, "utf8"),
  readFile(esPath, "utf8"),
  readFile(
    new URL("../app/data/place-dictionaries.json", import.meta.url),
    "utf8",
  ),
]);

const [huRoadCandidates, esRoadCandidates] = await Promise.all([
  roadCandidates([huRoadsPath]),
  roadCandidates([esRoadsPath, esCanaryRoadsPath]),
]);

const englandCities = cityNames(gbText, "GB", TARGET_COUNTS.englandCities, "ENG");
const hungaryCities = cityNames(
  huText,
  "HU",
  TARGET_COUNTS.hungaryCities,
  null,
  "hu",
);
const spainCities = cityNames(
  esText,
  "ES",
  TARGET_COUNTS.spainCities,
  null,
  "es",
);
const hungaryRoads = roadNames(
  huRoadCandidates,
  "road-hu",
  TARGET_COUNTS.hungaryRoads,
  "hu",
);
const spainRoads = roadNames(
  esRoadCandidates,
  "road-es",
  TARGET_COUNTS.spainRoads,
  "es",
);

const internationalDictionaries = [
  withMetadata(
    "en-lieux-villes",
    "Angleterre · villes et bourgs",
    englandCities.names,
  ),
  withMetadata(
    "hu-lieux-villes",
    "Hongrie · villes et bourgs",
    hungaryCities.names,
  ),
  withMetadata(
    "es-lieux-villes",
    "Espagne · villes et bourgs",
    spainCities.names,
  ),
  withMetadata(
    "hu-rues-routes",
    "Hongrie · noms de rues et routes",
    hungaryRoads.names,
  ),
  withMetadata(
    "es-rues-routes",
    "Espagne · noms de rues et routes",
    spainRoads.names,
  ),
];

const targets = new Set(internationalDictionaries.map(({ id }) => id));
const existing = JSON.parse(existingText).filter(
  ({ id }) => !targets.has(id),
);
const dictionaries = [...existing, ...internationalDictionaries];

for (const dictionary of internationalDictionaries) {
  const expected =
    TARGET_COUNTS[
      {
        "en-lieux-villes": "englandCities",
        "hu-lieux-villes": "hungaryCities",
        "es-lieux-villes": "spainCities",
        "hu-rues-routes": "hungaryRoads",
        "es-rues-routes": "spainRoads",
      }[dictionary.id]
    ];
  if (dictionary.words.length !== expected) {
    throw new Error(
      `${dictionary.id}: ${dictionary.words.length} noms, ${expected} attendus`,
    );
  }
}

for (const [id, audit] of [
  ["en-lieux-villes", englandCities],
  ["hu-lieux-villes", hungaryCities],
  ["es-lieux-villes", spainCities],
  ["hu-rues-routes", hungaryRoads],
  ["es-rues-routes", spainRoads],
]) {
  console.log(
    `${id}: ${audit.names.length} noms · candidats ${audit.stats.candidates}, ` +
      `nettoyés ${audit.stats.transformed}, rejetés ${audit.stats.rejected}, ` +
      `doublons ${audit.stats.duplicates}`,
  );
}

await writeFile(
  new URL("../app/data/place-dictionaries.json", import.meta.url),
  `${JSON.stringify(dictionaries)}\n`,
);

console.log(
  internationalDictionaries
    .map((dictionary) => `${dictionary.id}: ${dictionary.words.length}`)
    .join("\n"),
);
