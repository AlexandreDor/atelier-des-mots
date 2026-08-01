import { readdir, readFile, writeFile } from "node:fs/promises";
import { DATASET_METADATA } from "./dataset-metadata.mjs";

const [mineralPagesDirectory] = process.argv.slice(2);

if (!mineralPagesDirectory) {
  console.error(
    "Usage: node scripts/build-nature-dictionaries.mjs <mineral-pages-directory>",
  );
  process.exit(1);
}

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

const minerals = await extractMineralNames(mineralPagesDirectory);
if (minerals.length < 500) {
  throw new Error(
    `Le corpus minéralogique est incomplet : ${minerals.length} noms seulement`,
  );
}

const natureDictionaries = [
  {
    id: "fr-nature-mineraux",
    name: "Français · minéraux",
    words: minerals,
    ...DATASET_METADATA["fr-nature-mineraux"],
  },
];

await writeFile(
  new URL("../app/data/nature-dictionaries.json", import.meta.url),
  `${JSON.stringify(natureDictionaries)}\n`,
);

console.log(`fr-nature-mineraux: ${minerals.length}`);
