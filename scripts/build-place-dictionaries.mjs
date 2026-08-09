import { readFile, writeFile } from "node:fs/promises";
import { DATASET_METADATA } from "./dataset-metadata.mjs";
import {
  collectCleanNames,
  collectNormalizedNames,
  deterministicSample,
  parseGeoNames,
} from "./place-dictionary-utils.mjs";

const [communesPath, geonamesPath, fleuvesHtmlPath] = process.argv.slice(2);

if (!communesPath || !geonamesPath || !fleuvesHtmlPath) {
  console.error(
    "Usage: node scripts/build-place-dictionaries.mjs <communes.json> <FR.txt> <fleuves.html>",
  );
  process.exit(1);
}

const TARGET_COUNTS = {
  cities: 2500,
  villages: 4000,
  rivers: 1000,
  fleuves: 200,
  forests: 2000,
  mountains: 4000,
  beaches: 200,
};

function decodeHtml(value) {
  return value
    .replace(/<sup\b[^>]*>.*?<\/sup>/gis, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&ndash;", "–")
    .replaceAll("&mdash;", "—")
    .replaceAll("&oelig;", "œ")
    .replaceAll("&OElig;", "Œ")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFleuves(html) {
  const table = html.match(
    /<table\b[^>]*class="[^"]*\bwikitable\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i,
  )?.[1];
  if (!table) throw new Error("Le tableau des fleuves est introuvable.");

  const values = [];
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const firstCell = row[1].match(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/i)?.[1];
    if (!firstCell) continue;
    const name = decodeHtml(firstCell)
      .replace(/\s*\([^)]*\)\s*$/u, "")
      .trim();
    if (name !== "Fleuve") values.push(name);
  }
  return values;
}

function withMetadata(id, name, words) {
  const metadata = DATASET_METADATA[id];
  if (!metadata) throw new Error(`Métadonnées manquantes : ${id}`);
  return { id, name, words, ...metadata };
}

function logAudit(id, stats, output) {
  console.log(
    `${id}: ${output.length} noms · candidats ${stats.candidates}, ` +
      `nettoyés ${stats.transformed}, rejetés ${stats.rejected}, ` +
      `doublons ${stats.duplicates}`,
  );
}

function requireMinimum(id, names, target) {
  if (names.length < target) {
    throw new Error(`${id} : ${names.length} noms, ${target} attendus`);
  }
  return names;
}

const [communesText, geonamesText, fleuvesHtml, existingText] =
  await Promise.all([
    readFile(communesPath, "utf8"),
    readFile(geonamesPath, "utf8"),
    readFile(fleuvesHtmlPath, "utf8"),
    readFile(
      new URL("../app/data/place-dictionaries.json", import.meta.url),
      "utf8",
    ),
  ]);

const communes = JSON.parse(communesText).filter(
  (commune) => commune.type === "commune-actuelle" && commune.zone === "metro",
);
const geonames = parseGeoNames(geonamesText);

const cityClean = collectNormalizedNames(
  [...communes]
    .filter((commune) => commune.population >= 2000)
    .sort(
      (first, second) =>
        second.population - first.population ||
        first.nom.localeCompare(second.nom, "fr"),
    )
    .map((commune) => commune.nom),
  "fr",
);
const cityNames = requireMinimum(
  "fr-lieux-villes",
  cityClean.names,
  TARGET_COUNTS.cities,
).slice(0, TARGET_COUNTS.cities);

const villageClean = collectNormalizedNames(
  communes
    .filter((commune) => commune.population < 2000)
    .map((commune) => commune.nom),
  "fr",
);
const villageNames = deterministicSample(
  requireMinimum(
    "fr-lieux-villages",
    villageClean.names,
    TARGET_COUNTS.villages,
  ),
  TARGET_COUNTS.villages,
);

const riverClean = collectNormalizedNames(
  geonames
    .filter(
      (place) =>
        place.featureClass === "H" && place.featureCode.startsWith("STM"),
    )
    .map((place) => place.name),
  "fr",
);
const riverNames = deterministicSample(
  requireMinimum("fr-lieux-rivieres", riverClean.names, TARGET_COUNTS.rivers),
  TARGET_COUNTS.rivers,
);

