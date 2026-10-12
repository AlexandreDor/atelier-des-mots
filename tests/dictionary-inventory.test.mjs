import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  ACTIVE_DICTIONARY_FILES,
  assertDictionaryInventorySynchronized,
  updateDictionaryCorpora,
  writeDictionaryInventory,
} from "../scripts/dictionary-inventory.mjs";

const execute = promisify(execFile);
const repository = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value)}\n`);
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "atelier-inventory-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(new URL("scripts/", repository), join(directory, "scripts"), { recursive: true });
  const data = join(directory, "app", "data");
  await mkdir(data, { recursive: true });
  for (const file of ACTIVE_DICTIONARY_FILES) {
    const dictionaries = await readJson(new URL(`app/data/${file}`, repository));
    await writeJson(join(data, file), dictionaries.map((dictionary) => ({
      ...dictionary,
      words: ["Ancien"],
    })));
  }
  await cp(new URL("app/data/suspended-dictionaries.json", repository), join(data, "suspended-dictionaries.json"));
  const dataUrl = pathToFileURL(`${data}/`);
  await writeDictionaryInventory(dataUrl);
  return { directory, data, dataUrl };
}

// Letter-only suffixes satisfy the builders' real name filters.
function name(index, prefix = "Localite") {
  let suffix = "";
  for (let position = 0; position < 4; position++) {
    suffix = String.fromCharCode(97 + index % 26) + suffix;
    index = Math.floor(index / 26);
  }
  return `${prefix} ${suffix}`;
}

function geoNames(count, { country = "RU", code = "PPL", featureClass = "P", prefix } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const fields = Array(19).fill("");
    fields[0] = String(index + 1);
    fields[1] = fields[2] = name(index, prefix);
    fields[6] = featureClass;
    fields[7] = code;
    fields[8] = country;
    fields[10] = country === "GB" ? "ENG" : "";
    fields[14] = String(count - index);
    return fields.join("\t");
  }).join("\n") + "\n";
}

async function input(directory, filename, contents) {
  const path = join(directory, filename);
  await writeFile(path, contents);
  return path;
}

async function assertInventoryMatchesCorpora({ data, dataUrl }) {
  const actual = await readJson(join(data, "dictionary-inventory.json"));
  const dictionaries = (await Promise.all(ACTIVE_DICTIONARY_FILES.map((file) => readJson(join(data, file))))).flat();
  assert.deepEqual(actual.active, dictionaries.map(({ words, ...metadata }) => ({ ...metadata, wordCount: words.length })));
  const suspended = await readJson(join(data, "suspended-dictionaries.json"));
  assert.deepEqual(actual.suspended, suspended.map(({ words, ...metadata }) => ({ ...metadata, wordCount: metadata.wordCount ?? words?.length ?? 0 })));
  await assertDictionaryInventorySynchronized(dataUrl);
  assert.ok((await readdir(data)).every((file) => !file.endsWith(".tmp")));
  return actual;
}

async function assertRebuilt(fixture, script, paths, expected) {
  const before = Date.now();
  await execute(process.execPath, [join(fixture.directory, "scripts", script), ...paths], { cwd: fixture.directory });
  const after = Date.now();
  const inventory = await assertInventoryMatchesCorpora(fixture);
  for (const [id, count, sources] of expected) {
    const dictionary = inventory.active.find((entry) => entry.id === id);
    assert.equal(dictionary.wordCount, count, id);
    assert.match(dictionary.sourceVersion, /empreinte/u);
    assert.match(dictionary.accessedAt, /Téléchargement amont non déclaré/u);
    assert.equal(dictionary.sourceSnapshots.length, sources.length);
    for (let index = 0; index < sources.length; index++) {
      const snapshot = dictionary.sourceSnapshots[index];
      assert.equal(snapshot.file, sources[index].split("/").at(-1));
      assert.equal(snapshot.sha256, createHash("sha256").update(await readFile(sources[index])).digest("hex"));
      const capturedAt = Date.parse(snapshot.capturedAt);
      assert.ok(capturedAt >= before && capturedAt <= after);
      assert.ok(dictionary.accessedAt.includes(snapshot.capturedAt));
    }
  }
  await execute(process.execPath, [join(fixture.directory, "scripts", "dictionary-inventory.mjs"), "--check"], { cwd: fixture.directory });
  return inventory;
}

test("la reconstruction russe synchronise la provenance même à volume constant", async (t) => {
  const working = await fixture(t);
  const source = await input(working.directory, "RU.txt", geoNames(5000));
  await assertRebuilt(working, "build-russian-place-dictionary.mjs", [source], [
    ["ru-lieux-localites-romanise", 5000, [source]],
  ]);
  const before = await readJson(join(working.data, "dictionary-inventory.json"));
  await writeFile(source, geoNames(5000, { prefix: "Nouveau" }));
  const after = await assertRebuilt(working, "build-russian-place-dictionary.mjs", [source], [
    ["ru-lieux-localites-romanise", 5000, [source]],
  ]);
  const entry = (inventory) => inventory.active.find(({ id }) => id === "ru-lieux-localites-romanise");
  assert.equal(entry(before).wordCount, entry(after).wordCount);
  assert.notEqual(entry(before).sourceSnapshots[0].sha256, entry(after).sourceSnapshots[0].sha256);

  // Applying registry metadata later must preserve the fresh source capture.
  await execute(process.execPath, [join(working.directory, "scripts", "apply-dataset-metadata.mjs")], { cwd: working.directory });
  const enriched = await assertInventoryMatchesCorpora(working);
  assert.deepEqual(entry(enriched), entry(after));
});

test("la reconstruction minérale synchronise les changements de volume", async (t) => {
  const working = await fixture(t);
  const pages = join(working.directory, "minerals");
  await mkdir(pages);
  const source = join(pages, "minerals-A.json");
  await writeJson(source, { parse: { wikitext: Array.from({ length: 501 }, (_, index) => `* [[${name(index, "Mineral")}]]`).join("\n") } });
  await assertRebuilt(working, "build-nature-dictionaries.mjs", [pages], [
    ["fr-nature-mineraux", 501, [source]],
  ]);
});

test("la reconstruction française actualise tous les corpus et leurs noms", async (t) => {
  const working = await fixture(t);
  const communes = await input(working.directory, "communes.json", JSON.stringify([
    ...Array.from({ length: 2500 }, (_, index) => ({ type: "commune-actuelle", zone: "metro", population: 10000 + index, nom: name(index, "Ville") })),
    ...Array.from({ length: 4000 }, (_, index) => ({ type: "commune-actuelle", zone: "metro", population: 100, nom: name(index, "Village") })),
  ]));
  const geonames = await input(working.directory, "FR.txt", [
    geoNames(1000, { country: "FR", featureClass: "H", code: "STM", prefix: "Riviere" }),
    geoNames(2000, { country: "FR", featureClass: "V", code: "FRST", prefix: "Forêt de Bosquet" }),
    geoNames(4000, { country: "FR", featureClass: "T", code: "MT", prefix: "Mont de Relief" }),
    geoNames(200, { country: "FR", featureClass: "T", code: "BCH", prefix: "Plage de Littoral" }),
  ].join(""));
  const fleuves = await input(working.directory, "fleuves.html", `<table class="wikitable">${Array.from({ length: 200 }, (_, index) => `<tr><td>${name(index, "Fleuve")}</td></tr>`).join("")}</table>`);
  // A stale display name must be replaced as well as the words and provenance.
  const places = await readJson(join(working.data, "place-dictionaries.json"));
  places.find(({ id }) => id === "fr-lieux-villes").name = "Ancien nom";
  await writeJson(join(working.data, "place-dictionaries.json"), places);
  const inventory = await assertRebuilt(working, "build-place-dictionaries.mjs", [communes, geonames, fleuves], [
    ["fr-lieux-villes", 2500, [communes]],
    ["fr-lieux-villages", 4000, [communes]],
    ["fr-lieux-rivieres", 1000, [geonames]],
    ["fr-lieux-fleuves", 200, [fleuves]],
    ["fr-lieux-forets", 2000, [geonames]],
    ["fr-lieux-montagnes", 4000, [geonames]],
    ["fr-lieux-plages", 200, [geonames]],
  ]);
  assert.equal(inventory.active.find(({ id }) => id === "fr-lieux-villes").name, "France · villes et bourgs");
});

test("la reconstruction internationale synchronise aussi les sources multiples", async (t) => {
  const working = await fixture(t);
  const gb = await input(working.directory, "GB.txt", geoNames(2500, { country: "GB" }));
  const hu = await input(working.directory, "HU.txt", geoNames(1000, { country: "HU" }));
  const es = await input(working.directory, "ES.txt", geoNames(2500, { country: "ES" }));
  const roads = (count, start, prefix) => Array.from({ length: count }, (_, index) => JSON.stringify({ type: "Feature", properties: { highway: "residential", name: name(index + start, prefix) } })).join("\n") + "\n";
  const huRoads = await input(working.directory, "HU.geojsonseq", roads(5000, 0, "Route"));
  const esRoads = await input(working.directory, "ES.geojsonseq", roads(4500, 0, "Calle Caminoverde"));
  const canaryRoads = await input(working.directory, "Canary.geojsonseq", roads(500, 4500, "Calle Caminoverde"));
  await assertRebuilt(working, "build-international-place-dictionaries.mjs", [gb, hu, es, huRoads, esRoads, canaryRoads], [
    ["en-lieux-villes", 2500, [gb]],
    ["hu-lieux-villes", 1000, [hu]],
    ["es-lieux-villes", 2500, [es]],
    ["hu-rues-routes", 5000, [huRoads]],
    ["es-rues-routes", 5000, [esRoads, canaryRoads]],
  ]);
});

test("la vérification détecte les métadonnées et volumes périmés sans les modifier", async (t) => {
  const working = await fixture(t);
  const file = join(working.data, "dictionary-inventory.json");
  const original = await readJson(file);
  for (const [key, value] of [
    ["name", "Autre nom"],
    ["wordCount", 42],
    ["accessedAt", "2000-01-01"],
    ["sourceVersion", "ancienne version"],
    ["license", "autre licence"],
    ["sourceSnapshots", [{ file: "old.txt", sha256: "0".repeat(64), capturedAt: "2000-01-01T00:00:00.000Z" }]],
  ]) {
    const stale = structuredClone(original);
    stale.active[0][key] = value;
    await writeJson(file, stale);
    await assert.rejects(assertDictionaryInventorySynchronized(working.dataUrl), /désynchronisé/u);
    await assert.rejects(execute(process.execPath, [join(working.directory, "scripts", "dictionary-inventory.mjs"), "--check"]), /désynchronisé/u);
    assert.deepEqual(await readJson(file), stale);
  }
  const stale = structuredClone(original);
  stale.suspended[0].suspensionReason = "Autre motif";
  await writeJson(file, stale);
  await assert.rejects(assertDictionaryInventorySynchronized(working.dataUrl), /désynchronisé/u);
  await writeDictionaryInventory(working.dataUrl);
  assert.deepEqual(await readJson(file), original);
});

test("un échec de reconstruction conserve les données et l’inventaire précédents", async (t) => {
  const working = await fixture(t);
  const corpus = join(working.data, "place-dictionaries.json");
  const inventory = join(working.data, "dictionary-inventory.json");
  const before = await Promise.all([readFile(corpus, "utf8"), readFile(inventory, "utf8")]);
  const source = await input(working.directory, "RU.txt", geoNames(10));
  await assert.rejects(execute(process.execPath, [join(working.directory, "scripts", "build-russian-place-dictionary.mjs"), source]), /5000 attendus/u);
  assert.deepEqual(await Promise.all([readFile(corpus, "utf8"), readFile(inventory, "utf8")]), before);
});

test("l’inventaire refuse un lexique suspendu et les corpus dupliqués", async (t) => {
  const working = await fixture(t);
  const file = join(working.data, "suspended-dictionaries.json");
  const suspended = await readJson(file);
  suspended[0].words = ["Interdit"];
  await writeJson(file, suspended);
  await assert.rejects(writeDictionaryInventory(working.dataUrl), /lexique suspendu/u);
  suspended[0].words = [];
  suspended[0].id = "fr-mots";
  await writeJson(file, suspended);
  await assert.rejects(writeDictionaryInventory(working.dataUrl), /Corpus dupliqué/u);
});

function startProcess(t, directory, args) {
  const child = spawn(process.execPath, args, {
    cwd: directory, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.resume();
  const completed = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const messages = new Set();
  const waiting = new Map();
  child.on("message", (message) => {
    messages.add(message);
    waiting.get(message)?.();
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await completed;
  });
  return {
    child,
    completed,
    message(expected) {
      if (messages.has(expected)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        waiting.set(expected, resolve);
        void completed.then(() => {
          if (!messages.has(expected)) reject(new Error(`Message absent : ${expected}. ${stderr}`));
        });
      });
    },
    async succeed() {
      const result = await completed;
      assert.equal(result.code, 0, result.error?.message || stderr || result.signal);
    },
  };
}

for (const sharedFile of [false, true]) {
  test(`les publications concurrentes préservent ${sharedFile ? "les ajouts au même fichier" : "les volumes de fichiers distincts"}`, { timeout: 15000 }, async (t) => {
    const working = await fixture(t);
    const firstFile = "place-dictionaries.json";
    const secondFile = sharedFile ? firstFile : "nature-dictionaries.json";
    const moduleUrl = pathToFileURL(join(working.directory, "scripts", "dictionary-inventory.mjs")).href;
    const code = (file, id, word, hold) => `
      import { updateDictionaryCorpora } from ${JSON.stringify(moduleUrl)};
      process.send("attempting");
      await updateDictionaryCorpora(async (collections) => {
        process.send("entered");
        ${hold ? 'await new Promise((resolve) => process.once("message", resolve));' : ""}
        return { ${JSON.stringify(file)}: collections[${JSON.stringify(file)}].map((dictionary) =>
          dictionary.id === ${JSON.stringify(id)}
            ? { ...dictionary, words: [...dictionary.words, ${JSON.stringify(word)}] }
            : dictionary) };
      });
      process.disconnect();
    `;
    const first = startProcess(t, working.directory, ["--input-type=module", "--eval",
      code(firstFile, "fr-lieux-villes", "Premier", true)]);
    await first.message("entered");
    const second = startProcess(t, working.directory, ["--input-type=module", "--eval",
      code(secondFile, sharedFile ? "ru-lieux-localites-romanise" : "fr-nature-mineraux", "Second", false)]);
    await second.message("attempting");
    const entered = second.message("entered");
    assert.equal(await Promise.race([entered.then(() => "entered"), delay(100, "waiting")]), "waiting");
    first.child.send("release");
    await Promise.all([first.succeed(), second.succeed()]);
    const inventory = await assertInventoryMatchesCorpora(working);
    assert.equal(inventory.active.find(({ id }) => id === "fr-lieux-villes").wordCount, 2);
    assert.equal(inventory.active.find(({ id }) => id === (sharedFile ? "ru-lieux-localites-romanise" : "fr-nature-mineraux")).wordCount, 2);
  });
}

test("les vrais scripts concurrents conservent les corpus reconstruits et leurs métadonnées", { timeout: 15000 }, async (t) => {
  const working = await fixture(t);
  const pages = join(working.directory, "minerals");
  await mkdir(pages);
  await writeJson(join(pages, "minerals-A.json"), {
    parse: { wikitext: Array.from({ length: 501 }, (_, index) => `* [[${name(index, "Mineral")}]]`).join("\n") },
  });
  const source = await input(working.directory, "RU.txt", geoNames(5000));
  const children = [
    ["build-nature-dictionaries.mjs", pages],
    ["build-russian-place-dictionary.mjs", source],
    ["apply-dataset-metadata.mjs"],
    ["dictionary-inventory.mjs", "--write"],
  ].map(([script, ...args]) => startProcess(t, working.directory, [
    join(working.directory, "scripts", script), ...args,
  ]));
  await Promise.all(children.map((child) => child.succeed()));
  const inventory = await assertInventoryMatchesCorpora(working);
  for (const [id, count] of [["fr-nature-mineraux", 501], ["ru-lieux-localites-romanise", 5000]]) {
    const entry = inventory.active.find((dictionary) => dictionary.id === id);
    assert.equal(entry.wordCount, count);
    assert.equal(entry.sourceSnapshots.length, 1);
  }
});

test("une mise à jour invalide ne publie aucun fichier et libère le verrou", async (t) => {
  const working = await fixture(t);
  const files = [...ACTIVE_DICTIONARY_FILES, "dictionary-inventory.json"];
  const before = await Promise.all(files.map((file) => readFile(join(working.data, file), "utf8")));
  await assert.rejects(updateDictionaryCorpora((collections) => ({
    "dictionaries-primary.json": collections["dictionaries-primary.json"].map((dictionary) => ({ ...dictionary, name: "Nouveau nom" })),
    "nature-dictionaries.json": collections["nature-dictionaries.json"].map((dictionary) => ({ ...dictionary, license: "" })),
  }), working.dataUrl), /license manquant/u);
  assert.deepEqual(await Promise.all(files.map((file) => readFile(join(working.data, file), "utf8"))), before);
  await writeDictionaryInventory(working.dataUrl);
  await assertInventoryMatchesCorpora(working);
});

test("les métadonnées incomplètes échouent avant toute publication", async (t) => {
  const working = await fixture(t);
  await writeJson(join(working.data, "nature-dictionaries.json"), []);
  const files = [...ACTIVE_DICTIONARY_FILES, "dictionary-inventory.json"];
  const before = await Promise.all(files.map((file) => readFile(join(working.data, file), "utf8")));
  await assert.rejects(execute(process.execPath, [join(working.directory, "scripts", "apply-dataset-metadata.mjs")]), /Corpus absents : fr-nature-mineraux/u);
  assert.deepEqual(await Promise.all(files.map((file) => readFile(join(working.data, file), "utf8"))), before);
});

test("la vérification attend une publication et un processus tué libère le verrou", { timeout: 15000 }, async (t) => {
  const working = await fixture(t);
  const moduleUrl = pathToFileURL(join(working.directory, "scripts", "dictionary-inventory.mjs")).href;
  const holder = startProcess(t, working.directory, ["--input-type=module", "--eval", `
    import { updateDictionaryCorpora } from ${JSON.stringify(moduleUrl)};
    await updateDictionaryCorpora(async () => {
      process.send("entered");
      await new Promise((resolve) => process.once("message", resolve));
      return {};
    });
    process.disconnect();
  `]);
  await holder.message("entered");
  const check = startProcess(t, working.directory, ["--input-type=module", "--eval", `
    import { assertDictionaryInventorySynchronized } from ${JSON.stringify(moduleUrl)};
    process.send("attempting");
    await assertDictionaryInventorySynchronized();
    process.disconnect();
  `]);
  await check.message("attempting");
  assert.equal(await Promise.race([check.completed.then(() => "finished"), delay(100, "waiting")]), "waiting");
  holder.child.kill("SIGKILL");
  await holder.completed;
  await check.succeed();
  await assertInventoryMatchesCorpora(working);
});
