import dictionaryInventory from "./data/dictionary-inventory.json";
import suspendedDictionaryData from "./data/suspended-dictionaries.json";
import { normalizeWord } from "./generator";
import { createJsonResource } from "./json-resource";
import { RETIRED_DICTIONARY_IDS, recoverRetiredDictionaryAdditions } from "./retired-dictionaries";

export type Dictionary = {
  id: string;
  name: string;
  words: string[];
  wordCount?: number;
};

export type DictionaryExport = {
  version: 2;
  format: "atelier-des-mots:dictionary-backup";
  dictionaries: Dictionary[];
};

type LegacyDictionaryExport = {
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
    url: new URL("./data/dictionaries-primary.json", import.meta.url),
  },
  {
    ids: [
      "it-mots", "it-prenoms", "es-mots", "es-prenoms", "ru-mots-cyrillique",
      "ru-prenoms-cyrillique", "ru-mots-romanise", "ru-prenoms-romanise",
      "ru-rues-routes-romanise", "en-rues-routes",
    ],
    url: new URL("./data/dictionaries-secondary.json", import.meta.url),
  },
  {
    ids: [
      "fr-lieux-villes", "fr-lieux-villages", "fr-lieux-rivieres",
      "fr-lieux-fleuves", "fr-lieux-forets", "fr-lieux-montagnes",
      "fr-lieux-plages", "ru-lieux-localites-romanise", "en-lieux-villes",
      "hu-lieux-villes", "es-lieux-villes", "hu-rues-routes", "es-rues-routes",
    ],
    url: new URL("./data/place-dictionaries.json", import.meta.url),
  },
  {
    ids: ["fr-nature-mineraux"],
    url: new URL("./data/nature-dictionaries.json", import.meta.url),
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

function readDictionaryChunk(value: unknown): Dictionary[] {
  if (!Array.isArray(value) || value.some((item) =>
    !validDictionary(item) || item.words.some((word) => typeof word !== "string"),
  )) throw new Error("Le corpus téléchargé est invalide.");
  return value;
}

const loadDictionaryChunk = createJsonResource(readDictionaryChunk);

export async function loadInitialDictionaries(
  ids?: string[],
  load: (url: URL) => Promise<Dictionary[]> = loadDictionaryChunk,
): Promise<Dictionary[]> {
  const requestedIds = ids ? new Set(ids) : null;
  const chunks = INITIAL_DICTIONARY_CHUNKS.filter(
    ({ ids: chunkIds }) =>
      !requestedIds || chunkIds.some((id) => requestedIds.has(id)),
  );
  const loaded = await Promise.all(
    chunks.map(({ url }) => load(url)),
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

export function normalizeDictionaryWords(words: unknown, maximumLength = MAX_CUSTOM_DICTIONARY_WORD_LENGTH) {
  if (!Array.isArray(words)) return [];
  return Array.from(
    new Set(
      words
        .filter((word): word is string => typeof word === "string")
        .map(normalizeWord)
        .filter(
          (word) =>
            word.length >= 2 &&
            Array.from(word).length <= maximumLength,
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

// Reading historical storage must not apply limits introduced for new content.
export function sanitizeCustomDictionaries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(validDictionary).filter(({ id, name }) =>
    id.trim() && name.trim() &&
    !INITIAL_DICTIONARY_IDS.has(id) && !REMOVED_DICTIONARY_IDS.has(id),
  ).map(({ id, name, words }) => ({
    id, name, words: words.filter((word): word is string => typeof word === "string"),
  }));
}

export function readStoredDictionaries(value: unknown): Dictionary[] {
  if (!Array.isArray(value)) throw new Error("La sauvegarde des dictionnaires est invalide.");
  const ids = new Set<string>();
  for (const candidate of value) {
    if (!validDictionary(candidate) || !candidate.id.trim() || !candidate.name.trim() ||
        candidate.words.some((word) => typeof word !== "string") || ids.has(candidate.id)) {
      throw new Error("La sauvegarde contient un dictionnaire invalide ou un identifiant dupliqué.");
    }
    ids.add(candidate.id);
  }
  return sanitizeCustomDictionaries(value);
}

export function isDictionaryBackup(value: unknown): value is DictionaryExport | LegacyDictionaryExport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { version?: unknown; format?: unknown };
  // Before v2 introduced a format marker, the app exported { version: 1, dictionaries }.
  // Both formats preserve historical content; the importer still validates every entry.
  return candidate.version === 1 ||
    (candidate.version === 2 && candidate.format === "atelier-des-mots:dictionary-backup");
}

export function createDictionaryId(prefix: string, existingIds: Set<string>) {
  const base = `${prefix}-${Date.now()}`;
  let id = base;
  let suffix = 2;
  while (existingIds.has(id) || INITIAL_DICTIONARY_IDS.has(id) || REMOVED_DICTIONARY_IDS.has(id)) {
    id = `${base}-${suffix++}`;
  }
  return id;
}

export async function migrateLegacyDictionaries(
  value: unknown,
  initialDictionaries: Dictionary[] = [],
  recoverRetired = recoverRetiredDictionaryAdditions,
) {
  if (!Array.isArray(value)) return [];
  const migrated = sanitizeCustomDictionaries(value);
  const usedIds = new Set(migrated.map(({ id }) => id));
  const usedNames = new Set(
    migrated.map(({ name }) => name.toLocaleLowerCase("fr-FR")),
  );

  for (const candidate of value) {
    if (!validDictionary(candidate) ||
        (!INITIAL_DICTIONARY_IDS.has(candidate.id) && !RETIRED_DICTIONARY_IDS.has(candidate.id))) {
      continue;
    }
    const initial = initialDictionaries.find(({ id }) => id === candidate.id);
    const retired = SUSPENDED_DICTIONARIES.find(({ id }) => id === candidate.id);
    if (!initial && !retired) continue;
    const initialWords = new Set(initial?.words.map(normalizeWord));
    const additions = RETIRED_DICTIONARY_IDS.has(candidate.id)
      ? await recoverRetired(candidate)
      : Array.from(new Set(candidate.words
      .filter((word): word is string => typeof word === "string")
      .map(normalizeWord).filter((word) => word.length >= 2))).filter(
      (word) => !initialWords.has(word),
    );
    if (!additions.length) continue;

    let id = `dictionnaire-ajouts-migres-${candidate.id}`;
    let suffix = 2;
    while (usedIds.has(id) || INITIAL_DICTIONARY_IDS.has(id)) {
      id = `dictionnaire-ajouts-migres-${candidate.id}-${suffix}`;
      suffix += 1;
    }
    const sourceName = initial?.name ?? retired!.name;
    let name = `Ajouts · ${sourceName}`;
    suffix = 2;
    while (usedNames.has(name.toLocaleLowerCase("fr-FR"))) {
      name = `Ajouts · ${sourceName} (${suffix})`;
      suffix += 1;
    }
    migrated.push({ id, name, words: additions });
    usedIds.add(id);
    usedNames.add(name.toLocaleLowerCase("fr-FR"));
  }
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
  const backup = isDictionaryBackup(parsed);
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
  if (backup) readStoredDictionaries(raw);
  if (!backup && raw.length > 100) {
    throw new Error("Un fichier peut contenir au maximum 100 dictionnaires.");
  }
  let totalWords = 0;
  let rawWordCount = 0;
  raw.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error(`Le dictionnaire nº ${index + 1} est invalide. Aucun dictionnaire du fichier n’a été importé.`);
    }
    const value = candidate as Partial<Dictionary>;
    const name = typeof value.name === "string" ? (backup ? value.name : value.name.trim()) : "";
    if (!name.trim()) {
      throw new Error(`Le nom du dictionnaire nº ${index + 1} est invalide. Aucun dictionnaire du fichier n’a été importé.`);
    }
    if (!backup && name.length > 100) {
      throw new Error(`Le nom du dictionnaire nº ${index + 1} dépasse la limite de 100 caractères. Aucun dictionnaire du fichier n’a été importé.`);
    }
    if (!Array.isArray(value.words) || value.words.some((word) => typeof word !== "string")) {
      throw new Error(`« ${name} » contient une liste de mots invalide. Aucun dictionnaire du fichier n’a été importé.`);
    }
    if (!backup && value.words.length > 100_000) {
      throw new Error(`« ${name} » dépasse la limite de 100 000 mots.`);
    }
    if (
      !backup && value.words.some(
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
    rawWordCount += value.words.length;
    if (!backup && rawWordCount > 250_000) {
      throw new Error("L’import dépasse la limite cumulée de 250 000 mots.");
    }
    const words = backup ? [...value.words] : normalizeDictionaryWords(value.words);
    if (!backup && totalWords + words.length > 250_000) {
      throw new Error(
        "L’import dépasse la limite cumulée de 250 000 mots après normalisation.",
      );
    }
    totalWords += words.length;
    if (
      typeof value.id === "string" &&
      REMOVED_DICTIONARY_IDS.has(value.id.trim())
    ) {
      throw new Error(`Le dictionnaire « ${value.id.trim()} » a été retiré et ne peut pas être importé. Aucun dictionnaire du fichier n’a été importé.`);
    }

    let id = typeof value.id === "string" && value.id.trim() &&
      (backup || value.id.trim().length <= 120) ? (backup ? value.id : value.id.trim()) : "";
    if (!id || INITIAL_DICTIONARY_IDS.has(id) || existingIds.has(id)) {
      id = createDictionaryId("dictionnaire-importe", existingIds);
    }
    let resolvedName = name;
    let suffix = 2;
    while (existingNames.has(resolvedName.toLocaleLowerCase("fr-FR"))) {
      const label = ` (${suffix})`;
      const shortenedName = backup ? name : prefixByCodeUnits(name, 100 - label.length);
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
  readStoredDictionaries(dictionaries);
  const payload: DictionaryExport = {
    version: 2, format: "atelier-des-mots:dictionary-backup", dictionaries,
  };
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).byteLength > MAX_DICTIONARY_IMPORT_BYTES) {
    throw new Error("L’export dépasse la limite de 64 Mo et ne pourra pas être réimporté.");
  }
  return serialized;
}

export function editCustomDictionary(
  selected: Dictionary,
  nameInput: string,
  wordsInput: string,
  dictionaries: Dictionary[],
): Dictionary {
  const name = nameInput === selected.name ? selected.name : nameInput.trim();
  if (!name.trim()) throw new Error("Le nom du dictionnaire ne peut pas être vide.");
  if (name.length > Math.max(100, selected.name.length)) {
    throw new Error("Le nom du dictionnaire est limité à 100 caractères.");
  }
  const historicalWords = new Set(selected.words.map(normalizeWord));
  const rawWords = wordsInput.split(/[\n,;]+/);
  if (rawWords.some((word) => {
    const normalized = normalizeWord(word);
    return Array.from(normalized).length > MAX_CUSTOM_DICTIONARY_WORD_LENGTH && !historicalWords.has(normalized);
  })) throw new Error(`Chaque nouveau mot est limité à ${MAX_CUSTOM_DICTIONARY_WORD_LENGTH} lettres.`);
  const words = wordsInput === selected.words.join("\n")
    ? selected.words : normalizeDictionaryWords(rawWords, Infinity);
  if (words.length > Math.max(100_000, selected.words.length)) {
    throw new Error("Le dictionnaire est limité à 100 000 mots ; les mots historiques peuvent être conservés.");
  }
  const total = dictionaries.reduce((count, dictionary) => count + dictionary.words.length, 0);
  if (total - selected.words.length + words.length > Math.max(250_000, total)) {
    throw new Error("Les dictionnaires personnalisés sont limités à 250 000 mots cumulés.");
  }
  return { ...selected, name, words };
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
