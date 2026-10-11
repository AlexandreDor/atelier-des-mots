import type { Dictionary } from "./dictionaries";
import {
  normalizeWord,
  prepareModel,
  wordProbabilityBreakdown,
  type Algorithm,
  type GeneratorConfig,
  type PreparedModel,
} from "./generator";

export type AnalysisSource = {
  dictionary: Dictionary;
  model: PreparedModel;
};

export function createAnalysisConfig(
  algorithm: Algorithm,
  order: number,
  temperature = 1,
): GeneratorConfig {
  return {
    algorithm,
    order: algorithm === "phonetic" ? Math.min(3, order) : order,
    temperature,
    interpolation: 0.7,
    minLength: 1,
    maxLength: 40,
    count: 1,
    seed: "analyse",
    constraints: {
      startsWith: "",
      endsWith: "",
      includes: "",
      excludes: "",
      allowDictionaryWords: true,
    },
  };
}

// The caller retains the selected models for its analysis session, independently
// of the engine's bounded cache and of the word/temperature being compared.
export function prepareAnalysisSources(
  dictionaries: Dictionary[],
  config: GeneratorConfig,
): AnalysisSource[] {
  return dictionaries.map((dictionary) => ({
    dictionary,
    model: prepareModel([{ ...dictionary, weight: 1 }], config),
  }));
}

function scorePercent(logProbability: number | null) {
  if (logProbability === null || !Number.isFinite(logProbability)) return 0;
  return Math.min(100, Math.max(0, Math.exp(logProbability) * 100));
}

export function scoreAnalysisWord(
  word: string,
  sources: AnalysisSource[],
  config: GeneratorConfig,
) {
  const normalizedWord = normalizeWord(word);
  if (!normalizedWord) return [];
  return sources
    .map(({ dictionary, model }) => {
      const breakdown = wordProbabilityBreakdown(word, model, config, true);
      return {
        dictionary,
        overall: scorePercent(breakdown.overallLogProbability),
        letters: scorePercent(breakdown.lettersLogProbability),
        end: scorePercent(breakdown.endLogProbability),
        present: model.sourceWords.has(normalizedWord),
      };
    })
    .sort((first, second) => second.overall - first.overall);
}
