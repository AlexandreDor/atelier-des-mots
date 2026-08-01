"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  type Dictionary,
  type DictionaryExport,
  normalizeDictionaryWords,
  parseDictionaryImport,
} from "./dictionaries";
import { downloadTextFile } from "./download";

type DictionaryManagerProps = {
  dictionaries: Dictionary[];
  customDictionaries: Dictionary[];
  selectedId: string;
  onSelect: (id: string) => void;
  onChange: (dictionaries: Dictionary[]) => void;
  onDelete: (id: string) => void;
  onMessage: (message: string) => void;
};

export function DictionaryManager({
  dictionaries,
  customDictionaries,
  selectedId,
  onSelect,
  onChange,
  onDelete,
  onMessage,
}: DictionaryManagerProps) {
  const selected = customDictionaries.find(({ id }) => id === selectedId);
  const [newName, setNewName] = useState("");
  const [editedName, setEditedName] = useState(selected?.name ?? "");
  const [editedWords, setEditedWords] = useState(
    selected?.words.join("\n") ?? "",
  );
  const fileRef = useRef<HTMLInputElement>(null);

  function createDictionary(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (
      dictionaries.some(
        (dictionary) =>
          dictionary.name.toLocaleLowerCase("fr-FR") ===
          name.toLocaleLowerCase("fr-FR"),
      )
    ) {
      onMessage("Ce dictionnaire existe déjà.");
      return;
    }
    const dictionary = {
      id: `dictionnaire-${Date.now()}`,
      name,
      words: [],
    };
    onChange([...customDictionaries, dictionary]);
    onSelect(dictionary.id);
    setNewName("");
    onMessage(`« ${name} » est prêt à recevoir ses premiers mots.`);
  }

  function saveDictionary(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const name = editedName.trim();
    if (!name) {
      onMessage("Le nom du dictionnaire ne peut pas être vide.");
      return;
    }
    if (
      dictionaries.some(
        (dictionary) =>
          dictionary.id !== selected.id &&
          dictionary.name.toLocaleLowerCase("fr-FR") ===
            name.toLocaleLowerCase("fr-FR"),
      )
    ) {
      onMessage("Ce nom de dictionnaire existe déjà.");
      return;
    }
    const normalizedWords = normalizeDictionaryWords(
      editedWords.split(/[\n,;]+/),
    );
    const words = normalizedWords.slice(0, 100_000);
    onChange(
      customDictionaries.map((dictionary) =>
        dictionary.id === selected.id ? { ...dictionary, name, words } : dictionary,
      ),
    );
    onMessage(
      normalizedWords.length > words.length
        ? `« ${name} » enregistré. La limite de 100 000 mots a été appliquée.`
        : `« ${name} » enregistré avec ${words.length.toLocaleString("fr-FR")} mot${words.length > 1 ? "s" : ""}.`,
    );
  }

  function deleteDictionary() {
    if (!selected || !window.confirm(`Supprimer « ${selected.name} » ?`)) return;
    onDelete(selected.id);
  }

  function selectDictionary(id: string) {
    const hasUnsavedChanges =
      selected &&
      (editedName !== selected.name ||
        editedWords !== selected.words.join("\n"));
    if (
      hasUnsavedChanges &&
      !window.confirm("Abandonner les modifications non enregistrées ?")
    ) {
      return;
    }
    onSelect(id);
  }

  async function importDictionaries(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = parseDictionaryImport(await file.text(), dictionaries);
      onChange([...customDictionaries, ...imported]);
      onSelect(imported[0].id);
      const wordCount = imported.reduce(
        (sum, dictionary) => sum + dictionary.words.length,
        0,
      );
      onMessage(
        `${imported.length} dictionnaire${imported.length > 1 ? "s" : ""} et ${wordCount.toLocaleString("fr-FR")} mots importés.`,
      );
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "Le fichier JSON est invalide.",
      );
    }
  }

  function exportDictionaries() {
    const payload: DictionaryExport = {
      version: 1,
      dictionaries: customDictionaries,
    };
    downloadTextFile(
      "atelier-des-mots-dictionnaires.json",
      JSON.stringify(payload, null, 2),
      "application/json",
    );
    onMessage(`${customDictionaries.length} dictionnaire(s) exporté(s).`);
  }

  return (
    <div className="dictionary-manager">
      <label htmlFor="managed-dictionary">Dictionnaire personnalisé</label>
      <select
        id="managed-dictionary"
        className="manager-select"
        value={selected?.id ?? ""}
        onChange={(event) => selectDictionary(event.target.value)}
      >
        <option value="">Choisir un dictionnaire</option>
        {customDictionaries.map((dictionary) => (
          <option value={dictionary.id} key={dictionary.id}>
            {dictionary.name}
          </option>
        ))}
      </select>
      {selected ? (
        <form onSubmit={saveDictionary}>
          <label htmlFor="edited-dictionary-name">Nom</label>
          <input
            id="edited-dictionary-name"
            className="manager-input"
            value={editedName}
            onChange={(event) => setEditedName(event.target.value)}
          />
          <label htmlFor="edited-words">Mots, un par ligne</label>
          <textarea
            id="edited-words"
            value={editedWords}
            onChange={(event) => setEditedWords(event.target.value)}
            placeholder="luciole\nvelours\ncascade"
            rows={7}
          />
          <button type="submit" className="secondary-button">
            Enregistrer les modifications
          </button>
          <button type="button" className="danger-button" onClick={deleteDictionary}>
            Supprimer ce dictionnaire
          </button>
        </form>
      ) : (
        <p className="field-help">
          Les dictionnaires intégrés sont en lecture seule. Créez ou importez une
          liste pour la modifier.
        </p>
      )}
      <form onSubmit={createDictionary}>
        <label htmlFor="dictionary-name">Nouveau dictionnaire</label>
        <div className="inline-form">
          <input
            id="dictionary-name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nom du dictionnaire"
          />
          <button type="submit" aria-label="Créer le dictionnaire">Créer</button>
        </div>
      </form>
      <div className="dictionary-file-actions">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={importDictionaries}
          hidden
        />
        <button type="button" onClick={() => fileRef.current?.click()}>
          Importer JSON
        </button>
        <button
          type="button"
          onClick={exportDictionaries}
          disabled={!customDictionaries.length}
        >
          Exporter JSON
        </button>
      </div>
    </div>
  );
}
