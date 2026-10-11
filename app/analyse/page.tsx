"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import Link from "next/link";
import {
  createAnalysisConfig,
  prepareAnalysisSources,
  scoreAnalysisWord,
} from "../analysis";
import {
  DEFAULT_ANALYSIS_DICTIONARY_IDS,
  isFirstNameDictionary,
  isNatureDictionary,
  isPlaceDictionary,
  type Dictionary,
} from "../dictionaries";
import { normalizeWord, type Algorithm } from "../generator";
import { useDictionaries } from "../use-dictionaries";

type AnalysisMode = "word" | "similarity";
type SimilarityMetric = "patterns" | "vocabulary";

const DEFAULT_SELECTED_IDS = DEFAULT_ANALYSIS_DICTIONARY_IDS;

function dictionaryCategory(dictionary: Dictionary) {
  if (isNatureDictionary(dictionary)) {
    return "Nature et sciences";
  }
  if (isPlaceDictionary(dictionary)) {
    return "Lieux";
  }
  return isFirstNameDictionary(dictionary) ? "Prénoms" : "Mots";
}

function shortName(dictionary: Dictionary) {
  return dictionary.name
    .replace(" · mots courants", "")
    .replace(" · prénoms courants", " · prénoms")
    .replace(" (romanisé)", " · rom.")
    .replace(" (rōmaji)", " · rōmaji")
    .replace(" (cyrillique)", " · cyr.");
}

const signatureCache = new WeakMap<string[], Map<string, number>>();
const vocabularyCache = new WeakMap<string[], Set<string>>();

