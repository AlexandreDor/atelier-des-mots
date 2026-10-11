import { readFile } from "node:fs/promises";
import { createRetiredDictionaryRecovery, readRetiredBaselines } from "../app/retired-dictionaries.ts";

export const readDictionaryFile = async (url) => JSON.parse(await readFile(url, "utf8"));
export const recoverRetiredWords = createRetiredDictionaryRecovery(async (url) =>
  readRetiredBaselines(await readDictionaryFile(url)),
);
