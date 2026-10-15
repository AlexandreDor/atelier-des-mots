import assert from "node:assert/strict";
import test from "node:test";
import {
  createAnalysisConfig,
  prepareAnalysisSources,
  scoreAnalysisWord,
} from "../app/analysis.ts";
import { prepareModel, wordProbabilityBreakdown } from "../app/generator.ts";

const dictionaries = Array.from({ length: 31 }, (_, index) => ({
  id: `analysis-${index}`,
  name: `Source ${index}`,
  words: index % 2 ? ["cascade", "cabane", "cascade"] : ["luciole", "velours"],
}));

test("retains more analysis models than the engine cache without reading sources again", () => {
  const config = createAnalysisConfig("interpolated", 5);
  const sources = prepareAnalysisSources(dictionaries, config);
  assert.equal(sources.length, 31);

  // Fill and evict the engine cache after preparing the selected sources.
  for (let index = 0; index < 32; index += 1) {
    prepareModel([{ id: `other-${index}`, name: "Other", words: ["marine"], weight: 1 }], config);
  }
  const prepared = sources.map(({ model }) => model);
  const unreadable = sources.map(({ dictionary, model }) => ({
    dictionary: {
      ...dictionary,
      get words() { throw new Error("A word edit must not rebuild the source model"); },
    },
    model,
  }));

  for (const word of ["luciole", "cascade", "marine"]) {
    for (const temperature of [0.5, 0.9, 1.8]) {
      const results = scoreAnalysisWord(word, unreadable, { ...config, temperature });
      assert.equal(results.length, 31);
      assert.ok(results.every(({ overall }) => Number.isFinite(overall)));
    }
  }
  assert.deepEqual(sources.map(({ model }) => model), prepared);
});

test("prepared analysis scores preserve each algorithm's direct-engine probabilities", () => {
  for (const algorithm of ["markov", "interpolated", "syllabic", "phonetic"]) {
    const config = createAnalysisConfig(algorithm, 5, 0.9);
    const sources = prepareAnalysisSources(dictionaries.slice(0, 2), config);
    const results = scoreAnalysisWord("CASCADE", sources, config);
    assert.equal(results.length, 2);
    assert.ok(results[0].overall >= results[1].overall);
    assert.equal(results.find(({ dictionary }) => dictionary.id === "analysis-1").present, true);
    assert.equal(results.find(({ dictionary }) => dictionary.id === "analysis-0").present, false);
    for (const { dictionary, overall, letters, end } of results) {
      const direct = prepareModel([{ ...dictionary, weight: 1 }], config);
      const breakdown = wordProbabilityBreakdown("CASCADE", direct, config, true);
      const percent = (logProbability) =>
        logProbability === null || !Number.isFinite(logProbability)
          ? 0
          : Math.min(100, Math.max(0, Math.exp(logProbability) * 100));
      assert.equal(overall, percent(breakdown.overallLogProbability));
      assert.equal(letters, percent(breakdown.lettersLogProbability));
      assert.equal(end, percent(breakdown.endLogProbability));
    }
  }
});

test("blank input does not produce scores and phonetic context is bounded", () => {
  const config = createAnalysisConfig("phonetic", 5, 0.9);
  assert.equal(config.order, 3);
  const sources = prepareAnalysisSources(dictionaries.slice(0, 1), config);
  assert.deepEqual(scoreAnalysisWord("-- 123", sources, config), []);
});
