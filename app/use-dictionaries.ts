"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CUSTOM_DICTIONARIES_KEY,
  LEGACY_DICTIONARIES_KEY,
  loadDictionaryInventory,
  loadInitialDictionaries,
  migrateLegacyDictionaries,
  sanitizeCustomDictionaries,
  type Dictionary,
} from "./dictionaries";
import { writeLocalStorage } from "./persistence";

export function useDictionaries() {
  const [initialDictionaries, setInitialDictionaries] = useState<Dictionary[]>(
    loadDictionaryInventory,
  );
  const [customDictionaries, setCustomDictionaries] = useState<Dictionary[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let initial: Dictionary[] = [];
      let custom: Dictionary[] = [];
      let error = "";
      try {
        const current = window.localStorage.getItem(CUSTOM_DICTIONARIES_KEY);
        const legacy = window.localStorage.getItem(LEGACY_DICTIONARIES_KEY);
        const stored = current ?? legacy;
        const parsed = stored ? (JSON.parse(stored) as unknown) : [];
        if (!current && legacy) initial = await loadInitialDictionaries();
        custom = current
          ? sanitizeCustomDictionaries(parsed)
          : migrateLegacyDictionaries(parsed, initial);
        if (!current && legacy) {
          try {
            window.localStorage.setItem(
              CUSTOM_DICTIONARIES_KEY,
              JSON.stringify(custom),
            );
            window.localStorage.removeItem(LEGACY_DICTIONARIES_KEY);
          } catch {
            error = "Les dictionnaires locaux migrés n’ont pas pu être enregistrés.";
          }
        }
      } catch {
        error = "Les dictionnaires locaux n’ont pas pu être chargés.";
      }
      if (cancelled) return;
      if (initial.length) {
        const loadedById = new Map(
          initial.map((dictionary) => [dictionary.id, dictionary]),
        );
        setInitialDictionaries((current) =>
          current.map((dictionary) => loadedById.get(dictionary.id) ?? dictionary),
        );
      }
      setCustomDictionaries(custom);
      setStorageError(error);
      setIsLoaded(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureDictionariesLoaded = useCallback(
    async (ids: string[]) => {
      const requested = Array.from(new Set(ids));
      const loaded = await loadInitialDictionaries(requested);
      const loadedById = new Map(loaded.map((dictionary) => [dictionary.id, dictionary]));
      setInitialDictionaries((current) =>
        current.map((dictionary) => loadedById.get(dictionary.id) ?? dictionary),
      );
      return loaded;
    },
    [],
  );

  useEffect(() => {
    if (!isLoaded) return;
    const error = writeLocalStorage(
      CUSTOM_DICTIONARIES_KEY,
      JSON.stringify(customDictionaries),
    ) ? "" : "Les dictionnaires locaux n’ont pas pu être enregistrés.";
    const timeout = window.setTimeout(() => setStorageError(error), 0);
    return () => window.clearTimeout(timeout);
  }, [customDictionaries, isLoaded]);

  const dictionaries = useMemo(
    () => [...initialDictionaries, ...customDictionaries],
    [initialDictionaries, customDictionaries],
  );

  return {
    dictionaries,
    customDictionaries,
    setCustomDictionaries,
    ensureDictionariesLoaded,
    isLoaded,
    storageError,
  };
}
