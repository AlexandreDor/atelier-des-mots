"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dictionaryData from "../data/dictionaries.json";
import placeDictionaryData from "../data/place-dictionaries.json";
import {
  Algorithm,
  GeneratorConfig,
  normalizeWord,
  prepareModel,
  wordProbabilityBreakdown,
} from "../generator";

type Dictionary = {
  id: string;
  name: string;
  words: string[];
};

type AnalysisMode = "word" | "similarity";
type SimilarityMetric = "patterns" | "vocabulary";

const STORAGE_KEY = "atelier-des-mots:dictionaries:v1";
const REMOVED_DICTIONARY_IDS = new Set(["francais", "botanique", "matiere"]);
const INITIAL_DICTIONARIES = [
  ...(dictionaryData as Dictionary[]),
  ...(placeDictionaryData as Dictionary[]),
];
const DEFAULT_SELECTED_IDS = INITIAL_DICTIONARIES.filter((dictionary) =>
  dictionary.id.includes("-mots"),
)
  .slice(0, 6)
  .map((dictionary) => dictionary.id);

function scorePercent(logProbability: number | null) {
  if (logProbability === null || !Number.isFinite(logProbability)) return 0;
  return Math.min(100, Math.max(0, Math.exp(logProbability) * 100));
}

function createConfig(
  algorithm: Algorithm,
  order: number,
  temperature: number,
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

function dictionaryCategory(dictionary: Dictionary) {
  if (
    dictionary.id.startsWith("fr-lieux-") ||
    dictionary.id === "ru-rues-routes-romanise"
  ) {
    return "Lieux";
  }
  return /(?:^|-)(?:prenoms?|prénoms?)(?:-|$)/i.test(
    `${dictionary.id}-${dictionary.name}`,
  )
    ? "Prénoms"
    : "Mots";
}

function shortName(dictionary: Dictionary) {
  return dictionary.name
    .replace(" · mots courants", "")
    .replace(" · prénoms courants", " · prénoms")
    .replace(" (romanisé)", " · rom.")
    .replace(" (rōmaji)", " · rōmaji")
    .replace(" (cyrillique)", " · cyr.");
}

function dictionarySignature(dictionary: Dictionary) {
  const counts = new Map<string, number>();
  dictionary.words.forEach((rawWord) => {
    const word = `^${normalizeWord(rawWord)}$`;
    for (let index = 0; index <= word.length - 3; index += 1) {
      const gram = word.slice(index, index + 3);
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
  });
  return counts;
}

function cosineSimilarity(
  first: Map<string, number>,
  second: Map<string, number>,
) {
  let dot = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;
  first.forEach((value, key) => {
    dot += value * (second.get(key) ?? 0);
    firstMagnitude += value * value;
  });
  second.forEach((value) => {
    secondMagnitude += value * value;
  });
  const denominator = Math.sqrt(firstMagnitude * secondMagnitude);
  return denominator ? (dot / denominator) * 100 : 0;
}

function vocabularySimilarity(first: Dictionary, second: Dictionary) {
  const firstWords = new Set(first.words.map(normalizeWord));
  const secondWords = new Set(second.words.map(normalizeWord));
  let intersection = 0;
  firstWords.forEach((word) => {
    if (secondWords.has(word)) intersection += 1;
  });
  const union = firstWords.size + secondWords.size - intersection;
  return {
    score: union ? (intersection / union) * 100 : 0,
    intersection,
  };
}

function algorithmLabel(algorithm: Algorithm) {
  if (algorithm === "interpolated") return "Markov interpolé";
  if (algorithm === "phonetic") return "Phonétique";
  if (algorithm === "syllabic") return "Syllabique";
  return "Markov";
}

export default function AnalysisPage() {
  const [dictionaries, setDictionaries] = useState(INITIAL_DICTIONARIES);
  const [mode, setMode] = useState<AnalysisMode>("word");
  const [word, setWord] = useState("brumelle");
  const [selectedIds, setSelectedIds] =
    useState<string[]>(DEFAULT_SELECTED_IDS);
  const [algorithm, setAlgorithm] = useState<Algorithm>("markov");
  const [order, setOrder] = useState(2);
  const [temperature, setTemperature] = useState(0.9);
  const [metric, setMetric] = useState<SimilarityMetric>("patterns");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Dictionary[];
      if (!Array.isArray(parsed) || !parsed.length) return;
      const retained = parsed.filter(
        (dictionary) => !REMOVED_DICTIONARY_IDS.has(dictionary.id),
      );
      const storedIds = new Set(retained.map((dictionary) => dictionary.id));
      const merged = [
        ...INITIAL_DICTIONARIES.filter(
          (dictionary) => !storedIds.has(dictionary.id),
        ),
        ...retained,
      ];
      const timeout = window.setTimeout(() => {
        setDictionaries(merged);
        setSelectedIds((current) =>
          current.filter((id) =>
            merged.some((dictionary) => dictionary.id === id),
          ),
        );
      }, 0);
      return () => window.clearTimeout(timeout);
    } catch {
      // Les dictionnaires intégrés restent disponibles.
    }
  }, []);

  const selectedDictionaries = useMemo(
    () =>
      selectedIds
        .map((id) => dictionaries.find((dictionary) => dictionary.id === id))
        .filter((dictionary): dictionary is Dictionary => Boolean(dictionary)),
    [dictionaries, selectedIds],
  );

  const config = useMemo(
    () => createConfig(algorithm, order, temperature),
    [algorithm, order, temperature],
  );

  const wordResults = useMemo(() => {
    if (!normalizeWord(word)) return [];
    return selectedDictionaries
      .map((dictionary) => {
        const model = prepareModel(
          [{ ...dictionary, weight: 1 }],
          config,
        );
        const breakdown = wordProbabilityBreakdown(word, model, config, true);
        return {
          dictionary,
          overall: scorePercent(breakdown.overallLogProbability),
          letters: scorePercent(breakdown.lettersLogProbability),
          end: scorePercent(breakdown.endLogProbability),
          present: model.sourceWords.has(normalizeWord(word)),
        };
      })
      .sort((first, second) => second.overall - first.overall);
  }, [selectedDictionaries, word, config]);

  const signatures = useMemo(
    () =>
      new Map(
        selectedDictionaries.map((dictionary) => [
          dictionary.id,
          dictionarySignature(dictionary),
        ]),
      ),
    [selectedDictionaries],
  );

  const similarity = useMemo(() => {
    const matrix = new Map<string, number>();
    const sharedWords = new Map<string, number>();
    const pairs: {
      first: Dictionary;
      second: Dictionary;
      score: number;
      shared: number;
    }[] = [];
    selectedDictionaries.forEach((first, firstIndex) => {
      selectedDictionaries.forEach((second, secondIndex) => {
        const key = `${first.id}:${second.id}`;
        if (firstIndex === secondIndex) {
          matrix.set(key, 100);
          return;
        }
        if (matrix.has(key)) return;
        const vocabulary = vocabularySimilarity(first, second);
        const score =
          metric === "patterns"
            ? cosineSimilarity(
                signatures.get(first.id) ?? new Map(),
                signatures.get(second.id) ?? new Map(),
              )
            : vocabulary.score;
        matrix.set(key, score);
        matrix.set(`${second.id}:${first.id}`, score);
        sharedWords.set(key, vocabulary.intersection);
        sharedWords.set(`${second.id}:${first.id}`, vocabulary.intersection);
        if (firstIndex < secondIndex) {
          pairs.push({
            first,
            second,
            score,
            shared: vocabulary.intersection,
          });
        }
      });
    });
    pairs.sort((first, second) => second.score - first.score);
    return { matrix, sharedWords, pairs };
  }, [selectedDictionaries, signatures, metric]);

  const strongestScore = wordResults[0]?.overall ?? 0;

  function toggleDictionary(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }

  function selectCategory(category: "Prénoms" | "Mots" | "Lieux") {
    setSelectedIds(
      dictionaries
        .filter((dictionary) => dictionaryCategory(dictionary) === category)
        .map((dictionary) => dictionary.id),
    );
  }

  return (
    <div className="site-shell analysis-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Atelier des mots, accueil">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>Atelier des mots</span>
        </Link>
        <nav aria-label="Navigation principale">
          <Link href="/">Générateur</Link>
          <Link href="/lieux">Lieux</Link>
          <Link className="is-active" href="/analyse">Analyse</Link>
        </nav>
        <span className="lab-badge" aria-label="Mode laboratoire">LAB</span>
      </header>

      <main>
        <section className="analysis-hero" aria-labelledby="analysis-title">
          <div>
            <p className="eyebrow">Observatoire des scores</p>
            <h1 id="analysis-title">Mesurez l’empreinte d’un mot.</h1>
            <p>
              Comparez sa vraisemblance dans plusieurs dictionnaires ou
              observez les ressemblances structurelles entre vos sources.
            </p>
          </div>
          <div className="analysis-mode" role="tablist" aria-label="Type d’analyse">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "word"}
              className={mode === "word" ? "is-active" : ""}
              onClick={() => setMode("word")}
            >
              <span>01</span>
              Score d’un mot
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "similarity"}
              className={mode === "similarity" ? "is-active" : ""}
              onClick={() => setMode("similarity")}
            >
              <span>02</span>
              Similarité des sources
            </button>
          </div>
        </section>

        <section className="analysis-layout">
          <aside className="analysis-controls">
            {mode === "word" && (
              <div className="analysis-control-section">
                <label className="analysis-word-field" htmlFor="analysed-word">
                  <span>Mot à analyser</span>
                  <input
                    id="analysed-word"
                    type="text"
                    value={word}
                    onChange={(event) => setWord(event.target.value)}
                    placeholder="Ex. brumelle"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              </div>
            )}

            <div className="analysis-control-section">
              <div className="analysis-section-heading">
                <span className="section-index">Dictionnaires</span>
                <strong>{selectedIds.length} sélectionnés</strong>
              </div>
              <div className="analysis-quick-actions">
                <button type="button" onClick={() => selectCategory("Mots")}>
                  Tous les mots
                </button>
                <button type="button" onClick={() => selectCategory("Prénoms")}>
                  Tous les prénoms
                </button>
                <button type="button" onClick={() => selectCategory("Lieux")}>
                  Tous les lieux
                </button>
                <button type="button" onClick={() => setSelectedIds([])}>
                  Aucun
                </button>
              </div>
              <div className="analysis-dictionary-list">
                {dictionaries.map((dictionary) => {
                  const isSelected = selectedIds.includes(dictionary.id);
                  return (
                    <label
                      className={isSelected ? "is-selected" : ""}
                      key={dictionary.id}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleDictionary(dictionary.id)}
                      />
                      <span>
                        <strong>{dictionary.name}</strong>
                        <small>
                          {dictionaryCategory(dictionary)} ·{" "}
                          {dictionary.words.length.toLocaleString("fr-FR")}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {mode === "word" && (
              <div className="analysis-control-section">
                <span className="section-index">Modèle de score</span>
                <label className="analysis-select-field">
                  <span>Algorithme</span>
                  <select
                    value={algorithm}
                    onChange={(event) =>
                      setAlgorithm(event.target.value as Algorithm)
                    }
                  >
                    <option value="markov">Markov</option>
                    <option value="interpolated">Markov interpolé</option>
                    <option value="phonetic">Phonétique</option>
                    <option value="syllabic">Syllabique</option>
                  </select>
                </label>
                <div className="label-row">
                  <label htmlFor="analysis-order">Contexte</label>
                  <output htmlFor="analysis-order">{order}</output>
                </div>
                <input
                  id="analysis-order"
                  type="range"
                  min="1"
                  max={algorithm === "phonetic" ? 3 : 5}
                  value={Math.min(order, algorithm === "phonetic" ? 3 : 5)}
                  disabled={algorithm === "syllabic"}
                  onChange={(event) => setOrder(Number(event.target.value))}
                />
                <div className="label-row">
                  <label htmlFor="analysis-temperature">Créativité</label>
                  <output htmlFor="analysis-temperature">
                    {temperature.toFixed(1)}
                  </output>
                </div>
                <input
                  id="analysis-temperature"
                  type="range"
                  min="0.5"
                  max="1.8"
                  step="0.1"
                  value={temperature}
                  onChange={(event) =>
                    setTemperature(Number(event.target.value))
                  }
                />
              </div>
            )}
          </aside>

          <div className="analysis-results">
            {mode === "word" ? (
              <>
                <div className="analysis-summary">
                  <div>
                    <p className="section-index">Résultat comparé</p>
                    <h2>
                      {normalizeWord(word) || "—"}
                      <span>{algorithmLabel(algorithm)} · contexte {order}</span>
                    </h2>
                  </div>
                  <div className="analysis-kpi">
                    <span>Meilleur score</span>
                    <strong>{strongestScore.toFixed(1)}</strong>
                    <small>/ 100</small>
                  </div>
                </div>

                {wordResults.length ? (
                  <>
                    <div className="score-ranking">
                      {wordResults.map((result, index) => (
                        <article className="score-row" key={result.dictionary.id}>
                          <span className="score-rank">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div className="score-source">
                            <strong>{result.dictionary.name}</strong>
                            <span>
                              Lettres {result.letters.toFixed(1)} · fin{" "}
                              {result.end.toFixed(1)}
                              {result.present ? " · mot présent" : ""}
                            </span>
                          </div>
                          <div className="score-track" aria-hidden="true">
                            <i style={{ width: `${result.overall}%` }} />
                          </div>
                          <strong className="score-value">
                            {result.overall.toFixed(1)}
                          </strong>
                        </article>
                      ))}
                    </div>
                    <div className="analysis-note">
                      <span aria-hidden="true">i</span>
                      <p>
                        Le score mesure la probabilité moyenne de chaque
                        enchaînement, fin du mot comprise. Il permet de comparer
                        les dictionnaires pour un même mot, mais ne représente
                        pas un pourcentage d’appartenance.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="analysis-empty">
                    <span aria-hidden="true">Aa</span>
                    <h2>Sélectionnez au moins un dictionnaire.</h2>
                    <p>Les scores apparaîtront ici, classés du plus élevé au plus faible.</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="analysis-summary similarity-heading">
                  <div>
                    <p className="section-index">Carte de proximité</p>
                    <h2>
                      Similarité croisée
                      <span>{selectedDictionaries.length} sources comparées</span>
                    </h2>
                  </div>
                  <div className="metric-switch" role="group" aria-label="Mesure">
                    <button
                      type="button"
                      className={metric === "patterns" ? "is-active" : ""}
                      onClick={() => setMetric("patterns")}
                    >
                      Motifs de lettres
                    </button>
                    <button
                      type="button"
                      className={metric === "vocabulary" ? "is-active" : ""}
                      onClick={() => setMetric("vocabulary")}
                    >
                      Vocabulaire commun
                    </button>
                  </div>
                </div>

                {selectedDictionaries.length >= 2 ? (
                  <>
                    <div className="similarity-table-wrap">
                      <table className="similarity-table">
                        <thead>
                          <tr>
                            <th>Source</th>
                            {selectedDictionaries.map((dictionary) => (
                              <th key={dictionary.id} title={dictionary.name}>
                                {shortName(dictionary)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDictionaries.map((row) => (
                            <tr key={row.id}>
                              <th title={row.name}>{shortName(row)}</th>
                              {selectedDictionaries.map((column) => {
                                const value =
                                  similarity.matrix.get(
                                    `${row.id}:${column.id}`,
                                  ) ?? 0;
                                return (
                                  <td
                                    key={column.id}
                                    className={row.id === column.id ? "is-self" : ""}
                                    style={{
                                      backgroundColor:
                                        row.id === column.id
                                          ? undefined
                                          : `rgba(103, 231, 207, ${Math.min(
                                              0.08 + value / 180,
                                              0.62,
                                            )})`,
                                    }}
                                    title={`${row.name} × ${column.name}`}
                                  >
                                    {value.toFixed(metric === "patterns" ? 0 : 1)}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="closest-pairs">
                      <div className="closest-pairs-heading">
                        <p className="section-index">Paires les plus proches</p>
                        <span>
                          {metric === "patterns"
                            ? "Cosinus des trigrammes"
                            : "Indice de Jaccard"}
                        </span>
                      </div>
                      <div className="pair-grid">
                        {similarity.pairs.slice(0, 4).map((pair) => (
                          <article key={`${pair.first.id}:${pair.second.id}`}>
                            <div>
                              <strong>{shortName(pair.first)}</strong>
                              <span>↔</span>
                              <strong>{shortName(pair.second)}</strong>
                            </div>
                            <p>
                              <strong>{pair.score.toFixed(1)}</strong>
                              <span>/ 100</span>
                            </p>
                            <small>
                              {pair.shared.toLocaleString("fr-FR")} mot
                              {pair.shared > 1 ? "s" : ""} identique
                              {pair.shared > 1 ? "s" : ""}
                            </small>
                          </article>
                        ))}
                      </div>
                    </div>
                    <div className="analysis-note">
                      <span aria-hidden="true">i</span>
                      <p>
                        {metric === "patterns"
                          ? "La proximité compare la fréquence des groupes de trois caractères, début et fin de mot compris. Elle révèle des habitudes d’écriture communes même sans mots identiques."
                          : "Le vocabulaire commun mesure la part de mots strictement identiques dans l’union des deux dictionnaires. Les variantes d’accents ou de casse sont normalisées."}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="analysis-empty">
                    <span aria-hidden="true">↔</span>
                    <h2>Sélectionnez au moins deux dictionnaires.</h2>
                    <p>La matrice et les paires les plus proches apparaîtront ici.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>

      <footer>
        <span>Analyses calculées localement dans votre navigateur.</span>
        <span>
          <Link href="/">Retour au générateur</Link>
        </span>
      </footer>
    </div>
  );
}
