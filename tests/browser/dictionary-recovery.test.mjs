import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test, { before, after } from "node:test";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const legacyKey = "atelier-des-mots:dictionaries:v1";
const currentKey = "atelier-des-mots:custom-dictionaries:v2";
let server;
let browser;
let origin;

before(async () => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/.bin/vinext", "start", "--port", String(port)], {
    cwd: root,
    env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/browser-tests.log" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk) => { output = (output + chunk).slice(-8000); });
  }
  const deadline = Date.now() + 30000;
  while (true) {
    if (server.exitCode !== null) throw new Error(`Production server exited: ${output}`);
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(2000) });
      if (response.ok) break;
    } catch { /* Wait for the production server to start. */ }
    if (Date.now() > deadline) throw new Error(`Production server did not start: ${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    const stopped = once(server, "exit");
    server.kill("SIGTERM");
    const timeout = setTimeout(() => server.kill("SIGKILL"), 3000);
    await stopped;
    clearTimeout(timeout);
  }
});

async function newPage(t) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], "browser runtime errors");
  });
  return page;
}

async function failFirstAsset(page, pattern, failure = "network") {
  let requests = 0;
  await page.route(pattern, async (route) => {
    requests++;
    if (requests === 1) {
      if (failure === "network") await route.abort("failed");
      else await route.fulfill({ status: 503, body: "temporarily unavailable" });
    } else await route.continue();
  });
  return () => requests;
}

test("generation refetches a failed production corpus without reloading the page", { timeout: 30000 }, async (t) => {
  const page = await newPage(t);
  const requests = await failFirstAsset(page, "**/assets/dictionaries-primary-*.json");
  await page.goto(origin);
  const generate = page.getByRole("button", { name: "Appliquer et générer 9 mots" });
  await generate.click();
  await expect(page.getByText("Les corpus sélectionnés n’ont pas pu être chargés.", { exact: true })).toBeVisible();
  assert.equal(requests(), 1);
  await generate.click();
  await expect(page.getByText("9 mots générés.", { exact: true })).toBeVisible();
  assert.equal(requests(), 2);
  await expect(page.locator(".word-card")).toHaveCount(9);
  assert.equal(page.url(), `${origin}/`);
});

test("legacy recovery retries its baseline and preserves personal English additions through export and reload", { timeout: 30000 }, async (t) => {
  const page = await newPage(t);
  const requests = await failFirstAsset(page, "**/assets/retired-dictionary-fingerprints-*.json", "http");
  const personal = ["brumalexandre", "a".repeat(61)];
  const legacy = JSON.stringify([{ id: "en-mots", name: "Anglais", words: ["example", "dictionary", ...personal] }]);
  await page.addInitScript(({ key, legacy }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, legacy);
  }, { key: legacyKey, legacy });
  await page.goto(origin);
  const retry = page.getByRole("button", { name: "Réessayer les dictionnaires" });
  await expect(retry).toBeVisible();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), currentKey), null);
  await retry.click();
  await expect(retry).toHaveCount(0);
  assert.equal(requests(), 2);
  const recovered = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), currentKey);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].id, "dictionnaire-ajouts-migres-en-mots");
  assert.deepEqual(recovered[0].words, personal);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), legacyKey), legacy);
  await page.getByRole("button", { name: "Gérer les dictionnaires", exact: false }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exporter JSON" }).click(),
  ]);
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.deepEqual(exported.dictionaries, recovered);
  await page.reload();
  await expect(page.getByRole("button", { name: "Appliquer et générer 9 mots" })).toBeEnabled();
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), currentKey), recovered);
  assert.equal(requests(), 2, "v2 reload does not need the retired baseline");
});

test("v1 file restore preserves historical fields and volumes through the manager, v2 export and reload", { timeout: 30000 }, async (t) => {
  const page = await newPage(t);
  function word(index) {
    let result = "m";
    do {
      result += String.fromCharCode(97 + index % 26);
      index = Math.floor(index / 26);
    } while (index);
    return result;
  }
  const existing = { id: "existing", name: "Déjà présent", words: ["étoile"] };
  const dictionaries = [
    { id: "i".repeat(121), name: "n".repeat(101), words: ["a".repeat(61)] },
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `large-${index}`, name: `Grande liste ${index}`,
      words: Array.from({ length: 90_000 }, (_, offset) => word(index * 90_000 + offset)),
    })),
    ...Array.from({ length: 101 }, (_, index) => ({ id: `empty-${index}`, name: `Vide ${index}`, words: [] })),
  ];
  await page.addInitScript(({ key, existing }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify([existing]));
  }, { key: currentKey, existing });
  await page.goto(origin);
  await page.getByRole("button", { name: "Gérer les dictionnaires", exact: false }).click();
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "ancienne-sauvegarde.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, dictionaries }, null, 2)),
  });
  await expect(page.getByText(`105 dictionnaires et ${(270_001).toLocaleString("fr-FR")} mots importés.`, { exact: true })).toBeVisible();
  const restored = [existing, ...dictionaries];
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), currentKey), restored);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exporter JSON" }).click(),
  ]);
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(exported.version, 2);
  assert.deepEqual(exported.dictionaries, restored);
  await fileInput.setInputFiles({
    name: "sauvegarde-invalide.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, dictionaries: [
      { id: "another", name: "Autre", words: ["soleil"] },
      { id: "corrupt", name: "Corrompu", words: [null] },
    ] })),
  });
  await expect(page.getByText("La sauvegarde contient un dictionnaire invalide ou un identifiant dupliqué.", { exact: true })).toBeVisible();
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), currentKey), restored);
  await page.reload();
  await expect(page.getByRole("button", { name: "Appliquer et générer 9 mots" })).toBeEnabled();
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), currentKey), restored);
});

test("ordinary file imports reject invalid entries without changing stored dictionaries", { timeout: 30000 }, async (t) => {
  const page = await newPage(t);
  const existing = { id: "existing", name: "Déjà présent", words: ["étoile"] };
  const stored = JSON.stringify([existing]);
  await page.addInitScript(({ key, stored }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, stored);
  }, { key: currentKey, stored });
  await page.goto(origin);
  await page.getByRole("button", { name: "Gérer les dictionnaires", exact: false }).click();
  await expect(page.getByRole("button", { name: "Importer JSON", exact: true })).toBeEnabled();
  const fileInput = page.locator('input[type="file"]');
  const valid = { id: "new", name: "Nouvelle liste", words: ["soleil"] };
  for (const [invalid, message] of [
    [
      { id: "long", name: "n".repeat(101), words: ["lune"] },
      "Le nom du dictionnaire nº 2 dépasse la limite de 100 caractères. Aucun dictionnaire du fichier n’a été importé.",
    ],
    [
      { id: "broken", name: "Corrompu", words: ["lune", null] },
      "« Corrompu » contient une liste de mots invalide. Aucun dictionnaire du fichier n’a été importé.",
    ],
  ]) {
    await fileInput.setInputFiles({
      name: "import-invalide.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify([valid, invalid])),
    });
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), currentKey), stored);
    await expect(page.locator("#managed-dictionary option")).toHaveCount(2);
  }
  await fileInput.setInputFiles({
    name: "import-valide.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([valid])),
  });
  await expect(page.getByText("1 dictionnaire et 1 mots importés.", { exact: true })).toBeVisible();
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), currentKey), [existing, valid]);
});

test("analysis retries the failed asset and renders all six selected sources", { timeout: 30000 }, async (t) => {
  const page = await newPage(t);
  const requests = await failFirstAsset(page, "**/assets/dictionaries-primary-*.json");
  await page.goto(`${origin}/analyse`);
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.locator(".score-row")).toHaveCount(6);
  assert.equal(requests(), 2);
  await expect(page.getByRole("button", { name: "Réessayer", exact: true })).toHaveCount(0);
});

test("analysis exposes failed legacy migration and restores personal dictionaries on retry without reloading", { timeout: 30000 }, async (t) => {
  const page = await newPage(t);
  const requests = await failFirstAsset(page, "**/assets/retired-dictionary-fingerprints-*.json", "http");
  const personal = { id: "my-personal", name: "Ma liste personnelle", words: ["luciole", "velours"] };
  const legacy = JSON.stringify([
    { id: "en-mots", name: "Anglais", words: ["example", "dictionary", "brumalexandre"] },
    personal,
  ]);
  await page.addInitScript(({ key, legacy }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, legacy);
  }, { key: legacyKey, legacy });
  await page.goto(`${origin}/analyse`);
  const retry = page.getByRole("button", { name: "Réessayer les dictionnaires personnels", exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Les dictionnaires locaux n’ont pas pu être chargés.");
  await expect(page.locator(".score-row")).toHaveCount(6);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), currentKey), null);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), legacyKey), legacy);
  await retry.click();
  await expect(retry).toHaveCount(0);
  assert.equal(requests(), 2);
  const recovered = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), currentKey);
  const recoveredEnglish = recovered.find(({ id }) => id === "dictionnaire-ajouts-migres-en-mots");
  assert.deepEqual(recovered.find(({ id }) => id === personal.id), personal);
  assert.deepEqual(recoveredEnglish.words, ["brumalexandre"]);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), legacyKey), legacy);
  await page.getByRole("button", { name: "Aucun", exact: true }).click();
  await page.getByRole("checkbox", { name: /Ma liste personnelle/u }).check();
  await page.getByRole("checkbox", { name: /Ajouts · Anglais/u }).check();
  await expect(page.locator(".score-row")).toHaveCount(2);
  assert.deepEqual((await page.locator(".score-source strong").allTextContents()).sort(), [recoveredEnglish.name, personal.name].sort());
  assert.equal(page.url(), `${origin}/analyse`);
});

test("analysis keeps the current selection retry available when an older retry fails", { timeout: 30000 }, async (t) => {
  const page = await newPage(t);
  let release;
  let requested;
  const waiting = new Promise((resolve) => { requested = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  let primaryRequests = 0;
  await page.route("**/assets/dictionaries-primary-*.json", async (route) => {
    primaryRequests++;
    if (primaryRequests === 2) {
      requested();
      await gate;
    }
    if (primaryRequests <= 2) {
      await route.fulfill({ status: 503, body: "temporarily unavailable" });
    } else await route.continue();
  });
  const placeRequests = await failFirstAsset(page, "**/assets/place-dictionaries-*.json", "http");
  await page.goto(`${origin}/analyse`);
  const retry = page.getByRole("button", { name: "Réessayer", exact: true });
  await retry.click();
  await waiting;
  await page.getByRole("button", { name: "Tous les lieux", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Les corpus sélectionnés n’ont pas pu être chargés.");
  assert.equal(placeRequests(), 1);
  const staleResponse = page.waitForResponse((response) => /\/dictionaries-primary-[^/]+\.json$/u.test(response.url()));
  release();
  await staleResponse;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(retry).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Les corpus sélectionnés n’ont pas pu être chargés.");
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(page.locator(".score-row")).toHaveCount(15);
  assert.equal(placeRequests(), 2);
  assert.equal(primaryRequests, 2);
  assert.equal(page.url(), `${origin}/analyse`);
});

test("places fetches only when generated and retries before using its worker", { timeout: 30000 }, async (t) => {
  const page = await newPage(t);
  const requests = await failFirstAsset(page, "**/assets/place-dictionaries-*.json", "http");
  await page.goto(`${origin}/lieux`);
  assert.equal(requests(), 0);
  const generate = page.getByRole("button", { name: "Générer les lieux" });
  await generate.click();
  await expect(page.getByText("Les corpus sélectionnés n’ont pas pu être chargés. Réessayez la génération.", { exact: true })).toBeVisible();
  await generate.click();
  await expect(page.getByText("9 propositions générées.", { exact: true })).toBeVisible();
  assert.equal(requests(), 2);
  await expect(page.locator(".place-name-grid button")).toHaveCount(9);
  await page.getByLabel("Langue").selectOption("ru-latn");
  await generate.click();
  await expect(page.getByText("9 propositions générées.", { exact: true })).toBeVisible();
  assert.equal(requests(), 2, "the loaded corpus is shared after the language switch");
});

test("places discards generation settings changed during a pending corpus fetch", { timeout: 30000 }, async (t) => {
  const page = await newPage(t);
  let release;
  let requested;
  const waiting = new Promise((resolve) => { requested = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  await page.route("**/assets/place-dictionaries-*.json", async (route) => {
    requested();
    await gate;
    await route.continue();
  });
  await page.goto(`${origin}/lieux`);
  await page.getByRole("button", { name: "Générer les lieux" }).click();
  await waiting;
  await page.getByRole("radio", { name: /Montagne/u }).click();
  release();
  await expect(page.getByRole("button", { name: "Générer les lieux" })).toBeEnabled();
  await expect(page.locator(".place-name-grid button")).toHaveCount(0);
  await page.getByRole("button", { name: "Générer les lieux" }).click();
  await expect(page.getByText("9 propositions générées.", { exact: true })).toBeVisible();
});
