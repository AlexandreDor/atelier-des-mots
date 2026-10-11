type JsonResponse = Pick<Response, "ok" | "status" | "json">;
type JsonFetch = (url: URL) => Promise<JsonResponse>;

// Fetch JSON assets instead of importing modules: browsers remember a failed
// module import for the lifetime of the document, preventing a real retry.
export function createJsonResource<T>(
  decode: (value: unknown) => T,
  fetchJson: JsonFetch = (url) => fetch(url, { cache: "no-cache" }),
) {
  const pending = new Map<string, Promise<T>>();
  return (url: URL): Promise<T> => {
    const key = url.href;
    const cached = pending.get(key);
    if (cached) return cached;
    const request = Promise.resolve()
      .then(() => fetchJson(url))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Le téléchargement des données a échoué (${response.status}).`);
        }
        return decode(await response.json());
      })
      .catch((error: unknown) => {
        pending.delete(key);
        throw error;
      });
    pending.set(key, request);
    return request;
  };
}
