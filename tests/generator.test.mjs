import assert from "node:assert/strict";
import test from "node:test";

import {
  generateBatch,
  nextCharacterDistribution,
  normalizeWord,
  prepareModel,
  wordProbabilityBreakdown,
  wordProbabilityScore,
} from "../app/generator.ts";
import {
  INITIAL_DICTIONARY_IDS,
  isPlaceDictionary,
  loadInitialDictionaries,
  migrateLegacyDictionaries,
  parseDictionaryImport,
  sanitizeCustomDictionaries,
  serializeDictionaryExport,
} from "../app/dictionaries.ts";
import { writeLocalStorage } from "../app/persistence.ts";

const baseConfig = {
  algorithm: "markov",
  order: 1,
  temperature: 1,
  interpolation: 0.7,
  minLength: 3,
  maxLength: 8,
  count: 6,
  seed: "test-stable",
  constraints: {
    startsWith: "",
    endsWith: "",
    includes: "",
    excludes: "",
    allowDictionaryWords: true,
  },
};

const productiveWords = [
  "cabane",
  "caramel",
  "canari",
  "banane",
  "barque",
  "salade",
  "marine",
  "mirage",
  "orange",
  "garage",
  "charmant",
  "chanson",
];

test("classe les identifiants géographiques dans la catégorie Lieux", () => {
  for (const id of [
    "en-lieux-villes",
    "hu-lieux-villes",
    "es-lieux-villes",
    "fr-lieux-forets",
    "fr-lieux-montagnes",
    "fr-lieux-plages",
    "hu-rues-routes",
    "es-rues-routes",
    "en-rues-routes",
    "ru-rues-routes-romanise",
  ]) {
    assert.equal(isPlaceDictionary({ id, name: id, words: [] }), true, id);
  }
  assert.equal(
    isPlaceDictionary({ id: "fr-nature-mineraux", name: "", words: [] }),
    false,
  );
});

test("ne réactive pas les dictionnaires anglais suspendus depuis le stockage", () => {
  const previousEnglish = {
    id: "en-mots",
    name: "Anglais · mots courants",
    words: ["example", "dictionary"],
  };
  assert.deepEqual(sanitizeCustomDictionaries([previousEnglish]), []);
  assert.deepEqual(migrateLegacyDictionaries([previousEnglish]), []);
});

test("l’index léger contient tous les corpus actifs chargés à la demande", async () => {
  const dictionaries = await loadInitialDictionaries();
  assert.equal(dictionaries.length, INITIAL_DICTIONARY_IDS.size);
  for (const dictionary of dictionaries) {
    assert.ok(INITIAL_DICTIONARY_IDS.has(dictionary.id), dictionary.id);
  }
  assert.equal(INITIAL_DICTIONARY_IDS.has("en-mots"), false);
});

test("réimporte un export de plus de 5 Mo avec 200 000 mots", () => {
  const makeWord = (initial) => {
    let value = initial;
    let word = "";
    for (let index = 0; index < 18; index += 1) {
      word += String.fromCharCode(97 + (value % 26));
      value = Math.floor(value / 26);
    }
    return `${word}${"x".repeat(42)}`;
  };
  const first = Array.from({ length: 100_000 }, (_, index) => makeWord(index));
  const second = Array.from({ length: 100_000 }, (_, index) => makeWord(index + 100_000));
  const exported = serializeDictionaryExport([
    { id: "large-a", name: "Grand dictionnaire A", words: first },
    { id: "large-b", name: "Grand dictionnaire B", words: second },
  ]);
  const imported = parseDictionaryImport(exported, []);
  assert.equal(imported.length, 2);
  assert.equal(imported.reduce((sum, dictionary) => sum + dictionary.words.length, 0), 200_000);
});

test("accepte un import ordinaire et rejette les limites avant normalisation", () => {
  assert.deepEqual(
    parseDictionaryImport(
      JSON.stringify([{ id: "mine", name: "Mes mots", words: ["Été", "été", "pluie"] }]),
      [],
    )[0].words,
    ["été", "pluie"],
  );
  assert.throws(
    () =>
      parseDictionaryImport(
        JSON.stringify([{ name: "Mot trop long", words: ["a".repeat(61)] }]),
        [],
      ),
    /plus de 60 lettres/u,
  );
  const words = new Array(100_001).fill("mot");
  assert.throws(
    () => parseDictionaryImport(JSON.stringify([{ name: "Trop grand", words }]), []),
    /100 000 mots/u,
  );
});

test("garde les noms importés uniques sous la limite de 100 caractères", () => {
  const name = "dictionnaire".repeat(9).slice(0, 100);
  const imported = parseDictionaryImport(
    JSON.stringify([
      { id: "long-name-a", name, words: ["premier"] },
      { id: "long-name-b", name, words: ["second"] },
    ]),
    [],
  );
  assert.equal(imported.length, 2);
  assert.ok(imported.every((dictionary) => dictionary.name.length <= 100));
  assert.equal(sanitizeCustomDictionaries(imported).length, 2);
});

