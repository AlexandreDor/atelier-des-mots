import { normalizeWord } from "./generator";
import { createJsonResource } from "./json-resource";

type RetiredBaseline = {
  id: string;
  name: string;
  algorithm: "SHA-256";
  wordCount: number;
  wordFingerprints: string[];
};

export const RETIRED_DICTIONARY_IDS = new Set(["en-mots"]);
const baselineUrl = new URL("./data/retired-dictionary-fingerprints.json", import.meta.url);

export function readRetiredBaselines(value: unknown): RetiredBaseline[] {
  if (!Array.isArray(value) || value.some((item) =>
    !item || typeof item !== "object" ||
    !RETIRED_DICTIONARY_IDS.has(item.id) || typeof item.name !== "string" ||
    item.algorithm !== "SHA-256" || !Number.isSafeInteger(item.wordCount) ||
    !Array.isArray(item.wordFingerprints) || item.wordFingerprints.length !== item.wordCount ||
    item.wordFingerprints.some((hash: unknown) => typeof hash !== "string" || !/^[a-f0-9]{64}$/u.test(hash)) ||
    new Set(item.wordFingerprints).size !== item.wordCount,
  )) throw new Error("Les empreintes du corpus historique sont invalides.");
  if (new Set(value.map(({ id }) => id)).size !== value.length ||
      [...RETIRED_DICTIONARY_IDS].some((id) => !value.some((item) => item.id === id))) {
    throw new Error("Les empreintes du corpus historique sont incomplètes.");
  }
  return value;
}

const loadBaselines = createJsonResource(readRetiredBaselines);

export function createRetiredDictionaryRecovery(
  load: (url: URL) => Promise<RetiredBaseline[]> = loadBaselines,
) {
  return async (dictionary: { id: string; words: string[] }) => {
    if (!RETIRED_DICTIONARY_IDS.has(dictionary.id)) return [];
    const baseline = (await load(baselineUrl)).find(({ id }) => id === dictionary.id);
    if (!baseline) throw new Error("Les empreintes du corpus historique sont indisponibles.");
    const fingerprints = new Set(baseline.wordFingerprints);
    const words = Array.from(new Set(dictionary.words.map(normalizeWord).filter((word) => word.length >= 2)));
    const additions: string[] = [];
    const encoder = new TextEncoder();
    // Bound concurrent Web Crypto operations for large historical collections.
    for (let offset = 0; offset < words.length; offset += 128) {
      const batch = words.slice(offset, offset + 128);
      const hashes = await Promise.all(batch.map(async (word) => {
        const digest = await crypto.subtle.digest("SHA-256", encoder.encode(word));
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      }));
      batch.forEach((word, index) => {
        if (!fingerprints.has(hashes[index])) additions.push(word);
      });
    }
    return additions;
  };
}

export const recoverRetiredDictionaryAdditions = createRetiredDictionaryRecovery();
