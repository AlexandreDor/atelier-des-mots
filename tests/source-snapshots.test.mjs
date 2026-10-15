import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
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

test("hashes empty and multichunk binary sources in input order with one capture date", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atelier-source-"));
  const empty = join(directory, "empty.txt");
  const binary = join(directory, "roads.geojsonseq");
  const contents = Buffer.alloc(256 * 1024 + 17, 0xa7);
  try {
    await writeFile(empty, "");
    await writeFile(binary, contents);
    const snapshots = await sourceSnapshot([binary, empty]);
    assert.deepEqual(snapshots.map(({ file, sha256 }) => ({ file, sha256 })), [
      { file: "roads.geojsonseq", sha256: createHash("sha256").update(contents).digest("hex") },
      { file: "empty.txt", sha256: createHash("sha256").digest("hex") },
    ]);
    assert.equal(snapshots[0].capturedAt, snapshots[1].capturedAt);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("hashes a 2 GiB sparse source without loading it into memory", { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "atelier-source-large-"));
  const input = join(directory, "large-roads.geojsonseq");
  try {
    const file = await open(input, "w");
    try {
      await file.truncate(2 ** 31);
    } finally {
      await file.close();
    }
    const script = `
      import { sourceSnapshot } from ${JSON.stringify(new URL("../scripts/source-snapshots.mjs", import.meta.url).href)};
      const snapshots = await sourceSnapshot([process.argv[1]]);
      process.stdout.write(JSON.stringify({ snapshots, maxRSS: process.resourceUsage().maxRSS }));
    `;
    const child = spawnSync(process.execPath, ["--max-old-space-size=64", "--input-type=module", "--eval", script, input], {
      encoding: "utf8", timeout: 20000,
    });
    assert.equal(child.status, 0, child.error?.message ?? child.stderr);
    const { snapshots, maxRSS } = JSON.parse(child.stdout);
    assert.equal(snapshots[0].file, "large-roads.geojsonseq");
    // Independently computed with Python hashlib for 2 GiB of zero bytes.
    assert.equal(snapshots[0].sha256, "a7c744c13cc101ed66c29f672f92455547889cc586ce6d44fe76ae824958ea51");
    assert.ok(maxRSS < 256 * 1024, `Peak resident memory exceeded 256 MiB: ${maxRSS} KiB`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
