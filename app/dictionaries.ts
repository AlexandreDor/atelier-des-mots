import dictionaryInventory from "./data/dictionary-inventory.json";
import suspendedDictionaryData from "./data/suspended-dictionaries.json";
import { normalizeWord } from "./generator";

export type Dictionary = {
  id: string;
  name: string;
  words: string[];
  wordCount?: number;
};

export type DictionaryExport = {
  version: 1;
  dictionaries: Dictionary[];
};

export type SuspendedDictionary = Omit<Dictionary, "words"> & {
  wordCount?: number;
  status: "suspended";
  suspensionReason: string;
  source?: string;
  sourceUrl?: string;
  license?: string;
  licenseUrl?: string;
  usageRestriction?: string;
};

export const LEGACY_DICTIONARIES_KEY = "atelier-des-mots:dictionaries:v1";
export const SUSPENDED_DICTIONARIES =
  suspendedDictionaryData as SuspendedDictionary[];
export const CUSTOM_DICTIONARIES_KEY =
  "atelier-des-mots:custom-dictionaries:v2";
export const MAX_DICTIONARY_IMPORT_BYTES = 64 * 1024 * 1024;
export const MAX_CUSTOM_DICTIONARY_WORD_LENGTH = 60;
export const REMOVED_DICTIONARY_IDS = new Set([
  "francais",
  "botanique",
  "matiere",
  "en-mots",
]);
const INITIAL_DICTIONARY_ID_LIST = [
  "fr-mots",
  "fr-prenoms",
  "en-prenoms",
  "de-mots",
  "de-prenoms",
  "ja-mots-romaji",
  "ja-prenoms-romaji",
  "it-mots",
  "it-prenoms",
  "es-mots",
  "es-prenoms",
  "ru-mots-cyrillique",
  "ru-prenoms-cyrillique",
  "ru-mots-romanise",
  "ru-prenoms-romanise",
  "ru-rues-routes-romanise",
  "en-rues-routes",
  "fr-lieux-villes",
  "fr-lieux-villages",
  "fr-lieux-rivieres",
  "fr-lieux-fleuves",
  "fr-lieux-forets",
  "fr-lieux-montagnes",
  "fr-lieux-plages",
  "ru-lieux-localites-romanise",
  "en-lieux-villes",
  "hu-lieux-villes",
  "es-lieux-villes",
  "hu-rues-routes",
  "es-rues-routes",
  "fr-nature-mineraux",
];
export const INITIAL_DICTIONARY_IDS = new Set(INITIAL_DICTIONARY_ID_LIST);
export const DEFAULT_ANALYSIS_DICTIONARY_IDS = [
  "fr-mots",
  "de-mots",
  "ja-mots-romaji",
  "it-mots",
  "es-mots",
  "ru-mots-cyrillique",
];

const INITIAL_DICTIONARY_CHUNKS = [
  {
    ids: [
      "fr-mots", "fr-prenoms", "en-prenoms", "de-mots", "de-prenoms",
      "ja-mots-romaji", "ja-prenoms-romaji",
    ],
    load: () => import("./data/dictionaries-primary.json"),
  },
  {
    ids: [
      "it-mots", "it-prenoms", "es-mots", "es-prenoms", "ru-mots-cyrillique",
      "ru-prenoms-cyrillique", "ru-mots-romanise", "ru-prenoms-romanise",
      "ru-rues-routes-romanise", "en-rues-routes",
    ],
    load: () => import("./data/dictionaries-secondary.json"),
  },
  {
    ids: [
      "fr-lieux-villes", "fr-lieux-villages", "fr-lieux-rivieres",
      "fr-lieux-fleuves", "fr-lieux-forets", "fr-lieux-montagnes",
      "fr-lieux-plages", "ru-lieux-localites-romanise", "en-lieux-villes",
      "hu-lieux-villes", "es-lieux-villes", "hu-rues-routes", "es-rues-routes",
    ],
    load: () => import("./data/place-dictionaries.json"),
  },
  {
    ids: ["fr-nature-mineraux"],
    load: () => import("./data/nature-dictionaries.json"),
  },
] as const;

type DictionaryInventory = {
  active: Array<Pick<Dictionary, "id" | "name"> & { wordCount: number }>;
};

export function loadDictionaryInventory(): Dictionary[] {
  return (dictionaryInventory as DictionaryInventory).active
    .filter(({ id }) => !REMOVED_DICTIONARY_IDS.has(id))
    .map(({ id, name, wordCount }) => ({ id, name, wordCount, words: [] }));
}

export async function loadInitialDictionaries(ids?: string[]): Promise<Dictionary[]> {
  const requestedIds = ids ? new Set(ids) : null;
  const chunks = INITIAL_DICTIONARY_CHUNKS.filter(
    ({ ids: chunkIds }) =>
      !requestedIds || chunkIds.some((id) => requestedIds.has(id)),
  );
  const loaded = await Promise.all(
    chunks.map(async ({ load }) => (await load()).default as Dictionary[]),
  );
  const selectedIds = requestedIds ?? INITIAL_DICTIONARY_IDS;
  return loaded
    .flat()
    .filter(
      (item) =>
        !REMOVED_DICTIONARY_IDS.has(item.id) && selectedIds.has(item.id),
    );
}
const fingerprintCache = new WeakMap<string[], string>();

