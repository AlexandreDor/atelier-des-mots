"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { createCollectionPersistence } from "./persistence";

export function useStoredCollection<T>(key: string, decode: (value: unknown) => T[]) {
  const [value, setValue] = useState<T[]>([]);
  const [error, setError] = useState("");
  const controller = useRef<ReturnType<typeof createCollectionPersistence<T>> | null>(null);
  const current = useRef<T[]>([]);
  const ready = useRef(false);

  const load = useCallback(() => {
    try {
      controller.current = createCollectionPersistence(window.localStorage, key, decode);
      const snapshot = controller.current.load();
      ready.current = snapshot.ready;
      current.current = snapshot.value;
      setValue(snapshot.value);
      setError(snapshot.error);
    } catch {
      ready.current = false;
      setError("Les données locales n’ont pas pu être chargées.");
    }
  }, [decode, key]);

  useEffect(() => {
    const timeout = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const change = useCallback((action: SetStateAction<T[]>) => {
    if (!ready.current || !controller.current) return;
    const next = typeof action === "function" ? action(current.current) : action;
    const snapshot = controller.current.save(next);
    current.current = snapshot.value;
    setValue(snapshot.value);
    setError(snapshot.error);
  }, []);

  const retry = useCallback(() => {
    if (!ready.current || !controller.current) load();
    else {
      const snapshot = controller.current.save(current.current);
      setError(snapshot.error);
    }
  }, [load]);

  return { value, change, error, retry };
}
