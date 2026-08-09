import primaryDictionaryData from "./data/dictionaries-primary.json";
import secondaryDictionaryData from "./data/dictionaries-secondary.json";
import natureDictionaryData from "./data/nature-dictionaries.json";
import placeDictionaryData from "./data/place-dictionaries.json";
import { normalizeWord } from "./generator";

export type Dictionary = {
  id: string;
  name: string;
  words: string[];
};

export type DictionaryExport = {
  version: 1;
  dictionaries: Dictionary[];
};

export const LEGACY_DICTIONARIES_KEY = "atelier-des-mots:dictionaries:v1";
export const CUSTOM_DICTIONARIES_KEY =
  "atelier-des-mots:custom-dictionaries:v2";
export const REMOVED_DICTIONARY_IDS = new Set([
  "francais",
  "botanique",
  "matiere",
]);
export const INITIAL_DICTIONARIES = [
  ...(primaryDictionaryData as Dictionary[]),
  ...(secondaryDictionaryData as Dictionary[]),
  ...(placeDictionaryData as Dictionary[]),
  ...(natureDictionaryData as Dictionary[]),
];
export const INITIAL_DICTIONARY_IDS = new Set(
  INITIAL_DICTIONARIES.map((dictionary) => dictionary.id),
);
const fingerprintCache = new WeakMap<string[], string>();

export function isFirstNameDictionary(dictionary: Dictionary) {
  return /(?:^|-)(?:prenoms?|prénoms?)(?:-|$)/i.test(
    `${dictionary.id}-${dictionary.name}`,
  );
}

export function isPlaceDictionary(dictionary: Dictionary) {
  return (
    dictionary.id.startsWith("fr-lieux-") ||
    dictionary.id.startsWith("ru-lieux-") ||
    dictionary.id === "ru-rues-routes-romanise"
  );
}

export function isNatureDictionary(dictionary: Dictionary) {
  return dictionary.id.startsWith("fr-nature-");
}

export function normalizeDictionaryWords(words: unknown) {
  if (!Array.isArray(words)) return [];
  return Array.from(
    new Set(
      words
        .filter((word): word is string => typeof word === "string")
        .map(normalizeWord)
        .filter((word) => word.length >= 2),
    ),
  );
}

function validDictionary(value: unknown): value is Dictionary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Dictionary>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    Array.isArray(candidate.words)
  );
}

export function sanitizeCustomDictionaries(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const sanitized: Dictionary[] = [];

  for (const candidate of value.slice(0, 100)) {
    if (!validDictionary(candidate)) continue;
    const id = candidate.id.trim();
    const name = candidate.name.trim();
    const normalizedName = name.toLocaleLowerCase("fr-FR");
    if (
      !id ||
      !name ||
      INITIAL_DICTIONARY_IDS.has(id) ||
      REMOVED_DICTIONARY_IDS.has(id) ||
      seenIds.has(id) ||
      seenNames.has(normalizedName)
    ) {
      continue;
    }
    sanitized.push({
      id,
      name,
      words: normalizeDictionaryWords(candidate.words).slice(0, 100_000),
    });
    seenIds.add(id);
    seenNames.add(normalizedName);
  }
  return sanitized;
}

export function migrateLegacyDictionaries(value: unknown) {
  if (!Array.isArray(value)) return [];
  const migrated = sanitizeCustomDictionaries(value);
  const usedIds = new Set(migrated.map(({ id }) => id));
  const usedNames = new Set(
    migrated.map(({ name }) => name.toLocaleLowerCase("fr-FR")),
  );

  value.forEach((candidate) => {
    if (!validDictionary(candidate) || !INITIAL_DICTIONARY_IDS.has(candidate.id)) {
      return;
    }
    const initial = INITIAL_DICTIONARIES.find(({ id }) => id === candidate.id);
    if (!initial) return;
    const initialWords = new Set(initial.words.map(normalizeWord));
    const additions = normalizeDictionaryWords(candidate.words).filter(
      (word) => !initialWords.has(word),
    );
    if (!additions.length) return;

    let id = `dictionnaire-ajouts-migres-${candidate.id}`;
    let suffix = 2;
    while (usedIds.has(id) || INITIAL_DICTIONARY_IDS.has(id)) {
      id = `dictionnaire-ajouts-migres-${candidate.id}-${suffix}`;
      suffix += 1;
    }
    let name = `Ajouts · ${initial.name}`;
    suffix = 2;
    while (usedNames.has(name.toLocaleLowerCase("fr-FR"))) {
      name = `Ajouts · ${initial.name} (${suffix})`;
      suffix += 1;
    }
    migrated.push({ id, name, words: additions });
    usedIds.add(id);
    usedNames.add(name.toLocaleLowerCase("fr-FR"));
  });
  return migrated;
}

export function parseDictionaryImport(
  text: string,
  existingDictionaries: Dictionary[],
) {
  const parsed = JSON.parse(text) as unknown;
  const raw = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && "dictionaries" in parsed
      ? (parsed as { dictionaries: unknown }).dictionaries
      : null;
  if (!Array.isArray(raw)) {
    throw new Error("Le fichier ne contient aucune liste de dictionnaires.");
  }

  const existingIds = new Set(existingDictionaries.map(({ id }) => id));
  const existingNames = new Set(
    existingDictionaries.map(({ name }) => name.toLocaleLowerCase("fr-FR")),
  );
  const imported: Dictionary[] = [];
  raw.slice(0, 100).forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return;
    const value = candidate as Partial<Dictionary>;
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const words = normalizeDictionaryWords(value.words).slice(0, 100_000);
    if (!name || !Array.isArray(value.words)) return;
    if (
      typeof value.id === "string" &&
      REMOVED_DICTIONARY_IDS.has(value.id.trim())
    ) {
      return;
    }

    let id =
      typeof value.id === "string" && value.id.trim()
        ? value.id.trim()
        : `dictionnaire-importe-${Date.now()}-${index + 1}`;
    if (INITIAL_DICTIONARY_IDS.has(id) || existingIds.has(id)) {
      id = `dictionnaire-importe-${Date.now()}-${index + 1}`;
    }
    let resolvedName = name;
    let suffix = 2;
    while (existingNames.has(resolvedName.toLocaleLowerCase("fr-FR"))) {
      resolvedName = `${name} (${suffix})`;
      suffix += 1;
    }
    existingIds.add(id);
    existingNames.add(resolvedName.toLocaleLowerCase("fr-FR"));
    imported.push({ id, name: resolvedName, words });
  });

  if (!imported.length) {
    throw new Error("Aucun dictionnaire valide n’a été trouvé.");
  }
  return imported;
}

export function dictionaryFingerprint(dictionary: Dictionary) {
  const cached = fingerprintCache.get(dictionary.words);
  if (cached) return cached;
  let hash = 2166136261;
  for (const word of dictionary.words) {
    for (const character of word) {
      hash ^= character.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 0;
    hash = Math.imul(hash, 16777619);
  }
  const fingerprint = `${dictionary.words.length}:${(hash >>> 0).toString(36)}`;
  fingerprintCache.set(dictionary.words, fingerprint);
  return fingerprint;
}
