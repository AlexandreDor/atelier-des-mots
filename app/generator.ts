export type Algorithm =
  | "markov"
  | "interpolated"
  | "syllabic"
  | "phonetic";

export type GenerationConstraints = {
  startsWith: string;
  endsWith: string;
  includes: string;
  excludes: string;
  allowDictionaryWords: boolean;
};

export type GeneratorConfig = {
  algorithm: Algorithm;
  order: number;
  temperature: number;
  interpolation: number;
  minLength: number;
  maxLength: number;
  count: number;
  seed: string;
  constraints: GenerationConstraints;
};

export type WeightedSource = {
  id: string;
  name: string;
  words: string[];
  weight: number;
};

export type Transition = {
  letter: string;
  probability: number;
};

type TransitionModel = Map<string, Map<string, number>>;

export type PreparedModel = {
  models: Map<number, TransitionModel>;
  phoneticModel: TransitionModel | null;
  phoneticOrder: number;
  phoneticGroups: string[];
  letterCounts: Map<string, number>;
  wordLengthCounts: Map<number, number>;
  sourceWords: Set<string>;
  sourceCount: number;
  totalWords: number;
};

const START = "^";
const END = "$";
const VOWELS = new Set(
  Array.from(
    "aeiouyàáâäèéêëìíîïòóôöùúûüÿæœāēīōūаеёиоуыэюя",
  ),
);
const BASE_PHONETIC_GROUPS = [
  "sch",
  "tch",
  "chr",
  "str",
  "thr",
  "sh",
  "ch",
  "th",
  "ph",
  "qu",
  "gn",
  "ts",
  "kh",
  "zh",
  "dj",
  "ky",
  "gy",
  "ny",
  "ry",
  "my",
  "hy",
  "py",
  "by",
  "ai",
  "au",
  "ei",
  "eu",
  "oi",
  "ou",
  "ui",
  "ie",
  "ee",
  "oo",
  "ll",
  "rr",
];

const LANGUAGE_PHONETIC_GROUPS: Record<string, string[]> = {
  french: [
    "eaux",
    "eau",
    "oin",
    "ien",
    "ill",
    "ail",
    "eil",
    "oeu",
    "ch",
    "ou",
    "gn",
    "oi",
    "ai",
    "eu",
  ],
  english: [
    "ough",
    "tion",
    "igh",
    "tch",
    "dge",
    "th",
    "sh",
    "ch",
    "ee",
    "oo",
    "ea",
    "ph",
    "wh",
    "ck",
    "ng",
  ],
  german: [
    "tsch",
    "sch",
    "chs",
    "ch",
    "ei",
    "ie",
    "eu",
    "äu",
    "pf",
    "sp",
    "st",
  ],
  japanese: [
    "kya",
    "kyu",
    "kyo",
    "sha",
    "shu",
    "sho",
    "cha",
    "chu",
    "cho",
    "rya",
    "ryu",
    "ryo",
    "nya",
    "nyu",
    "nyo",
    "hya",
    "hyu",
    "hyo",
    "gya",
    "gyu",
    "gyo",
    "ja",
    "ju",
    "jo",
    "tsu",
    "shi",
    "chi",
    "fu",
  ],
  italian: [
    "gli",
    "sci",
    "gn",
    "ch",
    "gh",
    "sc",
    "ci",
    "ce",
    "qu",
  ],
  spanish: [
    "rr",
    "ll",
    "ch",
    "qu",
    "gu",
    "gue",
    "gui",
    "ñ",
  ],
  russian: [
    "shch",
    "zh",
    "kh",
    "ts",
    "ch",
    "sh",
    "yu",
    "ya",
    "yo",
    "ye",
  ],
};

type SourceModel = {
  models: Map<number, TransitionModel>;
  phoneticModel: TransitionModel | null;
  letterCounts: Map<string, number>;
  wordLengthCounts: Map<number, number>;
  sourceWords: Set<string>;
  totalWords: number;
};

const sourceModelCache = new Map<string, SourceModel>();
const sourceContentHashCache = new WeakMap<string[], number>();

export function normalizeWord(value: string) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^\p{L}]/gu, "");
}

function addCount(
  model: TransitionModel,
  context: string,
  next: string,
  amount: number,
) {
  const counts = model.get(context) ?? new Map<string, number>();
  counts.set(next, (counts.get(next) ?? 0) + amount);
  model.set(context, counts);
}