export function isFirstNameDictionary(dictionary: Dictionary) {
  return /(?:^|-)(?:prenoms?|prénoms?)(?:-|$)/i.test(
    `${dictionary.id}-${dictionary.name}`,
  );
}

export function isPlaceDictionary(dictionary: Dictionary) {
  return (
    dictionary.id.includes("-lieux-") ||
    dictionary.id.includes("-rues-routes")
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
        .filter(
          (word) =>
            word.length >= 2 &&
            Array.from(word).length <= MAX_CUSTOM_DICTIONARY_WORD_LENGTH,
        ),
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

function prefixByCodeUnits(value: string, maximum: number) {
  let prefix = "";
  for (const character of value) {
    if (prefix.length + character.length > maximum) break;
    prefix += character;
  }
  return prefix;
}

export function sanitizeCustomDictionaries(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const sanitized: Dictionary[] = [];
  let totalWords = 0;

  for (const candidate of value.slice(0, 100)) {
    if (!validDictionary(candidate)) continue;
    const id = candidate.id.trim();
    const name = candidate.name.trim();
    const normalizedName = name.toLocaleLowerCase("fr-FR");
    if (
      !id ||
      !name ||
      id.length > 120 ||
      name.length > 100 ||
      INITIAL_DICTIONARY_IDS.has(id) ||
      REMOVED_DICTIONARY_IDS.has(id) ||
      seenIds.has(id) ||
      seenNames.has(normalizedName)
    ) {
      continue;
    }
    if (
      candidate.words.length > 100_000 ||
      totalWords + candidate.words.length > 250_000
    ) {
      continue;
    }
    const words = normalizeDictionaryWords(candidate.words);
    if (words.length > 100_000 || totalWords + words.length > 250_000) continue;
    sanitized.push({
      id,
      name,
      words,
    });
    totalWords += words.length;
    seenIds.add(id);
    seenNames.add(normalizedName);
  }
  return sanitized;
}

export function migrateLegacyDictionaries(
  value: unknown,
  initialDictionaries: Dictionary[] = [],
) {
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
    const initial = initialDictionaries.find(({ id }) => id === candidate.id);
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
  if (new TextEncoder().encode(text).byteLength > MAX_DICTIONARY_IMPORT_BYTES) {
    throw new Error("Le fichier dépasse la limite de 64 Mo.");
  }
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
  if (raw.length > 100) {
    throw new Error("Un fichier peut contenir au maximum 100 dictionnaires.");
  }
  let totalWords = 0;
  raw.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return;
    const value = candidate as Partial<Dictionary>;
    const name = typeof value.name === "string" ? value.name.trim() : "";
    if (!name || name.length > 100 || !Array.isArray(value.words)) return;
    if (value.words.length > 100_000) {
      throw new Error(`« ${name} » dépasse la limite de 100 000 mots.`);
    }
    if (
      value.words.some(
        (word) =>
          typeof word === "string" &&
          Array.from(normalizeWord(word)).length >
            MAX_CUSTOM_DICTIONARY_WORD_LENGTH,
      )
    ) {
      throw new Error(
        `« ${name} » contient un mot de plus de ${MAX_CUSTOM_DICTIONARY_WORD_LENGTH} lettres.`,
      );
    }
    if (totalWords + value.words.length > 250_000) {
      throw new Error("L’import dépasse la limite cumulée de 250 000 mots.");
    }
    const words = normalizeDictionaryWords(value.words);
    if (totalWords + words.length > 250_000) {
      throw new Error(
        "L’import dépasse la limite cumulée de 250 000 mots après normalisation.",
      );
    }
    totalWords += words.length;
    if (
      typeof value.id === "string" &&
      REMOVED_DICTIONARY_IDS.has(value.id.trim())
    ) {
      return;
    }

    let id =
      typeof value.id === "string" && value.id.trim().length <= 120
        ? value.id.trim()
        : `dictionnaire-importe-${Date.now()}-${index + 1}`;
    if (INITIAL_DICTIONARY_IDS.has(id) || existingIds.has(id)) {
      id = `dictionnaire-importe-${Date.now()}-${index + 1}`;
    }
    let resolvedName = name;
    let suffix = 2;
    while (existingNames.has(resolvedName.toLocaleLowerCase("fr-FR"))) {
      const label = ` (${suffix})`;
      const shortenedName = prefixByCodeUnits(name, 100 - label.length);
      resolvedName = `${shortenedName}${label}`;
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

export function serializeDictionaryExport(dictionaries: Dictionary[]) {
  const serialized = JSON.stringify({ version: 1, dictionaries });
  if (new TextEncoder().encode(serialized).byteLength > MAX_DICTIONARY_IMPORT_BYTES) {
    throw new Error("L’export dépasse la limite de 64 Mo et ne pourra pas être réimporté.");
  }
  return serialized;
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