test("signale l’échec d’écriture de stockage sans propager l’exception", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      setItem() {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
    },
  };
  try {
    assert.equal(writeLocalStorage("test", "value"), false);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("normalise Unicode et déduplique les mots des sources", () => {
  assert.equal(normalizeWord(" E\u0301té-42 L’ŒUF! "), "étélœuf");
  assert.equal(normalizeWord("--- 123"), "");

  const model = prepareModel(
    [{ id: "unicode-fixture", name: "Unicode", words: ["ÉTÉ", "E\u0301te\u0301", "---"], weight: 1 }],
    baseConfig,
  );
  assert.deepEqual([...model.sourceWords], ["été"]);
  assert.equal(model.totalWords, 1);
});

test("respecte les poids normalisés des sources", () => {
  const model = prepareModel(
    [
      { id: "weight-ac", name: "A", words: ["ac"], weight: 3 },
      { id: "weight-ab", name: "B", words: ["ab"], weight: 1 },
    ],
    baseConfig,
  );
  const distribution = nextCharacterDistribution(model, baseConfig, "a");
  const probabilities = Object.fromEntries(
    distribution.transitions.map(({ letter, probability }) => [letter, probability]),
  );
  assert.equal(probabilities.c, 75);
  assert.equal(probabilities.b, 25);
});

for (const algorithm of ["markov", "interpolated", "syllabic", "phonetic"]) {
  test(`${algorithm} produit une série déterministe, unique et valide`, () => {
    const config = {
      ...baseConfig,
      algorithm,
      order: 2,
      count: 5,
      constraints: { ...baseConfig.constraints },
    };
    const model = prepareModel(
      [{ id: `algorithm-${algorithm}`, name: "Français", words: productiveWords, weight: 1 }],
      config,
    );
    const first = generateBatch(model, config);
    const second = generateBatch(model, config);
    assert.equal(first.length, config.count);
    assert.deepEqual(first, second);
    assert.equal(new Set(first).size, first.length);
    first.forEach((word) => {
      assert.match(word, /^\p{L}+$/u);
      assert.ok(word.length >= config.minLength);
      assert.ok(word.length <= config.maxLength);
    });
    const breakdown = wordProbabilityBreakdown(first[0], model, config, true);
    assert.ok(Number.isFinite(breakdown.overallLogProbability));
    assert.ok(Number.isFinite(breakdown.lettersLogProbability));
    assert.ok(Number.isFinite(breakdown.endLogProbability));
  });
}

test("des graines différentes peuvent produire des séries différentes", () => {
  const model = prepareModel(
    [{ id: "seed-fixture", name: "Français", words: productiveWords, weight: 1 }],
    baseConfig,
  );
  const variants = ["alpha", "beta", "gamma"].map((seed) =>
    JSON.stringify(generateBatch(model, { ...baseConfig, seed })),
  );
  assert.ok(new Set(variants).size > 1);
});

test("invalide le cache quand le contenu d’une source change", () => {
  const first = prepareModel(
    [{ id: "cache-fixture", name: "Cache", words: ["ab", "ac", "ad"], weight: 1 }],
    baseConfig,
  );
  const second = prepareModel(
    [{ id: "cache-fixture", name: "Cache", words: ["az", "ay", "ad"], weight: 1 }],
    baseConfig,
  );
  const transitions = nextCharacterDistribution(second, baseConfig, "a").transitions;
  assert.ok(nextCharacterDistribution(first, baseConfig, "a").transitions.some(({ letter }) => letter === "b"));
  assert.ok(transitions.some(({ letter }) => letter === "z"));
  assert.ok(!transitions.some(({ letter }) => letter === "b"));
});

test("applique ensemble les contraintes normalisées", () => {
  const config = {
    ...baseConfig,
    minLength: 5,
    maxLength: 5,
    count: 1,
    seed: "constraints",
    constraints: {
      startsWith: " A-",
      endsWith: "É",
      includes: "B",
      excludes: "X",
      allowDictionaryWords: true,
    },
  };
  const model = prepareModel(
    [{
      id: "constraints-fixture",
      name: "Contraintes",
      words: ["ababé"],
      weight: 1,
    }],
    config,
  );
  const words = generateBatch(model, config);
  assert.ok(words.length > 0);
  words.forEach((word) => {
    assert.ok(word.startsWith("a"));
    assert.ok(word.endsWith("é"));
    assert.ok(word.includes("b"));
    assert.ok(!word.includes("x"));
  });
  assert.deepEqual(
    generateBatch(model, {
      ...config,
      constraints: { ...config.constraints, allowDictionaryWords: false },
    }),
    [],
  );
});

test("calcule des scores cohérents et pénalise une transition inconnue", () => {
  const model = prepareModel(
    [
      { id: "score-ac", name: "A", words: ["ac"], weight: 3 },
      { id: "score-ab", name: "B", words: ["ab"], weight: 1 },
    ],
    baseConfig,
  );
  const score = wordProbabilityBreakdown("AC!", model, baseConfig, true);
  assert.ok(Math.abs(score.lettersLogProbability - Math.log(0.75) / 2) < 1e-12);
  assert.ok(Math.abs(score.overallLogProbability - Math.log(0.75) / 3) < 1e-12);
  assert.equal(score.endLogProbability, 0);
  assert.equal(wordProbabilityScore("AC!", model, baseConfig), score.overallLogProbability);
  assert.ok(
    wordProbabilityScore("ac", model, baseConfig) >
      wordProbabilityScore("ax", model, baseConfig),
  );
  const withoutEnd = wordProbabilityBreakdown("ac", model, baseConfig, false);
  assert.equal(withoutEnd.endLogProbability, null);
  assert.equal(withoutEnd.overallLogProbability, withoutEnd.lettersLogProbability);
});