function addLetterWord(
  model: TransitionModel,
  word: string,
  order: number,
  amount: number,
) {
  const sample = START.repeat(order) + word + END;
  for (let index = order; index < sample.length; index += 1) {
    addCount(
      model,
      sample.slice(index - order, index),
      sample[index],
      amount,
    );
  }
}

function languageForSource(source: WeightedSource) {
  const label = `${source.id} ${source.name}`.toLocaleLowerCase("fr-FR");
  if (/(fran[cç]ais|french)/.test(label)) return "french";
  if (/(anglais|english)/.test(label)) return "english";
  if (/(allemand|german|deutsch)/.test(label)) return "german";
  if (/(japonais|japanese|romaji|rōmaji)/.test(label)) return "japanese";
  if (/(italien|italian)/.test(label)) return "italian";
  if (/(espagnol|spanish)/.test(label)) return "spanish";
  if (/(russe|russian|cyrillique|romanisé)/.test(label)) return "russian";
  return null;
}

function phoneticGroupsForSources(sources: WeightedSource[]) {
  const groups = new Set(BASE_PHONETIC_GROUPS);
  sources.forEach((source) => {
    const language = languageForSource(source);
    if (!language) return;
    LANGUAGE_PHONETIC_GROUPS[language].forEach((group) => groups.add(group));
  });
  return Array.from(groups).sort((a, b) => b.length - a.length);
}

function tokenizePhonetic(word: string, groups: string[]) {
  const tokens: string[] = [];
  let cursor = 0;
  while (cursor < word.length) {
    const group = groups.find((candidate) =>
      word.startsWith(candidate, cursor),
    );
    const token = group ?? word[cursor];
    tokens.push(token);
    cursor += token.length;
  }
  return tokens;
}

function addPhoneticWord(
  model: TransitionModel,
  word: string,
  order: number,
  amount: number,
  groups: string[],
) {
  const tokens = [
    ...Array.from({ length: order }, () => START),
    ...tokenizePhonetic(word, groups),
    END,
  ];
  for (let index = order; index < tokens.length; index += 1) {
    addCount(
      model,
      tokens.slice(index - order, index).join("|"),
      tokens[index],
      amount,
    );
  }
}

function mergeCounts(
  target: TransitionModel,
  source: TransitionModel,
  multiplier: number,
) {
  source.forEach((counts, context) => {
    counts.forEach((count, next) => {
      addCount(target, context, next, count * multiplier);
    });
  });
}

function sourceModel(
  source: WeightedSource,
  requestedOrders: number[],
  phoneticOrder: number,
  phoneticGroups: string[],
  usePhonetic: boolean,
) {
  const normalizedWords = Array.from(
    new Set(source.words.map(normalizeWord).filter(Boolean)),
  );
  let contentHash = sourceContentHashCache.get(source.words);
  if (contentHash === undefined) {
    let computedHash = 2166136261;
    normalizedWords.forEach((word) => {
      for (const character of word) {
        computedHash ^= character.codePointAt(0) ?? 0;
        computedHash = Math.imul(computedHash, 16777619);
      }
      computedHash ^= 0;
      computedHash = Math.imul(computedHash, 16777619);
    });
    contentHash = computedHash;
    sourceContentHashCache.set(source.words, contentHash);
  }
  const cacheKey = JSON.stringify({
    id: source.id,
    size: normalizedWords.length,
    contentHash: contentHash >>> 0,
    orders: requestedOrders,
    phoneticOrder: usePhonetic ? phoneticOrder : 0,
    phoneticGroups: usePhonetic ? phoneticGroups : [],
  });
  const cached = sourceModelCache.get(cacheKey);
  if (cached) return cached;

  const models = new Map<number, TransitionModel>(
    requestedOrders.map((order) => [order, new Map()]),
  );
  const phoneticModel: TransitionModel | null = usePhonetic ? new Map() : null;
  const letterCounts = new Map<string, number>();
  const wordLengthCounts = new Map<number, number>();
  const sourceWords = new Set(normalizedWords);
  const contribution = normalizedWords.length ? 1 / normalizedWords.length : 0;

  normalizedWords.forEach((word) => {
    wordLengthCounts.set(
      word.length,
      (wordLengthCounts.get(word.length) ?? 0) + contribution,
    );
    Array.from(word).forEach((letter) => {
      letterCounts.set(letter, (letterCounts.get(letter) ?? 0) + contribution);
    });
    requestedOrders.forEach((order) => {
      addLetterWord(models.get(order)!, word, order, contribution);
    });
    if (phoneticModel) {
      addPhoneticWord(
        phoneticModel,
        word,
        phoneticOrder,
        contribution,
        phoneticGroups,
      );
    }
  });

  const built = {
    models,
    phoneticModel,
    letterCounts,
    wordLengthCounts,
    sourceWords,
    totalWords: normalizedWords.length,
  };
  sourceModelCache.set(cacheKey, built);
  return built;
}

