import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename } from "node:path";

export async function sourceSnapshot(paths) {
  const capturedAt = new Date().toISOString();
  const snapshots = [];
  for (const path of paths) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    snapshots.push({ file: basename(path), sha256: hash.digest("hex"), capturedAt });
  }
  return snapshots;
}

export function snapshotProvenance(sourceSnapshots) {
  const capturedAt = sourceSnapshots[0]?.capturedAt ?? new Date().toISOString();
  return {
    sourceVersion: "Fichier(s) source fourni(s) au build; empreinte(s) conservée(s)",
    accessedAt: `Téléchargement amont non déclaré · empreinte calculée le ${capturedAt}`,
    sourceSnapshots,
  };
}
