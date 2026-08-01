"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DictionaryManager } from "./dictionary-manager";
import {
  dictionaryFingerprint,
  INITIAL_DICTIONARIES,
  isFirstNameDictionary,
  isNatureDictionary,
  isPlaceDictionary,
  type Dictionary,
} from "./dictionaries";
import { downloadTextFile, escapeCsvCell } from "./download";
import {
  Algorithm,
  GeneratorConfig,
  PreparedModel,
  WeightedSource,
  generateBatch,
  nextCharacterDistribution,
  normalizeWord,
  prepareModel,
  wordProbabilityBreakdown,
  wordProbabilityScore,
} from "./generator";
import { useDictionaries } from "./use-dictionaries";

type SortMode = "random" | "alphabetical" | "probability";
type DictionaryCategory = "first-names" | "words" | "places" | "nature";

const FAVORITES_KEY = "atelier-des-mots:favorites:v1";
const PRESETS_KEY = "atelier-des-mots:presets:v1";

type Preset = {
  id: string;
  name: string;
  config: GeneratorConfig;
  dictionaryWeights: Record<string, number>;
};

type GenerationResponse = {
  id: number;
  model: PreparedModel;
  words: string[];
};

const DICTIONARY_LANGUAGE_ORDER = [
  "fr",
  "en",
  "ja",
  "es",
  "it",
  "ru-cyrillique",
  "ru-romanise",
  "de",
] as const;
const INITIAL_CONFIG: GeneratorConfig = {
  algorithm: "markov",
  order: 2,
  temperature: 0.9,
  interpolation: 0.7,
  minLength: 5,
  maxLength: 10,
  count: 9,
  seed: "",
  constraints: {
    startsWith: "",
    endsWith: "",
    includes: "",
    excludes: "",
    allowDictionaryWords: true,
  },
};

function randomInteger(minimum: number, maximum: number) {
  return (
    minimum + Math.floor(Math.random() * (maximum - minimum + 1))
  );
}

function normalizeGenerationCount(value: number) {
  return Math.min(300, Math.max(3, Math.round(value / 3) * 3));
}

const INITIAL_RESULTS = [
  "brumelle",
  "sorvain",
  "clérine",
  "florance",
  "mirelon",
  "aubrel",
  "valinette",
  "doréane",
  "sermique",
];

function randomRank(word: string, seed: number) {
  let hash = seed || 1;
  for (const letter of word) {
    hash = Math.imul(hash ^ letter.codePointAt(0)!, 2654435761);
  }
  return (hash >>> 0) / 4294967295;
}

