import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { normalizeWord } from "../app/generator.ts";

// This immutable revision is the last distributed baseline, not a fresh source
// download. Only one-way membership fingerprints are retained in the artifact.
const revision = "320cafa206385e25cc197c4e9a41e58fd3bd90a1";
const sourceFile = "app/data/dictionaries-primary.json";
const source = execFileSync("git", ["show", `${revision}:${sourceFile}`], {
  cwd: new URL("../", import.meta.url),
  maxBuffer: 32 * 1024 * 1024,
});
const dictionary = JSON.parse(source).find(({ id }) => id === "en-mots");
if (!dictionary || !Array.isArray(dictionary.words)) {
  throw new Error("Le corpus historique anglais est introuvable.");
}
const wordFingerprints = Array.from(new Set(dictionary.words.map((word) =>
  createHash("sha256").update(normalizeWord(word)).digest("hex"),
))).sort();
const payload = [{
  id: dictionary.id,
  name: dictionary.name,
  algorithm: "SHA-256",
  wordCount: wordFingerprints.length,
  sourceRevision: revision,
  sourceFile,
  sourceFileSha256: createHash("sha256").update(source).digest("hex"),
  wordFingerprints,
}];
const serialized = `${JSON.stringify(payload)}\n`;
const target = new URL("../app/data/retired-dictionary-fingerprints.json", import.meta.url);
const [mode = "--write", ...extra] = process.argv.slice(2);
if (extra.length || !["--write", "--check"].includes(mode)) {
  throw new Error("Usage: node --import tsx scripts/build-retired-dictionary-fingerprints.mjs [--write|--check]");
}
if (mode === "--check") {
  if (await readFile(target, "utf8") !== serialized) {
    throw new Error("Les empreintes ne correspondent pas à la révision historique.");
  }
} else {
  await writeFile(target, serialized);
}
console.log(`${wordFingerprints.length} empreintes historiques ${mode === "--check" ? "vérifiées" : "écrites"}.`);