export function prepareModel(
  sources: WeightedSource[],
  config: GeneratorConfig,
): PreparedModel {
  const requestedOrders =
    config.algorithm === "interpolated"
      ? Array.from({ length: config.order }, (_, index) => index + 1)
      : config.algorithm === "markov"
        ? [config.order]
        : [];
  const models = new Map<number, TransitionModel>(
    requestedOrders.map((order) => [order, new Map()]),
  );
  const phoneticOrder = Math.min(3, Math.max(1, config.order));
  const phoneticGroups = phoneticGroupsForSources(sources);
  const phoneticModel: TransitionModel | null =
    config.algorithm === "phonetic" ? new Map() : null;
  const letterCounts = new Map<string, number>();
  const wordLengthCounts = new Map<number, number>();
  const sourceWords = new Set<string>();
  let totalWords = 0;

  sources.forEach((source) => {
    const built = sourceModel(
      source,
      requestedOrders,
      phoneticOrder,
      phoneticGroups,
      config.algorithm === "phonetic",
    );
    if (!built.totalWords) return;

    totalWords += built.totalWords;
    built.sourceWords.forEach((word) => sourceWords.add(word));
    built.letterCounts.forEach((count, letter) => {
      letterCounts.set(
        letter,
        (letterCounts.get(letter) ?? 0) + count * source.weight,
      );
    });
    built.wordLengthCounts.forEach((count, length) => {
      wordLengthCounts.set(
        length,
        (wordLengthCounts.get(length) ?? 0) + count * source.weight,
      );
    });
    requestedOrders.forEach((order) => {
      mergeCounts(
        models.get(order)!,
        built.models.get(order) ?? new Map(),
        source.weight,
      );
    });
    if (phoneticModel && built.phoneticModel) {
      mergeCounts(phoneticModel, built.phoneticModel, source.weight);
    }
  });

  return {
    models,
    phoneticModel,
    phoneticOrder,
    phoneticGroups,
    letterCounts,
    wordLengthCounts,
    sourceWords,
    sourceCount: sources.length,
    totalWords,
  };
}

function temperatureWeights(
  counts: Map<string, number>,
  temperature: number,
) {
  return Array.from(counts.entries()).map(([letter, count]) => ({
    letter,
    weight: Math.pow(Math.max(count, Number.EPSILON), 1 / temperature),
  }));
}

function weightedChoice(
  counts: Map<string, number>,
  temperature: number,
  random: () => number,
  excluded = new Set<string>(),
) {
  const adjusted = temperatureWeights(counts, temperature).filter(
    ({ letter }) => !excluded.has(letter),
  );
  if (!adjusted.length) return null;

  const total = adjusted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * total;
  for (const item of adjusted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.letter;
  }
  return adjusted.at(-1)?.letter ?? null;
}

function markovCounts(
  prepared: PreparedModel,
  prefix: string,
  config: GeneratorConfig,
) {
  if (config.algorithm === "markov") {
    const context = (START.repeat(config.order) + prefix).slice(-config.order);
    return prepared.models.get(config.order)?.get(context) ?? new Map();
  }

  const mixed = new Map<string, number>();
  for (let order = 1; order <= config.order; order += 1) {
    const context = (START.repeat(order) + prefix).slice(-order);
    const counts = prepared.models.get(order)?.get(context);
    if (!counts?.size) continue;
    const total = Array.from(counts.values()).reduce(
      (sum, value) => sum + value,
      0,
    );
    const shorterContextInfluence = 1.05 - config.interpolation;
    const coefficient = Math.pow(
      shorterContextInfluence,
      config.order - order,
    );
    counts.forEach((count, letter) => {
      mixed.set(
        letter,
        (mixed.get(letter) ?? 0) + coefficient * (count / total),
      );
    });
  }
  return mixed;
}

