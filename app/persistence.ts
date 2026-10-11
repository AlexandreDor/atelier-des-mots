export function writeLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export type CollectionStorage = Pick<Storage, "getItem" | "setItem">;

export function createCollectionPersistence<T>(
  storage: CollectionStorage,
  key: string,
  decode: (value: unknown) => T[],
) {
  let ready = false;
  let saved = "";
  let value: T[] = [];
  let error = "";
  return {
    load() {
      ready = false;
      try {
        value = decode(JSON.parse(storage.getItem(key) ?? "[]"));
        saved = JSON.stringify(value);
        ready = true;
        error = "";
      } catch {
        error = "Les données locales n’ont pas pu être chargées.";
      }
      return { value, ready, error };
    },
    save(next: T[]) {
      if (!ready) return { value, ready, error };
      value = next;
      try {
        const serialized = JSON.stringify(value);
        if (serialized !== saved) {
          storage.setItem(key, serialized);
          saved = serialized;
        }
        error = "";
      } catch {
        error = "Les données locales n’ont pas pu être enregistrées.";
      }
      return { value, ready, error };
    },
  };
}

export function readStoredFavorites(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Les favoris sont invalides.");
  }
  return value;
}