function dictionarySignature(dictionary: Dictionary) {
  const cached = signatureCache.get(dictionary.words);
  if (cached) return cached;
  const counts = new Map<string, number>();
  dictionary.words.forEach((rawWord) => {
    const word = `^${normalizeWord(rawWord)}$`;
    for (let index = 0; index <= word.length - 3; index += 1) {
      const gram = word.slice(index, index + 3);
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
  });
  signatureCache.set(dictionary.words, counts);
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
  const firstWords =
    vocabularyCache.get(first.words) ??
    new Set(first.words.map(normalizeWord));
  const secondWords =
    vocabularyCache.get(second.words) ??
    new Set(second.words.map(normalizeWord));
  vocabularyCache.set(first.words, firstWords);
  vocabularyCache.set(second.words, secondWords);
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
  const { dictionaries, ensureDictionariesLoaded, isLoaded, storageError, retryStorage } = useDictionaries();
  const [mode, setMode] = useState<AnalysisMode>("word");
  const [word, setWord] = useState("brumelle");
  const [selectedIds, setSelectedIds] =
    useState<string[]>(DEFAULT_SELECTED_IDS);
  const [algorithm, setAlgorithm] = useState<Algorithm>("markov");
  const [order, setOrder] = useState(2);
  const [temperature, setTemperature] = useState(0.9);
  const [metric, setMetric] = useState<SimilarityMetric>("patterns");
  const [dictionaryLoadAttempt, setDictionaryLoadAttempt] = useState(0);
  const [dictionaryLoadFailure, setDictionaryLoadFailure] = useState<{
    selection: string;
    message: string;
  } | null>(null);
  const selectedIdsKey = selectedIds.join("\u0000");

  useEffect(() => {
    if (!isLoaded || !selectedIds.length) return;
    let active = true;
    void ensureDictionariesLoaded(selectedIds)
      .then(() => {
        if (active) {
          setDictionaryLoadFailure((current) =>
            current?.selection === selectedIdsKey ? null : current,
          );
        }
      })
      .catch(() => {
        if (active) {
          setDictionaryLoadFailure({
            selection: selectedIdsKey,
            message: "Les corpus sélectionnés n’ont pas pu être chargés.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [ensureDictionariesLoaded, isLoaded, selectedIds, selectedIdsKey, dictionaryLoadAttempt]);
  const dictionaryLoadError =
    dictionaryLoadFailure?.selection === selectedIdsKey
      ? dictionaryLoadFailure.message
      : "";

  const selectedInventoryDictionaries = useMemo(
    () =>
      selectedIds
        .map((id) => dictionaries.find((dictionary) => dictionary.id === id))
        .filter((dictionary): dictionary is Dictionary => Boolean(dictionary)),
    [dictionaries, selectedIds],
  );
  const selectedDictionaries = useMemo(
    () =>
      selectedInventoryDictionaries.filter(
        (dictionary) => !(dictionary.wordCount && !dictionary.words.length),
      ),
    [selectedInventoryDictionaries],
  );
  const selectedSourcesLoading = selectedInventoryDictionaries.some(
    (dictionary) => dictionary.wordCount && !dictionary.words.length,
  );

  const config = useMemo(
    () => createAnalysisConfig(algorithm, order, temperature),
    [algorithm, order, temperature],
  );
  const modelConfig = useMemo(
    () => createAnalysisConfig(algorithm, order),
    [algorithm, order],
  );
  const analysisSources = useMemo(
    () =>
      mode === "word"
        ? prepareAnalysisSources(selectedDictionaries, modelConfig)
        : [],
    [mode, selectedDictionaries, modelConfig],
  );

  const wordResults = useMemo(
    () => scoreAnalysisWord(word, analysisSources, config),
    [analysisSources, word, config],
  );

  const signatures = useMemo(
    () =>
      mode === "similarity" && metric === "patterns"
        ? new Map(
            selectedDictionaries.map((dictionary) => [
              dictionary.id,
              dictionarySignature(dictionary),
            ]),
          )
        : new Map<string, Map<string, number>>(),
    [mode, metric, selectedDictionaries],
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
    if (mode !== "similarity") return { matrix, sharedWords, pairs };
    selectedDictionaries.forEach((first, firstIndex) => {
      selectedDictionaries.forEach((second, secondIndex) => {
        const key = `${first.id}:${second.id}`;
        if (firstIndex === secondIndex) {
          matrix.set(key, 100);
          return;
        }
        if (matrix.has(key)) return;
        let shared = 0;
        let score: number;
        if (metric === "patterns") {
          score = cosineSimilarity(
            signatures.get(first.id) ?? new Map(),
            signatures.get(second.id) ?? new Map(),
          );
        } else {
          const vocabulary = vocabularySimilarity(first, second);
          score = vocabulary.score;
          shared = vocabulary.intersection;
        }
        matrix.set(key, score);
        matrix.set(`${second.id}:${first.id}`, score);
        sharedWords.set(key, shared);
        sharedWords.set(`${second.id}:${first.id}`, shared);
        if (firstIndex < secondIndex) {
          pairs.push({
            first,
            second,
            score,
            shared,
          });
        }
      });
    });
    pairs.sort((first, second) => second.score - first.score);
    return { matrix, sharedWords, pairs };
  }, [mode, selectedDictionaries, signatures, metric]);

  const strongestScore = wordResults[0]?.overall ?? 0;

  function toggleDictionary(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }

  function retrySelectedDictionaries() {
    setDictionaryLoadAttempt((current) => current + 1);
  }

  function selectCategory(
    category: "Prénoms" | "Mots" | "Lieux" | "Nature et sciences",
  ) {
    setSelectedIds(
      dictionaries
        .filter((dictionary) => dictionaryCategory(dictionary) === category)
        .map((dictionary) => dictionary.id),
    );
  }

  function handleModeTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const nextMode =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? mode === "word"
          ? "similarity"
          : "word"
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? mode === "word"
            ? "similarity"
            : "word"
          : event.key === "Home"
            ? "word"
            : event.key === "End"
              ? "similarity"
              : null;
    if (!nextMode) return;
    event.preventDefault();
    setMode(nextMode);
    window.requestAnimationFrame(() =>
      document.getElementById(`analysis-tab-${nextMode}`)?.focus(),
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
          <Link href="/licences">Licences</Link>
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
              id="analysis-tab-word"
              role="tab"
              aria-controls="analysis-tabpanel"
              aria-selected={mode === "word"}
              className={mode === "word" ? "is-active" : ""}
              onClick={() => setMode("word")}
              onKeyDown={handleModeTabKey}
            >
              <span>01</span>
              Score d’un mot
            </button>
            <button
              type="button"
              id="analysis-tab-similarity"
              role="tab"
              aria-controls="analysis-tabpanel"
              aria-selected={mode === "similarity"}
              className={mode === "similarity" ? "is-active" : ""}
              onClick={() => setMode("similarity")}
              onKeyDown={handleModeTabKey}
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
              {storageError && (
                <p role="alert">
                  {storageError}{" "}
                  <button type="button" onClick={retryStorage}>
                    Réessayer les dictionnaires personnels
                  </button>
                </p>
              )}
              {dictionaryLoadError ? (
                <p role="alert">
                  {dictionaryLoadError}{" "}
                  <button type="button" onClick={retrySelectedDictionaries}>
                    Réessayer
                  </button>
                </p>
              ) : selectedSourcesLoading ? (
                <p role="status">Chargement des corpus sélectionnés…</p>
              ) : null}
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
                <button
                  type="button"
                  onClick={() => selectCategory("Nature et sciences")}
                >
                  Toute la nature
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
                          {(dictionary.wordCount ?? dictionary.words.length).toLocaleString("fr-FR")}
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

          <div
            className="analysis-results"
            id="analysis-tabpanel"
            role="tabpanel"
            aria-labelledby={`analysis-tab-${mode}`}
            tabIndex={0}
          >
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
                  <strong>
                    {selectedSourcesLoading || dictionaryLoadError || !wordResults.length
                      ? "—"
                      : strongestScore.toFixed(1)}
                  </strong>
                  <small>
                    {dictionaryLoadError
                      ? "indisponible"
                      : selectedSourcesLoading
                        ? "en cours"
                        : wordResults.length
                          ? "/ 100"
                          : "aucun score"}
                  </small>
                  </div>
                </div>

                {wordResults.length && !selectedSourcesLoading && !dictionaryLoadError ? (
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
                        pas un pourcentage d’appartenance. Il dépend aussi de la
                        température choisie : comparez les résultats avec les
                        mêmes réglages.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="analysis-empty">
                    <span aria-hidden="true">Aa</span>
                    <h2>
                      {dictionaryLoadError
                        ? "Sources indisponibles."
                        : selectedSourcesLoading
                          ? "Chargement des sources…"
                          : selectedIds.length === 0
                            ? "Sélectionnez au moins un dictionnaire."
                            : !normalizeWord(word)
                              ? "Saisissez un mot à analyser."
                              : "Aucun score à afficher."}
                    </h2>
                    <p>
                      {dictionaryLoadError
                        ? "Réessayez le chargement des corpus sélectionnés."
                        : selectedSourcesLoading
                          ? "Les scores apparaîtront dès que les sources seront prêtes."
                          : "Les scores apparaîtront ici, classés du plus élevé au plus faible."}
                    </p>
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
                      <span>
                        {dictionaryLoadError
                          ? "Sources indisponibles"
                          : selectedSourcesLoading
                            ? "Chargement des sources…"
                            : `${selectedDictionaries.length} sources comparées`}
                      </span>
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

                {selectedDictionaries.length >= 2 &&
                !selectedSourcesLoading &&
                !dictionaryLoadError ? (
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
                              {metric === "patterns"
                                ? "Le vocabulaire commun n’est pas calculé dans cette mesure."
                                : `${pair.shared.toLocaleString("fr-FR")} mot${pair.shared > 1 ? "s" : ""} identique${pair.shared > 1 ? "s" : ""}`}
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
                    <h2>
                      {dictionaryLoadError
                        ? "Sources indisponibles."
                        : selectedSourcesLoading
                          ? "Chargement des sources…"
                          : selectedIds.length < 2
                            ? "Sélectionnez au moins deux dictionnaires."
                            : "Sources insuffisantes pour comparer."}
                    </h2>
                    <p>
                      {dictionaryLoadError
                        ? "Réessayez le chargement des corpus sélectionnés."
                        : selectedSourcesLoading
                          ? "La matrice apparaîtra dès que les sources seront prêtes."
                          : "La matrice et les paires les plus proches apparaîtront ici."}
                    </p>
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
          {" · "}
          <Link href="/licences">Licences et sources</Link>
        </span>
      </footer>
    </div>
  );
}