const fleuveClean = collectNormalizedNames(extractFleuves(fleuvesHtml), "fr");
const fleuveNames = requireMinimum(
  "fr-lieux-fleuves",
  fleuveClean.names,
  TARGET_COUNTS.fleuves,
).slice(0, TARGET_COUNTS.fleuves);

const forestCandidates = geonames
  .filter(
    (place) => place.featureClass === "V" && place.featureCode === "FRST",
  )
  .map((place) => place.name);
const forestClean = collectCleanNames(forestCandidates, "forest");
const forestNames = deterministicSample(
  requireMinimum("fr-lieux-forets", forestClean.names, TARGET_COUNTS.forests),
  TARGET_COUNTS.forests,
);

const mountainCandidates = geonames
  .filter(
    (place) =>
      place.featureClass === "T" &&
      ["HLL", "HLLS", "MT", "MTS", "PK", "PKS"].includes(
        place.featureCode,
      ),
  )
  .map((place) => place.name);
const mountainClean = collectCleanNames(mountainCandidates, "mountain");
const mountainNames = deterministicSample(
  requireMinimum(
    "fr-lieux-montagnes",
    mountainClean.names,
    TARGET_COUNTS.mountains,
  ),
  TARGET_COUNTS.mountains,
);

const beachCandidates = geonames
  .filter(
    (place) =>
      place.featureClass === "T" && ["BCH", "BCHS"].includes(place.featureCode),
  )
  .map((place) => place.name);
const beachClean = collectCleanNames(beachCandidates, "beach");
const beachNames = deterministicSample(
  requireMinimum("fr-lieux-plages", beachClean.names, TARGET_COUNTS.beaches),
  TARGET_COUNTS.beaches,
);

const frenchDictionaries = [
  withMetadata("fr-lieux-villes", "France · villes et bourgs", cityNames),
  withMetadata("fr-lieux-villages", "France · villages", villageNames),
  withMetadata("fr-lieux-rivieres", "France · rivières", riverNames),
  withMetadata("fr-lieux-fleuves", "France · fleuves", fleuveNames),
  withMetadata("fr-lieux-forets", "France · forêts", forestNames),
  withMetadata("fr-lieux-montagnes", "France · montagnes", mountainNames),
  withMetadata("fr-lieux-plages", "France · plages", beachNames),
];

const targets = new Set(frenchDictionaries.map(({ id }) => id));
const existing = JSON.parse(existingText).filter(
  ({ id }) => !targets.has(id),
);
const placeDictionaries = [...frenchDictionaries, ...existing];

const expectedById = new Map([
  ["fr-lieux-villes", TARGET_COUNTS.cities],
  ["fr-lieux-villages", TARGET_COUNTS.villages],
  ["fr-lieux-rivieres", TARGET_COUNTS.rivers],
  ["fr-lieux-fleuves", TARGET_COUNTS.fleuves],
  ["fr-lieux-forets", TARGET_COUNTS.forests],
  ["fr-lieux-montagnes", TARGET_COUNTS.mountains],
  ["fr-lieux-plages", TARGET_COUNTS.beaches],
]);
for (const dictionary of frenchDictionaries) {
  const expected = expectedById.get(dictionary.id);
  if (dictionary.words.length !== expected) {
    throw new Error(
      `${dictionary.id}: ${dictionary.words.length} noms, ${expected} attendus`,
    );
  }
}

logAudit("fr-lieux-villes", cityClean.stats, cityNames);
logAudit("fr-lieux-villages", villageClean.stats, villageNames);
logAudit("fr-lieux-rivieres", riverClean.stats, riverNames);
logAudit("fr-lieux-fleuves", fleuveClean.stats, fleuveNames);
logAudit("fr-lieux-forets", forestClean.stats, forestNames);
logAudit("fr-lieux-montagnes", mountainClean.stats, mountainNames);
logAudit("fr-lieux-plages", beachClean.stats, beachNames);

await writeFile(
  new URL("../app/data/place-dictionaries.json", import.meta.url),
  `${JSON.stringify(placeDictionaries)}\n`,
);

const total = placeDictionaries.reduce(
  (sum, dictionary) => sum + dictionary.words.length,
  0,
);
console.log(
  placeDictionaries
    .map((dictionary) => `${dictionary.id}: ${dictionary.words.length}`)
    .concat(`total: ${total}`)
    .join("\n"),
);