function generateMarkovWord(
  prepared: PreparedModel,
  config: GeneratorConfig,
  random: () => number,
) {
  let result = "";
  for (let step = 0; step < config.maxLength + config.order + 4; step += 1) {
    const counts = markovCounts(prepared, result, config);
    if (!counts.size) break;
    const excluded =
      result.length < config.minLength
        ? new Set<string>([END])
        : new Set<string>();
    const next = weightedChoice(counts, config.temperature, random, excluded);
    if (!next || next === END) break;
    result += next;
    if (result.length >= config.maxLength) break;
  }
  return result;
}

function generateSyllabicWord(
  prepared: PreparedModel,
  config: GeneratorConfig,
  random: () => number,
) {
  const vowels = new Map(
    Array.from(prepared.letterCounts.entries()).filter(([letter]) =>
      VOWELS.has(letter),
    ),
  );
  const consonants = new Map(
    Array.from(prepared.letterCounts.entries()).filter(
      ([letter]) => !VOWELS.has(letter),
    ),
  );
  const target =
    config.minLength +
    Math.floor(random() * (config.maxLength - config.minLength + 1));
  let useVowel = random() > 0.7;
  let result = "";

  while (result.length < target) {
    const pool = useVowel ? vowels : consonants;
    const next = weightedChoice(
      pool.size ? pool : prepared.letterCounts,
      config.temperature,
      random,
    );
    if (!next) break;
    result += next;
    useVowel = !useVowel;
  }
  return result;
}

function phoneticCounts(prepared: PreparedModel, tokens: string[]) {
  const context = [
    ...Array.from({ length: prepared.phoneticOrder }, () => START),
    ...tokens,
  ]
    .slice(-prepared.phoneticOrder)
    .join("|");
  return prepared.phoneticModel?.get(context) ?? new Map();
}

function generatePhoneticWord(
  prepared: PreparedModel,
  config: GeneratorConfig,
  random: () => number,
) {
  const tokens: string[] = [];
  let result = "";

  for (let step = 0; step < config.maxLength + 5; step += 1) {
    const counts = phoneticCounts(prepared, tokens);
    if (!counts.size) break;
    const excluded = new Set<string>();
    if (result.length < config.minLength) excluded.add(END);
    counts.forEach((_, token) => {
      if (token !== END && result.length + token.length > config.maxLength) {
        excluded.add(token);
      }
    });
    const next = weightedChoice(counts, config.temperature, random, excluded);
    if (!next || next === END) break;
    tokens.push(next);
    result += next;
    if (result.length >= config.maxLength) break;
  }
  return result;
}

