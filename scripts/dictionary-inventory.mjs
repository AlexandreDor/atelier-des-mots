import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

export const ACTIVE_DICTIONARY_FILES = [
  "dictionaries-primary.json",
  "dictionaries-secondary.json",
  "place-dictionaries.json",
  "nature-dictionaries.json",
];
const DATA_DIRECTORY = new URL("../app/data/", import.meta.url);

function requireStrings(dictionary, keys) {
  for (const key of keys) {
    if (typeof dictionary[key] !== "string" || !dictionary[key].trim()) {
      throw new Error(`${dictionary.id ?? "Corpus"} : ${key} manquant ou invalide`);
    }
  }
}

function validateSnapshots(dictionary) {
  if (!Object.hasOwn(dictionary, "sourceSnapshots")) return;
  if (
    !Array.isArray(dictionary.sourceSnapshots) ||
    dictionary.sourceSnapshots.length === 0 ||
    dictionary.sourceSnapshots.some((snapshot) =>
      !snapshot || typeof snapshot.file !== "string" || !snapshot.file.trim() ||
      typeof snapshot.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(snapshot.sha256) ||
      typeof snapshot.capturedAt !== "string" || !Number.isFinite(Date.parse(snapshot.capturedAt)),
    )
  ) {
    throw new Error(`${dictionary.id} : sourceSnapshots invalides`);
  }
}

// Copy the corpus metadata itself: registry defaults must not replace the
// provenance captured by a reconstruction.
export async function buildDictionaryInventory(dataDirectory = DATA_DIRECTORY) {
  const files = [...ACTIVE_DICTIONARY_FILES, "suspended-dictionaries.json"];
  const collections = await Promise.all(files.map(async (file) => {
    const dictionaries = JSON.parse(await readFile(new URL(file, dataDirectory), "utf8"));
    if (!Array.isArray(dictionaries)) throw new Error(`${file} : liste de corpus attendue`);
    return dictionaries;
  }));
  const seen = new Set();
  function validateMetadata(dictionary) {
    if (!dictionary || typeof dictionary !== "object" || Array.isArray(dictionary)) {
      throw new Error("Fiche de corpus invalide");
    }
    requireStrings(dictionary, ["id", "name", "source", "sourceUrl", "license", "licenseUrl", "sourceVersion"]);
    if (seen.has(dictionary.id)) throw new Error(`Corpus dupliqué : ${dictionary.id}`);
    seen.add(dictionary.id);
    validateSnapshots(dictionary);
  }
  const active = collections.slice(0, -1).flat().map((dictionary) => {
    validateMetadata(dictionary);
    requireStrings(dictionary, ["accessedAt", "transformations", "licenseReviewedAt"]);
    if (dictionary.status === "suspended") throw new Error(`${dictionary.id} : corpus suspendu dans les données actives`);
    if (!Array.isArray(dictionary.words) || dictionary.words.some((word) => typeof word !== "string")) {
      throw new Error(`${dictionary.id} : lexique invalide`);
    }
    const { words, ...metadata } = dictionary;
    return { ...metadata, wordCount: words.length };
  });
  const suspended = collections.at(-1).map((dictionary) => {
    validateMetadata(dictionary);
    requireStrings(dictionary, ["suspensionReason"]);
    if (dictionary.status !== "suspended") throw new Error(`${dictionary.id} : statut suspendu attendu`);
    if (Object.hasOwn(dictionary, "words") && (!Array.isArray(dictionary.words) || dictionary.words.length !== 0)) {
      throw new Error(`${dictionary.id} : le lexique suspendu ne doit pas être conservé`);
    }
    const { words, ...metadata } = dictionary;
    const wordCount = dictionary.wordCount ?? words?.length ?? 0;
    if (!Number.isSafeInteger(wordCount) || wordCount < 0) throw new Error(`${dictionary.id} : wordCount invalide`);
    return { ...metadata, wordCount };
  });
  return { active, suspended };
}

export async function writeDictionaryInventory(dataDirectory = DATA_DIRECTORY) {
  const inventory = await buildDictionaryInventory(dataDirectory);
  const target = new URL("dictionary-inventory.json", dataDirectory);
  const temporary = new URL(`.dictionary-inventory-${randomUUID()}.tmp`, dataDirectory);
  try {
    await writeFile(temporary, `${JSON.stringify(inventory)}\n`, { flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  return inventory;
}

export async function assertDictionaryInventorySynchronized(dataDirectory = DATA_DIRECTORY) {
  const expected = await buildDictionaryInventory(dataDirectory);
  const actual = JSON.parse(await readFile(new URL("dictionary-inventory.json", dataDirectory), "utf8"));
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error("dictionary-inventory.json désynchronisé : relancer la reconstruction ou node scripts/dictionary-inventory.mjs --write");
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [mode = "--check", ...extra] = process.argv.slice(2);
    if (extra.length || !["--check", "--write"].includes(mode)) {
      throw new Error("Usage: node scripts/dictionary-inventory.mjs [--check|--write]");
    }
    if (mode === "--write") await writeDictionaryInventory();
    else await assertDictionaryInventorySynchronized();
    console.log(`Inventaire des corpus ${mode === "--write" ? "actualisé" : "synchronisé"}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
