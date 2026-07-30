"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CUSTOM_DICTIONARIES_KEY,
  INITIAL_DICTIONARIES,
  LEGACY_DICTIONARIES_KEY,
  migrateLegacyDictionaries,
  sanitizeCustomDictionaries,
  type Dictionary,
} from "./dictionaries";

export function useDictionaries() {
  const [customDictionaries, setCustomDictionaries] = useState<Dictionary[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    let custom: Dictionary[] = [];
    let error = "";
    try {
      const current = window.localStorage.getItem(CUSTOM_DICTIONARIES_KEY);
      const legacy = window.localStorage.getItem(LEGACY_DICTIONARIES_KEY);
      const stored = current ?? legacy;
      const parsed = stored ? (JSON.parse(stored) as unknown) : [];
      custom = current
        ? sanitizeCustomDictionaries(parsed)
        : migrateLegacyDictionaries(parsed);
      if (!current && legacy) {
        window.localStorage.setItem(
          CUSTOM_DICTIONARIES_KEY,
          JSON.stringify(custom),
        );
        window.localStorage.removeItem(LEGACY_DICTIONARIES_KEY);
      }
    } catch {
      error = "Les dictionnaires locaux n’ont pas pu être chargés.";
    }
    const timeout = window.setTimeout(() => {
      setCustomDictionaries(custom);
      setStorageError(error);
      setIsLoaded(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    let error = "";
    try {
      window.localStorage.setItem(
        CUSTOM_DICTIONARIES_KEY,
        JSON.stringify(customDictionaries),
      );
    } catch {
      error = "Les dictionnaires locaux n’ont pas pu être enregistrés.";
    }
    const timeout = window.setTimeout(() => setStorageError(error), 0);
    return () => window.clearTimeout(timeout);
  }, [customDictionaries, isLoaded]);

  const dictionaries = useMemo(
    () => [...INITIAL_DICTIONARIES, ...customDictionaries],
    [customDictionaries],
  );

  return {
    dictionaries,
    customDictionaries,
    setCustomDictionaries,
    isLoaded,
    storageError,
  };
}
