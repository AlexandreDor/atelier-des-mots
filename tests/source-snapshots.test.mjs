import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sourceSnapshot, snapshotProvenance } from "../scripts/source-snapshots.mjs";

test("captures the SHA-256 and capture date of build inputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atelier-source-"));
  const input = join(directory, "FR.txt");
  const contents = "snapshot source data\n";
  try {
    await writeFile(input, contents);
    const snapshots = await sourceSnapshot([input]);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].file, "FR.txt");
    assert.equal(
      snapshots[0].sha256,
      createHash("sha256").update(contents).digest("hex"),
    );
    assert.ok(Number.isFinite(Date.parse(snapshots[0].capturedAt)));
    const metadata = snapshotProvenance(snapshots);
    assert.equal(metadata.sourceSnapshots[0].sha256, snapshots[0].sha256);
    assert.match(metadata.accessedAt, /téléchargement amont non déclaré/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
