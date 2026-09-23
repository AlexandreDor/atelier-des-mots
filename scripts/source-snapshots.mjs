import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export async function sourceSnapshot(paths) {
  const capturedAt = new Date().toISOString();
  return Promise.all(paths.map(async (path) => ({
    file: basename(path),
    sha256: createHash("sha256").update(await readFile(path)).digest("hex"),
    capturedAt,
  })));
}

export function snapshotProvenance(sourceSnapshots) {
  const capturedAt = sourceSnapshots[0]?.capturedAt ?? new Date().toISOString();
  return {
    sourceVersion: "Fichier(s) source fourni(s) au build; empreinte(s) conservée(s)",
    accessedAt: `Téléchargement amont non déclaré · empreinte calculée le ${capturedAt}`,
    sourceSnapshots,
  };
}
