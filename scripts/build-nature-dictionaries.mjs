import { createReadStream } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const [taxonPath, mineralPagesDirectory] = process.argv.slice(2);

if (!taxonPath || !mineralPagesDirectory) {
  console.error(
    "Usage: node scripts/build-nature-dictionaries.mjs <taxon.txt> <mineral-pages-directory>",
  );
  process.exit(1);
}

const TARGET_COUNTS = {
  animals: 4000,
  plants: 4000,
  fungi: 1400,
};

function cleanName(value) {
  return value
    .normalize("NFC")
    .replace(/\s*\((?:L'|Le|La|Les|Un|Une)\)\s*$/iu, "")
    .replace(/^[“”"'«»]+|[“”"'«»]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function usableName(value) {
  return (
    value.length >= 2 &&
    value.length <= 52 &&
    /^\p{L}/u.test(value) &&
    !/\d/u.test(value) &&
    !/[=<>[\]{}]/u.test(value) &&
    !/^(?:et|ou|avec)\s/iu.test(value)
  );
}

function uniqueNames(values) {
  const seen = new Set();
  const names = [];
  for (const value of values) {
    const name = cleanName(value);
    const key = name.toLocaleLowerCase("fr-FR");
    if (!usableName(name) || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
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
  if (values.length < count) {
    throw new Error(`${values.length} noms disponibles, ${count} attendus`);
  }
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

function splitVernacularNames(value) {
  return value
    .split(/\s*[,;]\s*/u)
    .map(cleanName)
    .filter(Boolean);
}

async function extractTaxrefNames(path) {
  const byKingdom = {
    Animalia: [],
    Plantae: [],
    Fungi: [],
  };
  const lines = createInterface({
    input: createReadStream(path, "utf8"),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let firstLine = true;
  for await (const line of lines) {
    if (firstLine) {
      firstLine = false;
      continue;
    }
    const fields = line.split("\t");
    const id = fields[0];
    const acceptedNameUsageId = fields[3];
    const kingdom = fields[8];
    const rank = fields[22];
    const vernacularName = fields[24];
    if (
      !vernacularName ||
      id !== acceptedNameUsageId ||
      !["species", "subspecies", "variety"].includes(rank) ||
      !(kingdom in byKingdom)
    ) {
      continue;
    }
    byKingdom[kingdom].push(...splitVernacularNames(vernacularName));
  }

  return Object.fromEntries(
    Object.entries(byKingdom).map(([kingdom, names]) => [
      kingdom,
      uniqueNames(names),
    ]),
  );
}

function mineralNameFromLine(line) {
  if (!/^\*\s+/u.test(line)) return null;
  const link = line.match(/^\*\s+\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/u);
  if (!link) return null;
  return cleanName((link[2] || link[1]).replace(/\s+\(minéral\)$/iu, ""));
}

async function extractMineralNames(directory) {
  const files = (await readdir(directory))
    .filter((file) => /^minerals-[A-Z]\.json$/u.test(file))
    .sort();
  const names = [];
  for (const file of files) {
    const payload = JSON.parse(
      await readFile(new URL(file, `file://${directory}/`), "utf8"),
    );
    const wikitext = payload.parse?.wikitext ?? "";
    for (const line of wikitext.split("\n")) {
      const name = mineralNameFromLine(line);
      if (name) names.push(name);
    }
  }
  return uniqueNames(names).sort((first, second) =>
    first.localeCompare(second, "fr", { sensitivity: "base" }),
  );
}

const [taxref, minerals] = await Promise.all([
  extractTaxrefNames(taxonPath),
  extractMineralNames(mineralPagesDirectory),
]);

const natureDictionaries = [
  {
    id: "fr-nature-animaux",
    name: "Français · animaux",
    words: deterministicSample(taxref.Animalia, TARGET_COUNTS.animals),
  },
  {
    id: "fr-nature-plantes",
    name: "Français · plantes",
    words: deterministicSample(taxref.Plantae, TARGET_COUNTS.plants),
  },
  {
    id: "fr-nature-champignons",
    name: "Français · champignons",
    words: deterministicSample(taxref.Fungi, TARGET_COUNTS.fungi),
  },
  {
    id: "fr-nature-mineraux",
    name: "Français · minéraux",
    words: minerals,
  },
];

if (minerals.length < 500) {
  throw new Error(
    `Le corpus minéralogique est incomplet : ${minerals.length} noms seulement`,
  );
}

await writeFile(
  new URL("../app/data/nature-dictionaries.json", import.meta.url),
  `${JSON.stringify(natureDictionaries)}\n`,
);

console.log(
  natureDictionaries
    .map((dictionary) => `${dictionary.id}: ${dictionary.words.length}`)
    .concat(
      `total: ${natureDictionaries.reduce(
        (sum, dictionary) => sum + dictionary.words.length,
        0,
      )}`,
    )
    .join("\n"),
);