export function generateBatch(
  prepared: PreparedModel,
  config: GeneratorConfig,
) {
  const generated = new Set<string>();
  let attempts = 0;
  const maximumAttempts = Math.max(1200, config.count * 240);
  const random = seededRandom(config.seed);
  const startsWith = normalizeWord(config.constraints?.startsWith ?? "");
  const endsWith = normalizeWord(config.constraints?.endsWith ?? "");
  const includes = normalizeWord(config.constraints?.includes ?? "");
  const excludedCharacters = new Set(
    Array.from(normalizeWord(config.constraints?.excludes ?? "")),
  );
  const allowDictionaryWords =
    config.constraints?.allowDictionaryWords ?? true;

  while (generated.size < config.count && attempts < maximumAttempts) {
    attempts += 1;
    const word =
      config.algorithm === "syllabic"
        ? generateSyllabicWord(prepared, config, random)
        : config.algorithm === "phonetic"
          ? generatePhoneticWord(prepared, config, random)
          : generateMarkovWord(prepared, config, random);
    if (
      word.length >= config.minLength &&
      word.length <= config.maxLength &&
      word.length > 0 &&
      (!startsWith || word.startsWith(startsWith)) &&
      (!endsWith || word.endsWith(endsWith)) &&
      (!includes || word.includes(includes)) &&
      !Array.from(word).some((letter) => excludedCharacters.has(letter)) &&
      (allowDictionaryWords || !prepared.sourceWords.has(word))
    ) {
      generated.add(word);
    }
  }
  return Array.from(generated);
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (const character of value || "atelier-des-mots") {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function toDistribution(
  counts: Map<string, number>,
  temperature: number,
) {
  const adjusted = temperatureWeights(counts, temperature);
  const total = adjusted.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return [] as Transition[];
  return adjusted
    .map(({ letter, weight }) => ({
      letter: letter === END ? "fin" : letter,
      probability: (weight / total) * 100,
    }))
    .sort((a, b) => b.probability - a.probability);
}

export function nextCharacterDistribution(
  prepared: PreparedModel,
  config: GeneratorConfig,
  value: string,
) {
  const prefix = normalizeWord(value);
  let counts: Map<string, number>;

  if (
    config.algorithm === "markov" ||
    config.algorithm === "interpolated"
  ) {
    counts = markovCounts(prepared, prefix, config);
  } else if (config.algorithm === "phonetic") {
    counts = phoneticCounts(
      prepared,
      tokenizePhonetic(prefix, prepared.phoneticGroups),
    );
  } else {
    const lastLetter = Array.from(prefix).at(-1);
    const expectVowel = lastLetter ? !VOWELS.has(lastLetter) : false;
    const pool = new Map(
      Array.from(prepared.letterCounts.entries()).filter(([letter]) =>
        expectVowel ? VOWELS.has(letter) : !VOWELS.has(letter),
      ),
    );
    counts = pool.size ? pool : prepared.letterCounts;
  }

  return {
    context: prefix || "début du mot",
    transitions: toDistribution(counts, config.temperature),
  };
}

function logProbability(
  counts: Map<string, number>,
  next: string,
  temperature: number,
) {
  const adjusted = temperatureWeights(counts, temperature);
  const total = adjusted.reduce((sum, item) => sum + item.weight, 0);
  const match = adjusted.find((item) => item.letter === next);
  return match && total ? Math.log(match.weight / total) : Math.log(1e-12);
}

export function wordProbabilityScore(
  word: string,
  prepared: PreparedModel,
  config: GeneratorConfig,
  includeEnd = true,
) {
  return wordProbabilityBreakdown(
    word,
    prepared,
    config,
    includeEnd,
  ).overallLogProbability;
}

export function wordProbabilityBreakdown(
  word: string,
  prepared: PreparedModel,
  config: GeneratorConfig,
  includeEnd = true,
) {
  const normalized = normalizeWord(word);
  if (!normalized) {
    return {
      overallLogProbability: Number.NEGATIVE_INFINITY,
      lettersLogProbability: Number.NEGATIVE_INFINITY,
      endLogProbability: null,
    };
  }
  let lettersScore = 0;
  let letterSteps = 0;
  let endScore: number | null = null;

  if (
    config.algorithm === "markov" ||
    config.algorithm === "interpolated"
  ) {
    let prefix = "";
    for (const letter of normalized) {
      lettersScore += logProbability(
        markovCounts(prepared, prefix, config),
        letter,
        config.temperature,
      );
      prefix += letter;
      letterSteps += 1;
    }
    if (includeEnd) {
      endScore = logProbability(
        markovCounts(prepared, prefix, config),
        END,
        config.temperature,
      );
    }
  } else if (config.algorithm === "phonetic") {
    const prefixTokens: string[] = [];
    for (const token of tokenizePhonetic(
      normalized,
      prepared.phoneticGroups,
    )) {
      lettersScore += logProbability(
        phoneticCounts(prepared, prefixTokens),
        token,
        config.temperature,
      );
      prefixTokens.push(token);
      letterSteps += 1;
    }
    if (includeEnd) {
      endScore = logProbability(
        phoneticCounts(prepared, prefixTokens),
        END,
        config.temperature,
      );
    }
  } else {
    for (const letter of normalized) {
      lettersScore += logProbability(
        prepared.letterCounts,
        letter,
        config.temperature,
      );
      letterSteps += 1;
    }
    if (includeEnd) {
      const total = Array.from(prepared.wordLengthCounts.values()).reduce(
        (sum, count) => sum + count,
        0,
      );
      const count = prepared.wordLengthCounts.get(normalized.length) ?? 0;
      endScore = count && total ? Math.log(count / total) : Math.log(1e-12);
    }
  }

  const lettersAverage = lettersScore / Math.max(letterSteps, 1);
  const totalSteps = letterSteps + (endScore === null ? 0 : 1);
  const overallAverage =
    (lettersScore + (endScore ?? 0)) / Math.max(totalSteps, 1);

  return {
    overallLogProbability: overallAverage,
    lettersLogProbability: lettersAverage,
    endLogProbability: endScore,
  };
}
