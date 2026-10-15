"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import {
  loadDictionaryInventory,
  loadInitialDictionaries,
  type Dictionary,
} from "./dictionaries";
import { createDictionaryPersistence, type DictionaryPersistenceSnapshot } from "./dictionary-persistence";

export function useDictionaries() {
  const [initialDictionaries, setInitialDictionaries] = useState<Dictionary[]>(loadDictionaryInventory);
  const [customDictionaries, updateCustomDictionaries] = useState<Dictionary[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [retry, setRetry] = useState(0);
  const persistence = useRef<ReturnType<typeof createDictionaryPersistence> | null>(null);
  const customRef = useRef<Dictionary[]>([]);

  const applySnapshot = useCallback((snapshot: DictionaryPersistenceSnapshot) => {
    customRef.current = snapshot.dictionaries;
    updateCustomDictionaries(snapshot.dictionaries);
    setCanEdit(snapshot.ready);
    setStorageError(snapshot.loadError || snapshot.writeError);
    setIsLoaded(true);
    if (snapshot.initial.length) {
      const byId = new Map(snapshot.initial.map((dictionary) => [dictionary.id, dictionary]));
      setInitialDictionaries((current) => current.map((dictionary) => byId.get(dictionary.id) ?? dictionary));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const controller = createDictionaryPersistence(window.localStorage);
        persistence.current = controller;
        const snapshot = await controller.load({ isCurrent: () => !cancelled });
        if (!cancelled) applySnapshot(snapshot);
      } catch {
        if (!cancelled) {
          setStorageError("Les dictionnaires locaux n’ont pas pu être chargés.");
          setCanEdit(false);
          setIsLoaded(true);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [applySnapshot, retry]);

  const setCustomDictionaries = useCallback((action: SetStateAction<Dictionary[]>) => {
    if (!canEdit || !persistence.current) return;
    const next = typeof action === "function" ? action(customRef.current) : action;
    applySnapshot(persistence.current.save(next));
  }, [applySnapshot, canEdit]);

  const retryStorage = useCallback(() => {
    if (canEdit && persistence.current) {
      applySnapshot(persistence.current.save(customRef.current));
      return;
    }
    setCanEdit(false);
    setIsLoaded(false);
    setRetry((current) => current + 1);
  }, [applySnapshot, canEdit]);

  const ensureDictionariesLoaded = useCallback(async (ids: string[]) => {
    const loaded = await loadInitialDictionaries(Array.from(new Set(ids)));
    const byId = new Map(loaded.map((dictionary) => [dictionary.id, dictionary]));
    setInitialDictionaries((current) => current.map((dictionary) => byId.get(dictionary.id) ?? dictionary));
    return loaded;
  }, []);

  const dictionaries = useMemo(() => [...initialDictionaries, ...customDictionaries], [initialDictionaries, customDictionaries]);
  return { dictionaries, customDictionaries, setCustomDictionaries, ensureDictionariesLoaded,
    isLoaded, storageError, canEdit, retryStorage };
}
