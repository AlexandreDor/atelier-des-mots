"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  type Dictionary,
  MAX_DICTIONARY_IMPORT_BYTES,
  editCustomDictionary,
  isDictionaryBackup,
  createDictionaryId,
  parseDictionaryImport,
  serializeDictionaryExport,
} from "./dictionaries";
import { downloadTextFile } from "./download";

type DictionaryManagerProps = {
  dictionaries: Dictionary[];
  customDictionaries: Dictionary[];
  selectedId: string;
  readOnly?: boolean;
  onSelect: (id: string) => void;
  onChange: (dictionaries: Dictionary[]) => void;
  onDelete: (id: string) => void;
  onMessage: (message: string) => void;
};

export function DictionaryManager({
  dictionaries,
  customDictionaries,
  selectedId,
  readOnly = false,
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
    if (readOnly) return;
    const name = newName.trim();
    if (!name) return;
    if (name.length > 100) {
      onMessage("Le nom du dictionnaire est limité à 100 caractères.");
      return;
    }
    if (customDictionaries.length >= 100) {
      onMessage("La limite de 100 dictionnaires personnalisés est atteinte.");
      return;
    }
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
      id: createDictionaryId("dictionnaire", new Set(dictionaries.map(({ id }) => id))),
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
    if (!selected || readOnly) return;
    let updated: Dictionary;
    try {
      updated = editCustomDictionary(selected, editedName, editedWords, customDictionaries);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Les modifications sont invalides.");
      return;
    }
    const { name, words } = updated;
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
    const nextDictionaries = customDictionaries.map((dictionary) =>
        dictionary.id === selected.id ? updated : dictionary,
      );
    try {
      serializeDictionaryExport(nextDictionaries);
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "La taille maximale de sauvegarde est dépassée.",
      );
      return;
    }
    onChange(nextDictionaries);
    onMessage(`« ${name} » enregistré avec ${words.length.toLocaleString("fr-FR")} mot${words.length > 1 ? "s" : ""}.`);
  }

  function deleteDictionary() {
    if (readOnly || !selected || !window.confirm(`Supprimer « ${selected.name} » ?`)) return;
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
    if (!file || readOnly) return;
    try {
      if (file.size > MAX_DICTIONARY_IMPORT_BYTES) {
        throw new Error("Le fichier dépasse la limite de 64 Mo.");
      }
      const text = await file.text();
      const restoringBackup = isDictionaryBackup(JSON.parse(text));
      const imported = parseDictionaryImport(text, dictionaries);
      const currentWordCount = customDictionaries.reduce(
        (sum, dictionary) => sum + dictionary.words.length,
        0,
      );
      const addedWords = imported.reduce(
        (sum, dictionary) => sum + dictionary.words.length,
        0,
      );
      if (!restoringBackup && customDictionaries.length + imported.length > 100) {
        throw new Error("La limite de 100 dictionnaires personnalisés est atteinte.");
      }
      if (!restoringBackup && currentWordCount + addedWords > Math.max(250_000, currentWordCount)) {
        throw new Error("Les dictionnaires personnalisés sont limités à 250 000 mots cumulés.");
      }
      const nextDictionaries = [...customDictionaries, ...imported];
      serializeDictionaryExport(nextDictionaries);
      onChange(nextDictionaries);
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
    try {
      downloadTextFile(
        "atelier-des-mots-dictionnaires.json",
        serializeDictionaryExport(customDictionaries),
        "application/json",
      );
      onMessage(`${customDictionaries.length} dictionnaire(s) exporté(s).`);
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "L’export n’a pas pu être créé.",
      );
    }
  }

  return (
    <div className="dictionary-manager">
      {readOnly && (
        <p className="field-help">Exportez les dictionnaires récupérés avant de libérer de l’espace, puis réessayez leur enregistrement.</p>
      )}
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
            readOnly={readOnly}
            onChange={(event) => setEditedName(event.target.value)}
          />
          <label htmlFor="edited-words">Mots, un par ligne</label>
          <textarea
            id="edited-words"
            value={editedWords}
            readOnly={readOnly}
            onChange={(event) => setEditedWords(event.target.value)}
            placeholder="luciole\nvelours\ncascade"
            rows={7}
          />
          <button type="submit" className="secondary-button" disabled={readOnly}>
            Enregistrer les modifications
          </button>
          <button type="button" className="danger-button" onClick={deleteDictionary} disabled={readOnly}>
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
            disabled={readOnly}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nom du dictionnaire"
          />
          <button type="submit" aria-label="Créer le dictionnaire" disabled={readOnly}>Créer</button>
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
        <button type="button" onClick={() => fileRef.current?.click()} disabled={readOnly}>
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