function seedNumber(value: string) {
  let hash = 2166136261;
  for (const character of value || "atelier-des-mots") {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createGenerationSeed() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return `atelier-${values[0].toString(36)}-${values[1].toString(36)}`;
  }
  return `atelier-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function scorePercent(logProbability: number | null) {
  if (logProbability === null || !Number.isFinite(logProbability)) return 0;
  return Math.min(100, Math.max(0, Math.exp(logProbability) * 100));
}

function shortenedWord(word: string) {
  const characters = Array.from(word);
  return characters.length > 14
    ? `${characters.slice(0, 14).join("")}…`
    : word;
}

function selectedSources(
  dictionaries: Dictionary[],
  weights: Record<string, number>,
) {
  return dictionaries
    .filter((dictionary) => weights[dictionary.id] > 0)
    .map(
      (dictionary): WeightedSource => ({
        ...dictionary,
        weight: weights[dictionary.id],
      }),
    );
}

function configurationSignature(
  config: GeneratorConfig,
  dictionaries: Dictionary[],
  weights: Record<string, number>,
) {
  return JSON.stringify({
    config,
    sources: dictionaries
      .filter((dictionary) => weights[dictionary.id] > 0)
      .map((dictionary) => [
        dictionary.id,
        dictionary.name,
        weights[dictionary.id],
        dictionaryFingerprint(dictionary),
      ]),
  });
}

function modelSignature(
  config: GeneratorConfig,
  sources: WeightedSource[],
) {
  return JSON.stringify({
    algorithm: config.algorithm,
    order: config.order,
    sources: sources.map((source) => [
      source.id,
      source.name,
      source.weight,
      dictionaryFingerprint(source),
    ]),
  });
}

function algorithmLabel(algorithm: Algorithm) {
  if (algorithm === "interpolated") return "Markov interpolé";
  if (algorithm === "phonetic") return "Modèle phonétique";
  if (algorithm === "syllabic") return "Alternance syllabique";
  return "Markov";
}

function dictionaryLanguageKey(dictionary: Dictionary) {
  if (dictionary.id.startsWith("ru-") && dictionary.id.includes("cyrillique")) {
    return "ru-cyrillique";
  }
  if (dictionary.id.startsWith("ru-") && dictionary.id.includes("romanise")) {
    return "ru-romanise";
  }
  return dictionary.id.split("-")[0];
}

function dictionarySortRank(dictionary: Dictionary) {
  const rank = DICTIONARY_LANGUAGE_ORDER.indexOf(
    dictionaryLanguageKey(dictionary) as (typeof DICTIONARY_LANGUAGE_ORDER)[number],
  );
  return rank === -1 ? DICTIONARY_LANGUAGE_ORDER.length : rank;
}

const DEFAULT_DICTIONARY =
  INITIAL_DICTIONARIES.find(isFirstNameDictionary) ?? INITIAL_DICTIONARIES[0];

export default function Home() {
  const {
    dictionaries,
    customDictionaries,
    setCustomDictionaries,
    isLoaded: dictionariesLoaded,
    storageError,
  } = useDictionaries();
  const initialWeights = { [DEFAULT_DICTIONARY.id]: 1 };
  const initialPreparedModel = () =>
    prepareModel(
      selectedSources(INITIAL_DICTIONARIES, initialWeights),
      INITIAL_CONFIG,
    );
  const [managedDictionaryId, setManagedDictionaryId] = useState("");
  const [dictionaryCategory, setDictionaryCategory] =
    useState<DictionaryCategory>("first-names");
  const [dictionaryWeights, setDictionaryWeights] =
    useState<Record<string, number>>(initialWeights);
  const [algorithm, setAlgorithm] = useState<Algorithm>("markov");
  const [order, setOrder] = useState(2);
  const [temperature, setTemperature] = useState(0.9);
  const [interpolation, setInterpolation] = useState(0.7);
  const [minLength, setMinLength] = useState(5);
  const [maxLength, setMaxLength] = useState(10);
  const [count, setCount] = useState(9);
  const [generationSeed, setGenerationSeed] = useState("");
  const [lastUsedSeed, setLastUsedSeed] = useState("");
  const [seedCopied, setSeedCopied] = useState(false);
  const [startsWith, setStartsWith] = useState("");
  const [endsWith, setEndsWith] = useState("");
  const [includesText, setIncludesText] = useState("");
  const [excludesText, setExcludesText] = useState("");
  const [allowDictionaryWords, setAllowDictionaryWords] = useState(true);
  const [activeConfig, setActiveConfig] =
    useState<GeneratorConfig>(INITIAL_CONFIG);
  const [activeModel, setActiveModel] =
    useState<PreparedModel>(initialPreparedModel);
  const [appliedSignature, setAppliedSignature] = useState(() =>
    configurationSignature(
      INITIAL_CONFIG,
      INITIAL_DICTIONARIES,
      initialWeights,
    ),
  );
  const [results, setResults] = useState(INITIAL_RESULTS);
  const [isManaging, setIsManaging] = useState(false);
  const [message, setMessage] = useState("");
  const [copiedWord, setCopiedWord] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("random");
  const [sortInverted, setSortInverted] = useState(false);
  const [randomSeed, setRandomSeed] = useState(20260724);
  const [probeText, setProbeText] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [openSections, setOpenSections] = useState({
    source: true,
    model: true,
    series: true,
    constraints: true,
  });
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);
  const persistenceReady = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const revealFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let storedFavorites: string[] = [];
    let storedPresets: Preset[] = [];
    try {
      const parsedFavorites = JSON.parse(
        window.localStorage.getItem(FAVORITES_KEY) ?? "[]",
      );
      const parsedPresets = JSON.parse(
        window.localStorage.getItem(PRESETS_KEY) ?? "[]",
      );
      if (Array.isArray(parsedFavorites)) {
        storedFavorites = Array.from(
          new Set(parsedFavorites.filter((word) => typeof word === "string")),
        );
      }
      if (Array.isArray(parsedPresets)) storedPresets = parsedPresets;
    } catch {
      // Keep a clean local collection when stored data cannot be read.
    }
    const timeout = window.setTimeout(() => {
      setFavorites(storedFavorites);
      setPresets(storedPresets);
      persistenceReady.current = true;
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!persistenceReady.current) return;
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (!persistenceReady.current) return;
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    const worker = new Worker(new URL("./generator.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      if (revealFrameRef.current !== null) {
        window.cancelAnimationFrame(revealFrameRef.current);
      }
    };
  }, []);

  const draftConfig: GeneratorConfig = {
    algorithm,
    order: algorithm === "phonetic" ? Math.min(order, 3) : order,
    temperature,
    interpolation,
    minLength,
    maxLength,
    count,
    seed: generationSeed.trim(),
    constraints: {
      startsWith,
      endsWith,
      includes: includesText,
      excludes: excludesText,
      allowDictionaryWords,
    },
  };
  const selectedCount = Object.values(dictionaryWeights).filter(
    (weight) => weight > 0,
  ).length;
  const dictionaryWeightTotal = Object.values(dictionaryWeights).reduce(
    (sum, weight) => sum + Math.max(0, weight),
    0,
  );
  const selectedWordCount = selectedSources(
    dictionaries,
    dictionaryWeights,
  ).reduce((sum, source) => sum + source.words.length, 0);
  const hasPendingChanges =
    configurationSignature(draftConfig, dictionaries, dictionaryWeights) !==
    appliedSignature;
  const nextDistribution = useMemo(
    () => nextCharacterDistribution(activeModel, activeConfig, probeText),
    [activeModel, activeConfig, probeText],
  );
  const probeIncludesEnd = probeText.trimEnd().endsWith(".");
  const probeScore = useMemo(() => {
    if (!normalizeWord(probeText)) return null;
    const breakdown = wordProbabilityBreakdown(
      probeText,
      activeModel,
      activeConfig,
      probeIncludesEnd,
    );
    return {
      overall: scorePercent(breakdown.overallLogProbability),
      letters: scorePercent(breakdown.lettersLogProbability),
      end:
        breakdown.endLogProbability === null
          ? null
          : scorePercent(breakdown.endLogProbability),
    };
  }, [probeText, probeIncludesEnd, activeModel, activeConfig]);
  const dictionaryGroups = useMemo(() => {
    const sorted = [...dictionaries].sort(
      (first, second) =>
        dictionarySortRank(first) - dictionarySortRank(second) ||
        first.name.localeCompare(second.name, "fr", { sensitivity: "base" }),
    );
    return [
      {
        id: "first-names",
        label: "Prénoms",
        dictionaries: sorted.filter(isFirstNameDictionary),
      },
      {
        id: "words",
        label: "Mots",
        dictionaries: sorted.filter(
          (dictionary) =>
            !isFirstNameDictionary(dictionary) &&
            !isPlaceDictionary(dictionary) &&
            !isNatureDictionary(dictionary),
        ),
      },
      {
        id: "places",
        label: "Lieux",
        dictionaries: sorted.filter(isPlaceDictionary),
      },
      {
        id: "nature",
        label: "Nature et sciences",
        dictionaries: sorted.filter(isNatureDictionary),
      },
    ];
  }, [dictionaries]);
  const activeDictionaryGroup =
    dictionaryGroups.find((group) => group.id === dictionaryCategory) ??
    dictionaryGroups[0];
  const selectedByCategory = useMemo(
    () =>
      Object.fromEntries(
        dictionaryGroups.map((group) => [
          group.id,
          group.dictionaries.filter(
            (dictionary) => dictionaryWeights[dictionary.id] > 0,
          ).length,
        ]),
      ) as Record<DictionaryCategory, number>,
    [dictionaryGroups, dictionaryWeights],
  );
  const resultScores = useMemo(
    () =>
      new Map(
        results.map((word) => {
          const breakdown = wordProbabilityBreakdown(
            word,
            activeModel,
            activeConfig,
          );
          return [
            word,
            {
              overall: scorePercent(breakdown.overallLogProbability),
              letters: scorePercent(breakdown.lettersLogProbability),
              end: scorePercent(breakdown.endLogProbability),
            },
          ];
        }),
      ),
    [results, activeModel, activeConfig],
  );
  const displayedResults = useMemo(() => {
    const sorted = [...results];
    if (sortMode === "alphabetical") {
      sorted.sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    } else if (sortMode === "probability") {
      const scores = new Map(
        sorted.map((word) => [
          word,
          wordProbabilityScore(word, activeModel, activeConfig),
        ]),
      );
      sorted.sort((a, b) => scores.get(b)! - scores.get(a)!);
    } else {
      sorted.sort(
        (a, b) => randomRank(a, randomSeed) - randomRank(b, randomSeed),
      );
    }
    return sortInverted ? sorted.reverse() : sorted;
  }, [
    results,
    sortMode,
    sortInverted,
    randomSeed,
    activeModel,
    activeConfig,
  ]);

  const sortDirectionLabel =
    sortMode === "alphabetical"
      ? sortInverted
        ? "Z vers A"
        : "A vers Z"
      : sortMode === "probability"
        ? sortInverted
          ? "Du moins probable au plus probable"
          : "Du plus probable au moins probable"
        : sortInverted
          ? "Ordre aléatoire inversé"
          : "Ordre aléatoire";

  function revealResults(next: string[], done: () => void) {
    if (revealFrameRef.current !== null) {
      window.cancelAnimationFrame(revealFrameRef.current);
    }
    setResults([]);
    if (!next.length) {
      done();
      return;
    }
    let cursor = 0;
    const reveal = () => {
      cursor = Math.min(next.length, cursor + 12);
      setResults(next.slice(0, cursor));
      if (cursor < next.length) {
        revealFrameRef.current = window.requestAnimationFrame(reveal);
      } else {
        revealFrameRef.current = null;
        done();
      }
    };
    revealFrameRef.current = window.requestAnimationFrame(reveal);
  }

  function requestGeneration(
    sources: WeightedSource[],
    config: GeneratorConfig,
    appliedSignatureValue: string,
  ) {
    const id = ++requestIdRef.current;
    const modelKey = modelSignature(config, sources);
    const finish = (prepared: PreparedModel, next: string[]) => {
      setActiveConfig(config);
      setActiveModel(prepared);
      setAppliedSignature(appliedSignatureValue);
      setRandomSeed(seedNumber(config.seed));
      setLastUsedSeed(config.seed);
      setSeedCopied(false);
      revealResults(next, () => {
        setMessage(
          next.length < config.count
            ? `${next.length} mots uniques trouvés. Élargissez les longueurs pour en obtenir davantage.`
            : "",
        );
        setIsGenerating(false);
      });
    };

    const worker = workerRef.current;
    if (!worker) {
      const prepared = prepareModel(sources, config);
      finish(prepared, generateBatch(prepared, config));
      return;
    }

    worker.onmessage = (event: MessageEvent<GenerationResponse>) => {
      if (event.data.id !== id) return;
      finish(event.data.model, event.data.words);
    };
    worker.onerror = () => {
      const prepared = prepareModel(sources, config);
      finish(prepared, generateBatch(prepared, config));
    };
    worker.postMessage({ id, modelKey, sources, config });
  }

  function runGeneration() {
    const sources = selectedSources(dictionaries, dictionaryWeights);
    if (!sources.length) {
      setMessage("Sélectionnez au moins un dictionnaire.");
      return;
    }
    if (!sources.some((source) => source.words.length)) {
      setMessage("Ajoutez quelques mots avant de lancer la génération.");
      setIsManaging(true);
      return;
    }

    setIsGenerating(true);
    setHasGenerated(true);
    setMessage("");
    const resolvedConfig = {
      ...draftConfig,
      seed: draftConfig.seed || createGenerationSeed(),
    };
    requestGeneration(
      sources,
      resolvedConfig,
      configurationSignature(draftConfig, dictionaries, dictionaryWeights),
    );
  }

  function regenerateAndApply() {
    runGeneration();
  }

  function toggleDictionary(id: string, checked: boolean) {
    setDictionaryWeights((current) => {
      if (checked) return { ...current, [id]: current[id] || 1 };
      const next = { ...current };
      delete next[id];
      return next;
    });
    setMessage("");
  }

  function changeDictionaryWeight(id: string, value: number) {
    const safeWeight = Math.min(10, Math.max(0.1, value || 0.1));
    setDictionaryWeights((current) => ({ ...current, [id]: safeWeight }));
  }

  function balanceDictionaryWeights() {
    setDictionaryWeights((current) =>
      Object.fromEntries(
        Object.keys(current)
          .filter((id) => current[id] > 0)
          .map((id) => [id, 1]),
      ),
    );
  }

  function selectVisibleDictionaries() {
    setDictionaryWeights((current) => ({
      ...current,
      ...Object.fromEntries(
        activeDictionaryGroup.dictionaries.map((dictionary) => [
          dictionary.id,
          current[dictionary.id] || 1,
        ]),
      ),
    }));
    setMessage(
      `Tous les dictionnaires « ${activeDictionaryGroup.label} » sont sélectionnés.`,
    );
  }

  function deselectVisibleDictionaries() {
    setDictionaryWeights((current) => {
      const next = { ...current };
      activeDictionaryGroup.dictionaries.forEach((dictionary) => {
        delete next[dictionary.id];
      });
      return next;
    });
    setMessage(
      `Les dictionnaires « ${activeDictionaryGroup.label} » sont désélectionnés.`,
    );
  }

  function randomizeSources() {
    const maximumSources = Math.min(4, dictionaries.length);
    const sourceCount = randomInteger(1, maximumSources);
    const shuffled = [...dictionaries].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, sourceCount);
    const nextWeights = Object.fromEntries(
      chosen.map((dictionary) => [
        dictionary.id,
        Number((0.5 + Math.random() * 4.5).toFixed(1)),
      ]),
    );
    setDictionaryWeights(nextWeights);
    setMessage(
      `${sourceCount} dictionnaire${sourceCount > 1 ? "s" : ""} tiré${sourceCount > 1 ? "s" : ""} au hasard.`,
    );
  }

  function randomizeModel() {
    const algorithms: Algorithm[] = [
      "markov",
      "interpolated",
      "syllabic",
      "phonetic",
    ];
    const nextAlgorithm =
      algorithms[randomInteger(0, algorithms.length - 1)];
    setAlgorithm(nextAlgorithm);
    setOrder(
      randomInteger(1, nextAlgorithm === "phonetic" ? 3 : 5),
    );
    setTemperature(Number((0.5 + Math.random() * 1.3).toFixed(1)));
    setInterpolation(
      Number((0.15 + Math.random() * 0.8).toFixed(2)),
    );
    setMessage(`Modèle ${algorithmLabel(nextAlgorithm)} tiré au hasard.`);
  }

  function randomizeSeries() {
    const nextMinimum = randomInteger(2, 9);
    const nextMaximum = randomInteger(nextMinimum, Math.min(20, nextMinimum + 9));
    const nextCount = randomInteger(1, 100) * 3;
    setMinLength(nextMinimum);
    setMaxLength(nextMaximum);
    setCount(nextCount);
    setGenerationSeed(`atelier-${Math.random().toString(36).slice(2, 10)}`);
    setMessage(
      `Série aléatoire : ${nextCount} mots de ${nextMinimum} à ${nextMaximum} lettres.`,
    );
  }

  function randomizeConstraints() {
    const samples = ["", "a", "e", "i", "o", "r", "s", "ch"];
    const nextStart = samples[randomInteger(0, samples.length - 1)];
    const nextEnd = samples[randomInteger(0, samples.length - 1)];
    setStartsWith(Math.random() > 0.55 ? nextStart : "");
    setEndsWith(Math.random() > 0.55 ? nextEnd : "");
    setIncludesText("");
    setExcludesText("");
    setAllowDictionaryWords(Math.random() > 0.35);
    setMessage("Contraintes tirées au hasard.");
  }

  function refreshGenerationSeed() {
    setGenerationSeed(createGenerationSeed());
    setMessage("Nouvelle graine prête à être appliquée.");
  }

  async function copyLastUsedSeed() {
    if (!lastUsedSeed) return;
    try {
      await navigator.clipboard.writeText(lastUsedSeed);
      setSeedCopied(true);
      window.setTimeout(() => setSeedCopied(false), 1800);
    } catch {
      setMessage("La copie de la graine n’est pas disponible dans ce navigateur.");
    }
  }

  function toggleFavorite(word: string) {
    setFavorites((current) =>
      current.includes(word)
        ? current.filter((favorite) => favorite !== word)
        : [word, ...current],
    );
  }

  function savePreset() {
    const name =
      presetName.trim() || `Préréglage ${presets.length + 1}`;
    const preset: Preset = {
      id: `preset-${Date.now()}`,
      name,
      config: draftConfig,
      dictionaryWeights: { ...dictionaryWeights },
    };
    setPresets((current) => [...current, preset]);
    setSelectedPresetId(preset.id);
    setPresetName("");
    setMessage(`Préréglage « ${name} » enregistré.`);
  }

  function loadPreset() {
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) return;
    setAlgorithm(preset.config.algorithm);
    setOrder(preset.config.order);
    setTemperature(preset.config.temperature);
    setInterpolation(preset.config.interpolation);
    setMinLength(preset.config.minLength);
    setMaxLength(preset.config.maxLength);
    setCount(normalizeGenerationCount(preset.config.count));
    setGenerationSeed(preset.config.seed ?? "");
    setStartsWith(preset.config.constraints?.startsWith ?? "");
    setEndsWith(preset.config.constraints?.endsWith ?? "");
    setIncludesText(preset.config.constraints?.includes ?? "");
    setExcludesText(preset.config.constraints?.excludes ?? "");
    setAllowDictionaryWords(
      preset.config.constraints?.allowDictionaryWords ?? true,
    );
    const availableIds = new Set(dictionaries.map((dictionary) => dictionary.id));
    const availableWeights = Object.fromEntries(
      Object.entries(preset.dictionaryWeights).filter(
        ([id, weight]) => availableIds.has(id) && weight > 0,
      ),
    );
    setDictionaryWeights(
      Object.keys(availableWeights).length
        ? availableWeights
        : { [dictionaries[0].id]: 1 },
    );
    setMessage(
      `Préréglage « ${preset.name} » chargé. Appliquez pour générer.`,
    );
  }

  function deletePreset() {
    if (!selectedPresetId) return;
    setPresets((current) =>
      current.filter((item) => item.id !== selectedPresetId),
    );
    setSelectedPresetId("");
    setMessage("Préréglage supprimé.");
  }

  function selectManagedDictionary(id: string) {
    setManagedDictionaryId(id);
    if (id) {
      setDictionaryWeights((current) => ({
        ...current,
        [id]: current[id] || 1,
      }));
    }
  }

  function deleteCustomDictionary(id: string) {
    const deleted = customDictionaries.find((dictionary) => dictionary.id === id);
    setCustomDictionaries((current) =>
      current.filter((dictionary) => dictionary.id !== id),
    );
    setDictionaryWeights((current) => {
      const next = { ...current };
      delete next[id];
      return Object.keys(next).length ? next : { [DEFAULT_DICTIONARY.id]: 1 };
    });
    setManagedDictionaryId("");
    setMessage(`« ${deleted?.name ?? "Dictionnaire"} » supprimé.`);
  }

  function exportResults(format: "txt" | "csv") {
    if (!displayedResults.length) return;
    if (format === "txt") {
      downloadTextFile(
        "atelier-des-mots-resultats.txt",
        `${displayedResults.join("\n")}\n`,
        "text/plain",
      );
      return;
    }
    const rows = displayedResults.map((word) => {
      const scores = resultScores.get(word);
      return [
        word,
        (scores?.overall ?? 0).toFixed(1),
        (scores?.letters ?? 0).toFixed(1),
        (scores?.end ?? 0).toFixed(1),
      ]
        .map(escapeCsvCell)
        .join(";");
    });
    downloadTextFile(
      "atelier-des-mots-resultats.csv",
      `\uFEFFmot;score;lettres;fin\n${rows.join("\n")}\n`,
      "text/csv",
    );
  }

  async function copyWord(word: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(word);
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = word;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand("copy");
      fallback.remove();
      if (!copied) {
        setMessage("La copie n’est pas disponible dans ce navigateur.");
        return;
      }
    }

    try {
      setCopiedWord(word);
      window.setTimeout(
        () => setCopiedWord((current) => (current === word ? null : current)),
        2400,
      );
    } catch {
      setMessage("La copie n’est pas disponible dans ce navigateur.");
    }
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Atelier des mots, accueil">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>Atelier des mots</span>
        </a>
        <nav aria-label="Navigation principale">
          <Link className="is-active" href="/">Générateur</Link>
          <Link href="/lieux">Lieux</Link>
          <Link href="/analyse">Analyse</Link>
          <Link href="/licences">Licences</Link>
        </nav>
        <span className="lab-badge" aria-label="Mode laboratoire">LAB</span>
      </header>

      <main id="top">
        <section
          className={`hero ${hasGenerated ? "is-compact" : ""}`}
          aria-labelledby="page-title"
        >
          <p className="eyebrow">Laboratoire linguistique</p>
          <h1 id="page-title">Inventez des mots qui sonnent juste.</h1>
          <p>
            Générez des séries de mots inédits à partir de vos dictionnaires et
            de leurs habitudes de langage.
          </p>
        </section>

        <section className="workspace" aria-label="Générateur de mots">
          <aside className="control-panel" id="dictionnaires">
            <details
              className="control-section"
              open={openSections.source}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setOpenSections((current) => ({
                  ...current,
                  source: isOpen,
                }));
              }}
            >
              <summary className="control-section-summary">
                <span className="section-index">01 · Source</span>
                <button
                  type="button"
                  className="randomize-button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    randomizeSources();
                  }}
                  aria-label="Choisir les dictionnaires et leurs poids aléatoirement"
                  title="Tout choisir au hasard dans cette partie"
                >
                  <span aria-hidden="true">⚄</span>
                  Aléatoire
                </button>
              </summary>
              <div className="control-section-body">
              <div className="source-heading">
                <span className="field-label">Dictionnaires</span>
                <span>
                  {selectedCount} sélectionné{selectedCount > 1 ? "s" : ""} ·{" "}
                  {selectedWordCount.toLocaleString("fr-FR")} mots
                </span>
              </div>
              <p className="selection-summary">
                {selectedByCategory["first-names"]} prénom
                {selectedByCategory["first-names"] > 1 ? "s" : ""} ·{" "}
                {selectedByCategory.words} liste
                {selectedByCategory.words > 1 ? "s" : ""} de mots ·{" "}
                {selectedByCategory.places} lieu
                {selectedByCategory.places > 1 ? "x" : ""}
              </p>
              <div className="source-tools">
                <span>Influence normalisée</span>
                <button
                  type="button"
                  className="balance-button"
                  onClick={balanceDictionaryWeights}
                  disabled={selectedCount < 2}
                >
                  Équilibrer
                </button>
              </div>
              <div
                className="dictionary-mixer"
                role="group"
                aria-label="Dictionnaires et poids de génération"
              >
                <div
                  className="dictionary-category-tabs"
                  role="tablist"
                  aria-label="Type de dictionnaire"
                >
                  {dictionaryGroups.map((group) => {
                    const isActive = dictionaryCategory === group.id;
                    return (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`dictionary-list-${group.id}`}
                        className={isActive ? "is-active" : ""}
                        onClick={() =>
                          setDictionaryCategory(group.id as DictionaryCategory)
                        }
                        key={group.id}
                      >
                        <span>{group.label}</span>
                        <strong>
                          {
                            selectedByCategory[
                              group.id as DictionaryCategory
                            ]
                          }
                        </strong>
                      </button>
                    );
                  })}
                </div>
                <div className="dictionary-bulk-actions">
                  <span>{activeDictionaryGroup.label} visibles</span>
                  <div>
                    <button type="button" onClick={selectVisibleDictionaries}>
                      Tout sélectionner
                    </button>
                    <button type="button" onClick={deselectVisibleDictionaries}>
                      Tout désélectionner
                    </button>
                  </div>
                </div>
                <section
                  className="dictionary-group"
                  id={`dictionary-list-${activeDictionaryGroup.id}`}
                  role="tabpanel"
                  aria-label={activeDictionaryGroup.label}
                >
                  {activeDictionaryGroup.dictionaries.map((dictionary) => {
                    const isSelected = dictionaryWeights[dictionary.id] > 0;
                    return (
                      <div
                        className={`dictionary-source ${isSelected ? "is-selected" : ""}`}
                        key={dictionary.id}
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) =>
                              toggleDictionary(
                                dictionary.id,
                                event.target.checked,
                              )
                            }
                          />
                          <span>
                            <strong>{dictionary.name}</strong>
                            <small>
                              {dictionary.words.length.toLocaleString("fr-FR")} mots
                            </small>
                          </span>
                        </label>
                        {isSelected && (
                          <label className="weight-field">
                            <strong>
                              {dictionaryWeightTotal
                                ? Math.round(
                                    (dictionaryWeights[dictionary.id] /
                                      dictionaryWeightTotal) *
                                      100,
                                  )
                                : 0}
                              %
                            </strong>
                            <input
                              type="number"
                              min="0.1"
                              max="10"
                              step="0.1"
                              value={dictionaryWeights[dictionary.id]}
                              onChange={(event) =>
                                changeDictionaryWeight(
                                  dictionary.id,
                                  Number(event.target.value),
                                )
                              }
                              aria-label={`Poids du dictionnaire ${dictionary.name}`}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </section>
              </div>
              <p className="field-help">
                Les pourcentages indiquent l’influence réelle de chaque source,
                indépendamment de sa taille.
              </p>
              <button
                className="text-button"
                type="button"
                onClick={() => setIsManaging((current) => !current)}
                aria-expanded={isManaging}
              >
                <span aria-hidden="true">＋</span>
                {isManaging ? "Fermer la gestion" : "Gérer les dictionnaires"}
              </button>

              {isManaging && dictionariesLoaded && (
                <DictionaryManager
                  key={managedDictionaryId}
                  dictionaries={dictionaries}
                  customDictionaries={customDictionaries}
                  selectedId={managedDictionaryId}
                  onSelect={selectManagedDictionary}
                  onChange={setCustomDictionaries}
                  onDelete={deleteCustomDictionary}
                  onMessage={setMessage}
                />
              )}
              {isManaging && !dictionariesLoaded && (
                <p className="field-help">Chargement des dictionnaires locaux…</p>
              )}
              </div>
            </details>

            <details
              className="control-section"
              id="methode"
              open={openSections.model}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setOpenSections((current) => ({
                  ...current,
                  model: isOpen,
                }));
              }}
            >
              <summary className="control-section-summary">
                <span className="section-index">02 · Modèle</span>
                <button
                  type="button"
                  className="randomize-button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    randomizeModel();
                  }}
                  aria-label="Régler tous les paramètres du modèle aléatoirement"
                  title="Tout régler au hasard dans cette partie"
                >
                  <span aria-hidden="true">⚄</span>
                  Aléatoire
                </button>
              </summary>
              <div className="control-section-body">
              <span className="field-label">Algorithme</span>
              <div className="segmented" role="group" aria-label="Algorithme">
                <button
                  type="button"
                  className={algorithm === "markov" ? "active" : ""}
                  onClick={() => setAlgorithm("markov")}
                  aria-pressed={algorithm === "markov"}
                >
                  Markov
                </button>
                <button
                  type="button"
                  className={algorithm === "interpolated" ? "active" : ""}
                  onClick={() => setAlgorithm("interpolated")}
                  aria-pressed={algorithm === "interpolated"}
                >
                  Markov interpolé
                </button>
                <button
                  type="button"
                  className={algorithm === "syllabic" ? "active" : ""}
                  onClick={() => setAlgorithm("syllabic")}
                  aria-pressed={algorithm === "syllabic"}
                >
                  Syllabique
                </button>
                <button
                  type="button"
                  className={algorithm === "phonetic" ? "active" : ""}
                  onClick={() => {
                    setAlgorithm("phonetic");
                    setOrder((current) => Math.min(current, 3));
                  }}
                  aria-pressed={algorithm === "phonetic"}
                >
                  Phonétique
                </button>
              </div>

              <div className={algorithm === "syllabic" ? "muted-control" : ""}>
                <div className="label-row">
                  <label htmlFor="order">
                    {algorithm === "phonetic"
                      ? "Contexte phonétique"
                      : "Contexte"}
                  </label>
                  <output htmlFor="order">
                    {order} {algorithm === "phonetic" ? "son" : "lettre"}
                    {order > 1 ? "s" : ""}
                  </output>
                </div>
                <input
                  id="order"
                  type="range"
                  min="1"
                  max={algorithm === "phonetic" ? "3" : "5"}
                  step="1"
                  value={order}
                  disabled={algorithm === "syllabic"}
                  onChange={(event) => setOrder(Number(event.target.value))}
                />
                <p className="field-help">
                  {algorithm === "phonetic"
                    ? "Les groupes comme ch, sh, ou, ky ou ts sont traités comme des sons."
                    : algorithm === "syllabic"
                      ? "L’alternance voyelle–consonne guide la structure."
                      : algorithm === "interpolated"
                        ? "Plusieurs tailles de contexte sont combinées pour éviter les blocages."
                        : algorithm === "markov"
                    ? `${order} lettre${order > 1 ? "s" : ""} précédente${order > 1 ? "s" : ""} influence${order === 1 ? "" : "nt"} la suivante.`
                    : ""}
                </p>
              </div>

              {algorithm === "interpolated" && (
                <>
                  <div className="label-row">
                    <label htmlFor="interpolation">Fidélité au contexte long</label>
                    <output htmlFor="interpolation">
                      {Math.round(interpolation * 100)}%
                    </output>
                  </div>
                  <input
                    id="interpolation"
                    type="range"
                    min="0.15"
                    max="0.95"
                    step="0.05"
                    value={interpolation}
                    onChange={(event) =>
                      setInterpolation(Number(event.target.value))
                    }
                  />
                  <p className="field-help">
                    Haut : conserve davantage les enchaînements longs. Bas :
                    lisse plus fortement avec les contextes courts.
                  </p>
                </>
              )}

              <div className="label-row">
                <label htmlFor="temperature">Créativité</label>
                <output htmlFor="temperature">{temperature.toFixed(1)}</output>
              </div>
              <input
                id="temperature"
                type="range"
                min="0.5"
                max="1.8"
                step="0.1"
                value={temperature}
                onChange={(event) => setTemperature(Number(event.target.value))}
              />
              <p className="field-help">
                Bas : fidèle au dictionnaire. Haut : plus surprenant.
              </p>
              </div>
            </details>

            <details
              className="control-section"
              open={openSections.constraints}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setOpenSections((current) => ({
                  ...current,
                  constraints: isOpen,
                }));
              }}
            >
              <summary className="control-section-summary">
                <span className="section-index">03 · Contraintes</span>
                <button
                  type="button"
                  className="randomize-button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    randomizeConstraints();
                  }}
                  aria-label="Régler les contraintes aléatoirement"
                  title="Tout régler au hasard dans cette partie"
                >
                  <span aria-hidden="true">⚄</span>
                  Aléatoire
                </button>
              </summary>
              <div className="control-section-body">
                <div className="constraint-grid">
                  <label>
                    Commence par
                    <input
                      type="text"
                      value={startsWith}
                      onChange={(event) => setStartsWith(event.target.value)}
                      placeholder="ex. astro"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Termine par
                    <input
                      type="text"
                      value={endsWith}
                      onChange={(event) => setEndsWith(event.target.value)}
                      placeholder="ex. ine"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Contient
                    <input
                      type="text"
                      value={includesText}
                      onChange={(event) => setIncludesText(event.target.value)}
                      placeholder="ex. lum"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Exclut les lettres
                    <input
                      type="text"
                      value={excludesText}
                      onChange={(event) => setExcludesText(event.target.value)}
                      placeholder="ex. qwx"
                      autoComplete="off"
                    />
                  </label>
                </div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={allowDictionaryWords}
                    onChange={(event) =>
                      setAllowDictionaryWords(event.target.checked)
                    }
                  />
                  <span>
                    Autoriser les mots déjà présents dans les dictionnaires
                  </span>
                </label>
                <p className="field-help">
                  Les contraintes sont appliquées pendant la recherche. Une
                  combinaison très stricte peut produire moins de résultats.
                </p>
              </div>
            </details>

            <details
              className="control-section"
              open={openSections.series}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setOpenSections((current) => ({
                  ...current,
                  series: isOpen,
                }));
              }}
            >
              <summary className="control-section-summary">
                <span className="section-index">04 · Série</span>
                <button
                  type="button"
                  className="randomize-button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    randomizeSeries();
                  }}
                  aria-label="Régler tous les paramètres de la série aléatoirement"
                  title="Tout régler au hasard dans cette partie"
                >
                  <span aria-hidden="true">⚄</span>
                  Aléatoire
                </button>
              </summary>
              <div className="control-section-body">
              <div className="length-grid">
                <label>
                  Longueur min.
                  <input
                    type="number"
                    min="2"
                    max={maxLength}
                    value={minLength}
                    onChange={(event) =>
                      setMinLength(Math.max(2, Number(event.target.value)))
                    }
                  />
                </label>
                <label>
                  Longueur max.
                  <input
                    type="number"
                    min={minLength}
                    max="20"
                    value={maxLength}
                    onChange={(event) =>
                      setMaxLength(
                        Math.max(minLength, Math.min(20, Number(event.target.value))),
                      )
                    }
                  />
                </label>
              </div>
              <div className="label-row">
                <label htmlFor="count">Nombre de mots</label>
                <output htmlFor="count">{count}</output>
              </div>
              <input
                id="count"
                type="range"
                min="3"
                max="300"
                step="3"
                value={count}
                onChange={(event) =>
                  setCount(normalizeGenerationCount(Number(event.target.value)))
                }
              />
              <div className="seed-field">
                <label htmlFor="generation-seed">Graine reproductible</label>
                <div>
                  <input
                    id="generation-seed"
                    type="text"
                    value={generationSeed}
                    onChange={(event) => setGenerationSeed(event.target.value)}
                    placeholder="Vide = nouvelle graine aléatoire"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={refreshGenerationSeed}
                    aria-label="Créer une nouvelle graine"
                    title="Créer une nouvelle graine"
                  >
                    ↻
                  </button>
                </div>
                <p className="field-help">
                  Laissez vide pour une nouvelle série aléatoire à chaque
                  génération. Saisissez une graine pour reproduire une série.
                </p>
                {lastUsedSeed && (
                  <div className="used-seed" aria-live="polite">
                    <span>
                      <small>Graine utilisée</small>
                      <code>{lastUsedSeed}</code>
                    </span>
                    <button
                      type="button"
                      onClick={() => setGenerationSeed(lastUsedSeed)}
                      title="Réutiliser cette graine"
                    >
                      Réutiliser
                    </button>
                    <button
                      type="button"
                      onClick={copyLastUsedSeed}
                      title="Copier cette graine"
                    >
                      {seedCopied ? "Copiée ✓" : "Copier"}
                    </button>
                  </div>
                )}
              </div>
              <div className="preset-box">
                <span className="field-label">Préréglages</span>
                <div className="preset-save">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="Nom du préréglage"
                    aria-label="Nom du nouveau préréglage"
                  />
                  <button type="button" onClick={savePreset}>
                    Enregistrer
                  </button>
                </div>
                {presets.length > 0 && (
                  <div className="preset-load">
                    <select
                      value={selectedPresetId}
                      onChange={(event) =>
                        setSelectedPresetId(event.target.value)
                      }
                      aria-label="Préréglage enregistré"
                    >
                      <option value="">Choisir un préréglage</option>
                      {presets.map((preset) => (
                        <option value={preset.id} key={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={loadPreset}
                      disabled={!selectedPresetId}
                    >
                      Charger
                    </button>
                    <button
                      type="button"
                      className="delete-preset"
                      onClick={deletePreset}
                      disabled={!selectedPresetId}
                      aria-label="Supprimer le préréglage sélectionné"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              <div className="generation-actions">
                <div
                  className={`apply-status ${hasPendingChanges ? "has-changes" : ""}`}
                  role="status"
                >
                  <span aria-hidden="true" />
                  {hasPendingChanges
                    ? "Modifications en attente"
                    : "Paramètres appliqués"}
                </div>
                <button
                  className="generate-button"
                  type="button"
                  onClick={runGeneration}
                  disabled={isGenerating}
                >
                  <span aria-hidden="true">✦</span>
                  {isGenerating
                    ? "Analyse en cours…"
                    : `Appliquer et générer ${count} mots`}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
              {(message || storageError) && (
                <p className="status-message" role="status">
                  {storageError || message}
                </p>
              )}
              </div>
            </details>
          </aside>

          <section
            className={`results-panel ${isGenerating ? "is-generating" : ""}`}
            aria-live="polite"
            aria-busy={isGenerating}
          >
            <div className="results-header">
              <div>
                <p className="section-index">Mots générés</p>
                <span>
                  {algorithmLabel(activeConfig.algorithm)}
                  {activeConfig.algorithm !== "syllabic"
                    ? ` · contexte ${activeConfig.order}`
                    : ""}
                  {` · ${activeModel.sourceCount} source${activeModel.sourceCount > 1 ? "s" : ""}`}
                </span>
              </div>
              <div className="result-actions">
                <button type="button" onClick={() => exportResults("txt")}>
                  TXT
                </button>
                <button type="button" onClick={() => exportResults("csv")}>
                  CSV
                </button>
                <button
                  className={`favorites-toggle ${showFavorites ? "active" : ""}`}
                  type="button"
                  onClick={() => setShowFavorites((current) => !current)}
                  aria-expanded={showFavorites}
                >
                  ★ {favorites.length}
                </button>
                <label className="sort-control">
                  <span>Trier</span>
                  <select
                    value={sortMode}
                    onChange={(event) => {
                      const mode = event.target.value as SortMode;
                      setSortMode(mode);
                      setSortInverted(false);
                      if (mode === "random") setRandomSeed(Date.now());
                    }}
                    aria-label="Trier les mots générés"
                  >
                    <option value="random">Aléatoire</option>
                    <option value="alphabetical">Alphabétique</option>
                    <option value="probability">Plus probable</option>
                  </select>
                </label>
                <button
                  className="direction-button"
                  type="button"
                  onClick={() => setSortInverted((current) => !current)}
                  aria-label={`Inverser le tri. ${sortDirectionLabel}`}
                  title={sortDirectionLabel}
                >
                  {sortInverted ? "↑" : "↓"}
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={regenerateAndApply}
                  aria-label="Appliquer les paramètres courants et régénérer"
                  title="Appliquer les paramètres courants et régénérer"
                  disabled={isGenerating}
                >
                  ↻
                </button>
              </div>
            </div>

            {showFavorites && (
              <div className="favorites-panel">
                <div>
                  <p className="section-index">Favoris</p>
                  <span>{favorites.length} mot{favorites.length > 1 ? "s" : ""}</span>
                </div>
                {favorites.length ? (
                  <div className="favorite-list">
                    {favorites.map((word) => (
                      <div className="favorite-chip" key={word}>
                        <button type="button" onClick={() => copyWord(word)}>
                          {word}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFavorite(word)}
                          aria-label={`Retirer ${word} des favoris`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Ajoutez un mot avec l’étoile de sa carte.</p>
                )}
              </div>
            )}

            {results.length ? (
              <div className="word-grid">
                {displayedResults.map((word, index) => (
                  <div
                    className={`word-card ${copiedWord === word ? "is-copied" : ""} ${
                      activeModel.sourceWords.has(normalizeWord(word))
                        ? "is-dictionary-match"
                        : ""
                    }`}
                    key={`${word}-${index}`}
                    style={{ animationDelay: `${Math.min(index, 12) * 24}ms` }}
                  >
                    <button
                      type="button"
                      className="word-copy-zone"
                      onClick={() => copyWord(word)}
                      aria-label={`Copier ${word}, score ${(resultScores.get(word)?.overall ?? 0).toFixed(1)} sur 100`}
                    >
                      <span className="word-main">
                        <span
                          className="word-label"
                          title={
                            Array.from(word).length > 14 ? word : undefined
                          }
                        >
                          {shortenedWord(word)}
                        </span>
                        <span className="word-score">
                          <strong>
                            Score{" "}
                            {(resultScores.get(word)?.overall ?? 0).toFixed(1)}
                          </strong>
                          <small>
                            Lettres{" "}
                            {(resultScores.get(word)?.letters ?? 0).toFixed(1)}
                            {" · "}
                            fin {(resultScores.get(word)?.end ?? 0).toFixed(1)}
                          </small>
                        </span>
                      </span>
                      <span className="copy-feedback" aria-hidden="true">
                        {copiedWord === word ? "✓ Copié" : "Cliquer pour copier"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`favorite-button ${
                        favorites.includes(word) ? "is-favorite" : ""
                      }`}
                      onClick={() => toggleFavorite(word)}
                      aria-label={
                        favorites.includes(word)
                          ? `Retirer ${word} des favoris`
                          : `Ajouter ${word} aux favoris`
                      }
                      aria-pressed={favorites.includes(word)}
                    >
                      {favorites.includes(word) ? "★" : "☆"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span aria-hidden="true">Aa</span>
                <p>Aucun mot n’a pu être formé avec ces paramètres.</p>
              </div>
            )}

            <div className="insight-card">
              <div>
                <p className="section-index">Caractère suivant</p>
                <h2>Testez un début de mot</h2>
                <p>
                  Saisissez un préfixe : ajoutez un point pour évaluer aussi sa
                  fin de mot. La distribution suit les réglages appliqués.
                </p>
                <label className="probe-field">
                  <span className="probe-label-row">
                    <span>Préfixe à analyser</span>
                    <output
                      className={`probe-score ${probeScore === null ? "is-empty" : ""}`}
                      aria-live="polite"
                    >
                      {probeScore === null
                        ? "Score —"
                        : `Score ${probeScore.overall.toFixed(1)}`}
                    </output>
                  </span>
                  <input
                    type="text"
                    value={probeText}
                    onChange={(event) => setProbeText(event.target.value)}
                    placeholder="Ex. astro ou astro."
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {probeScore !== null && (
                    <span className="probe-breakdown">
                      Lettres {probeScore.letters.toFixed(1)}
                      {probeScore.end === null
                        ? " · fin non évaluée"
                        : ` · fin ${probeScore.end.toFixed(1)}`}
                    </span>
                  )}
                </label>
              </div>
              <div className="transition-list">
                <p>
                  Après <strong>{nextDistribution.context}</strong>
                </p>
                {nextDistribution.transitions.length ? (
                  nextDistribution.transitions.slice(0, 8).map((transition) => (
                    <div className="transition-row" key={transition.letter}>
                      <span>→ {transition.letter}</span>
                      <div aria-hidden="true">
                        <i style={{ width: `${transition.probability}%` }} />
                      </div>
                      <strong>{transition.probability.toFixed(1)}%</strong>
                    </div>
                  ))
                ) : (
                  <p>
                    Aucun enchaînement trouvé. Essayez un préfixe plus court.
                  </p>
                )}
              </div>
            </div>
          </section>
        </section>
      </main>

      <footer>
        <span>
          Dictionnaires, favoris et préréglages restent enregistrés sur cet
          appareil.
        </span>
        <span>
          Sources et licences :{" "}
          <a
            href="https://github.com/oprogramador/most-common-words-by-language"
            target="_blank"
            rel="noreferrer"
          >
            mots fréquents
          </a>
          {" · "}
          <a
            href="https://github.com/faker-js/faker"
            target="_blank"
            rel="noreferrer"
          >
            prénoms
          </a>
          {" · "}
          <a
            href="https://github.com/hexenq/kuroshiro"
            target="_blank"
            rel="noreferrer"
          >
            romanisation japonaise
          </a>
          {" · "}
          <a
            href="https://commons.wikimedia.org/wiki/Category:Streets_in_Moscow_by_name"
            target="_blank"
            rel="noreferrer"
          >
            voies russes romanisées
          </a>
          {" · "}
          <a
            href="https://fr.wikipedia.org/wiki/Liste_de_min%C3%A9raux"
            target="_blank"
            rel="noreferrer"
          >
            minéraux
          </a>
          {" · "}
          <Link href="/licences">licences et attributions</Link>
        </span>
      </footer>
    </div>
  );
}
