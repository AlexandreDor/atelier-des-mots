import type { GeneratorConfig } from "./generator";

export type Preset = {
  id: string;
  name: string;
  config: GeneratorConfig;
  dictionaryWeights: Record<string, number>;
};

export function readStoredPresets(value: unknown): Preset[] {
  if (!Array.isArray(value) || value.some((item) =>
    !item || typeof item !== "object" || typeof item.id !== "string" ||
    typeof item.name !== "string" || !item.config || typeof item.config !== "object" ||
    !item.dictionaryWeights || typeof item.dictionaryWeights !== "object",
  )) throw new Error("Les préréglages sont invalides.");
  return value;
}
