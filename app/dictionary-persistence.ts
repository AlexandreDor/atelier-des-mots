import {
  CUSTOM_DICTIONARIES_KEY,
  LEGACY_DICTIONARIES_KEY,
  INITIAL_DICTIONARY_IDS,
  loadInitialDictionaries,
  migrateLegacyDictionaries,
  readStoredDictionaries,
  type Dictionary,
} from "./dictionaries";
import { recoverRetiredDictionaryAdditions } from "./retired-dictionaries";

export type DictionaryStorage = Pick<Storage, "getItem" | "setItem">;
export type DictionaryPersistenceSnapshot = {
  dictionaries: Dictionary[];
  initial: Dictionary[];
  ready: boolean;
  loadError: string;
  writeError: string;
};

// The same controller is used by the hook and storage regression tests.
export function createDictionaryPersistence(
  storage: DictionaryStorage,
  loadInitial = loadInitialDictionaries,
  recoverRetired = recoverRetiredDictionaryAdditions,
) {
  let snapshot: DictionaryPersistenceSnapshot = {
    dictionaries: [], initial: [], ready: false, loadError: "", writeError: "",
  };
  let saved = "";
  return {
    async load({ isCurrent = () => true }: { isCurrent?: () => boolean } = {}): Promise<DictionaryPersistenceSnapshot> {
      snapshot = { ...snapshot, ready: false, loadError: "", writeError: "" };
      try {
        const current = storage.getItem(CUSTOM_DICTIONARIES_KEY);
        if (current !== null) {
          const dictionaries = readStoredDictionaries(JSON.parse(current));
          saved = JSON.stringify(dictionaries);
          snapshot = { ...snapshot, dictionaries, ready: true };
        } else {
          const legacy = storage.getItem(LEGACY_DICTIONARIES_KEY);
          if (legacy === null) {
            saved = "[]";
            snapshot = { ...snapshot, dictionaries: [], ready: true };
          } else {
            const parsed: unknown = JSON.parse(legacy);
            readStoredDictionaries(parsed); // Reject partial/corrupt reads before migration.
            const requiredIds = (parsed as Dictionary[])
              .map(({ id }) => id).filter((id) => INITIAL_DICTIONARY_IDS.has(id));
            const initial = requiredIds.length ? await loadInitial(requiredIds) : [];
            // Another tab or a newer mount may have completed migration while
            // this load awaited corpus data or membership hashes. Check both
            // asynchronous boundaries before accepting a migration result.
            const superseded = () => {
              if (!isCurrent()) return true;
              const newer = storage.getItem(CUSTOM_DICTIONARIES_KEY);
              if (newer === null) return false;
              const dictionaries = readStoredDictionaries(JSON.parse(newer));
              saved = JSON.stringify(dictionaries);
              snapshot = { ...snapshot, dictionaries, initial, ready: true };
              return true;
            };
            if (superseded()) return snapshot;
            if ((parsed as Dictionary[]).some(({ id }) =>
              INITIAL_DICTIONARY_IDS.has(id) && !initial.some((dictionary) => dictionary.id === id),
            )) throw new Error("Un corpus nécessaire à la migration est indisponible.");
            const dictionaries = await migrateLegacyDictionaries(parsed, initial, recoverRetired);
            if (superseded()) return snapshot;
            if (storage.getItem(LEGACY_DICTIONARIES_KEY) !== legacy) {
              throw new Error("La sauvegarde historique a changé pendant la migration.");
            }
            snapshot = { ...snapshot, dictionaries, initial };
            const serialized = JSON.stringify(dictionaries);
            try {
              storage.setItem(CUSTOM_DICTIONARIES_KEY, serialized);
              // Keep v1 as a recoverable backup, including when quota is exhausted.
              saved = serialized;
              snapshot = { ...snapshot, ready: true };
            } catch {
              snapshot = { ...snapshot, writeError: "Les dictionnaires locaux migrés n’ont pas pu être enregistrés." };
            }
          }
        }
      } catch {
        snapshot = { ...snapshot, loadError: "Les dictionnaires locaux n’ont pas pu être chargés." };
      }
      return snapshot;
    },
    save(dictionaries: Dictionary[]): DictionaryPersistenceSnapshot {
      if (!snapshot.ready) return snapshot;
      try {
        readStoredDictionaries(dictionaries);
        const serialized = JSON.stringify(dictionaries);
        if (serialized !== saved) {
          storage.setItem(CUSTOM_DICTIONARIES_KEY, serialized);
          saved = serialized;
        }
        snapshot = { ...snapshot, dictionaries, writeError: "" };
      } catch {
        snapshot = { ...snapshot, dictionaries, writeError: "Les dictionnaires locaux n’ont pas pu être enregistrés." };
      }
      return snapshot;
    },
  };
}
