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

test("analysis retries the failed asset and renders all six selected sources", { timeout: 30000 }, async (t) => {
  const page = await newPage(t);
  const requests = await failFirstAsset(page, "**/assets/dictionaries-primary-*.json");
  await page.goto(`${origin}/analyse`);
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.locator(".score-row")).toHaveCount(6);
  assert.equal(requests(), 2);
  await expect(page.getByRole("button", { name: "Réessayer", exact: true })).toHaveCount(0);
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
