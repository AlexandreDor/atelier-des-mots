import { readFile, writeFile } from "node:fs/promises";
import { DATASET_METADATA } from "./dataset-metadata.mjs";

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
  mountains: 689,
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

function usableName(value) {
  return (
    value &&
    value.length >= 2 &&
    value.length <= 42 &&
    /\p{L}/u.test(value) &&
    !/\d/.test(value)
  );
}

function uniqueNames(values) {
  const seen = new Set();
  return values.filter((value) => {
    const name = value.normalize("NFC").replace(/\s+/g, " ").trim();
    const key = name.toLocaleLowerCase("fr-FR");
    if (!usableName(name) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stableRank(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicSample(values, count) {
  return [...values]
    .sort(
      (first, second) =>
        stableRank(first) - stableRank(second) ||
        first.localeCompare(second, "fr", { sensitivity: "base" }),
    )
    .slice(0, count)
    .sort((first, second) =>
      first.localeCompare(second, "fr", { sensitivity: "base" }),
    );
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
  return uniqueNames(values);
}

function parseGeoNames(tsv) {
  return tsv
    .trim()
    .split("\n")
    .map((line) => {
      const fields = line.split("\t");
      return {
        id: fields[0],
        name: fields[1],
        featureClass: fields[6],
        featureCode: fields[7],
      };
    });
}

const [communesText, geonamesText, fleuvesHtml] = await Promise.all([
  readFile(communesPath, "utf8"),
  readFile(geonamesPath, "utf8"),
  readFile(fleuvesHtmlPath, "utf8"),
]);
const communes = JSON.parse(communesText).filter(
  (commune) => commune.type === "commune-actuelle" && commune.zone === "metro",
);
const geonames = parseGeoNames(geonamesText);

const cityNames = uniqueNames(
  [...communes]
    .filter((commune) => commune.population >= 2000)
    .sort(
      (first, second) =>
        second.population - first.population ||
        first.nom.localeCompare(second.nom, "fr"),
    )
    .map((commune) => commune.nom),
).slice(0, TARGET_COUNTS.cities);

const villageNames = deterministicSample(
  uniqueNames(
    communes
      .filter((commune) => commune.population < 2000)
      .map((commune) => commune.nom),
  ),
  TARGET_COUNTS.villages,
);

const riverNames = deterministicSample(
  uniqueNames(
    geonames
      .filter(
        (place) =>
          place.featureClass === "H" &&
          place.featureCode.startsWith("STM"),
      )
      .map((place) => place.name),
  ),
  TARGET_COUNTS.rivers,
);

const fleuveNames = extractFleuves(fleuvesHtml).slice(
  0,
  TARGET_COUNTS.fleuves,
);

const mountainNames = deterministicSample(
  uniqueNames(
    geonames
      .filter(
        (place) =>
          place.featureClass === "T" &&
          ["HLL", "HLLS", "MT", "MTS", "PK", "PKS"].includes(
            place.featureCode,
          ),
      )
      .map((place) => place.name),
  ),
  TARGET_COUNTS.mountains,
);

const placeDictionaries = [
  {
    id: "fr-lieux-villes",
    name: "France · villes et bourgs",
    words: cityNames,
  },
  {
    id: "fr-lieux-villages",
    name: "France · villages",
    words: villageNames,
  },
  {
    id: "fr-lieux-rivieres",
    name: "France · rivières",
    words: riverNames,
  },
  {
    id: "fr-lieux-fleuves",
    name: "France · fleuves",
    words: fleuveNames,
  },
  {
    id: "fr-lieux-montagnes",
    name: "France · montagnes",
    words: mountainNames,
  },
].map((dictionary) => ({
  ...dictionary,
  ...DATASET_METADATA[dictionary.id],
}));

for (const dictionary of placeDictionaries) {
  const expected =
    TARGET_COUNTS[
      {
        "fr-lieux-villes": "cities",
        "fr-lieux-villages": "villages",
        "fr-lieux-rivieres": "rivers",
        "fr-lieux-fleuves": "fleuves",
        "fr-lieux-montagnes": "mountains",
      }[dictionary.id]
    ];
  if (dictionary.words.length !== expected) {
    throw new Error(
      `${dictionary.id}: ${dictionary.words.length} noms, ${expected} attendus`,
    );
  }
}

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
