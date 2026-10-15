import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { withDictionaryDataLock } from "./dictionary-data-lock.mjs";

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
async function readDictionaryCollections(dataDirectory) {
  const files = [...ACTIVE_DICTIONARY_FILES, "suspended-dictionaries.json"];
  return Object.fromEntries(await Promise.all(files.map(async (file) => {
    const dictionaries = JSON.parse(await readFile(new URL(file, dataDirectory), "utf8"));
    if (!Array.isArray(dictionaries)) throw new Error(`${file} : liste de corpus attendue`);
    return [file, dictionaries];
  })));
}

function inventoryFromCollections(collections) {
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
  const active = ACTIVE_DICTIONARY_FILES.flatMap((file) => collections[file]).map((dictionary) => {
    validateMetadata(dictionary);
    requireStrings(dictionary, ["accessedAt", "transformations", "licenseReviewedAt"]);
    if (dictionary.status === "suspended") throw new Error(`${dictionary.id} : corpus suspendu dans les données actives`);
    if (!Array.isArray(dictionary.words) || dictionary.words.some((word) => typeof word !== "string")) {
      throw new Error(`${dictionary.id} : lexique invalide`);
    }
    const { words, ...metadata } = dictionary;
    return { ...metadata, wordCount: words.length };
  });
  const suspended = collections["suspended-dictionaries.json"].map((dictionary) => {
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

async function publishJsonFiles(files, dataDirectory) {
  const staged = [];
  try {
    // Stage everything before replacing a corpus. Readers never see truncated
    // JSON, and validation/serialization failures leave the previous files intact.
    for (const [file, value] of Object.entries(files)) {
      const target = new URL(file, dataDirectory);
      const temporary = new URL(`.${file}-${randomUUID()}.tmp`, dataDirectory);
      staged.push({ target, temporary });
      await writeFile(temporary, `${JSON.stringify(value)}\n`, { flag: "wx" });
    }
    for (const { target, temporary } of staged) await rename(temporary, target);
  } finally {
    await Promise.all(staged.map(({ temporary }) => rm(temporary, { force: true })));
  }
}

// Compute source-derived words outside the lock, then merge them into the most
// recent corpus here. Locking only inventory publication would still lose other
// builders' changes to a shared file and allow stale inventory snapshots.
export async function updateDictionaryCorpora(update, dataDirectory = DATA_DIRECTORY) {
  return withDictionaryDataLock(async () => {
    const collections = await readDictionaryCollections(dataDirectory);
    const updated = await update(collections);
    for (const [file, dictionaries] of Object.entries(updated)) {
      if (!ACTIVE_DICTIONARY_FILES.includes(file)) {
        throw new Error(`Mise à jour de corpus invalide : ${file}`);
      }
      if (!Array.isArray(dictionaries)) throw new Error(`${file} : liste de corpus attendue`);
      collections[file] = dictionaries;
    }
    const inventory = inventoryFromCollections(collections);
    await publishJsonFiles({ ...updated, "dictionary-inventory.json": inventory }, dataDirectory);
    return updated;
  }, dataDirectory);
}

export async function buildDictionaryInventory(dataDirectory = DATA_DIRECTORY) {
  return withDictionaryDataLock(async () =>
    inventoryFromCollections(await readDictionaryCollections(dataDirectory)), dataDirectory);
}

export async function writeDictionaryInventory(dataDirectory = DATA_DIRECTORY) {
  return withDictionaryDataLock(async () => {
    const inventory = inventoryFromCollections(await readDictionaryCollections(dataDirectory));
    await publishJsonFiles({ "dictionary-inventory.json": inventory }, dataDirectory);
    return inventory;
  }, dataDirectory);
}

export async function assertDictionaryInventorySynchronized(dataDirectory = DATA_DIRECTORY) {
  return withDictionaryDataLock(async () => {
    const expected = inventoryFromCollections(await readDictionaryCollections(dataDirectory));
    const actual = JSON.parse(await readFile(new URL("dictionary-inventory.json", dataDirectory), "utf8"));
    if (!isDeepStrictEqual(actual, expected)) {
      throw new Error("dictionary-inventory.json désynchronisé : relancer la reconstruction ou node scripts/dictionary-inventory.mjs --write");
    }
  }, dataDirectory);
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
