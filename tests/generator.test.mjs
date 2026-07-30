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
    count: 2,
    seed: "constraints",
    constraints: {
      startsWith: " A-",
      endsWith: "É",
      includes: "B",
      excludes: "X",
      allowDictionaryWords: false,
    },
  };
  const model = prepareModel(
    [{
      id: "constraints-fixture",
      name: "Contraintes",
      words: ["abacé", "abaré", "abiré", "aburé", "abosé"],
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
    assert.ok(!model.sourceWords.has(word));
  });
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
