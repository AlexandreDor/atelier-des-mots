import {
  GeneratorConfig,
  PreparedModel,
  WeightedSource,
  generateBatch,
  prepareModel,
} from "./generator";

type GenerationRequest = {
  id: number;
  modelKey: string;
  sourceKey: string;
  includeModel: boolean;
  sources?: WeightedSource[];
  config: GeneratorConfig;
};

type GenerationResponse = {
  id: number;
  model?: PreparedModel;
  words: string[];
};

const modelCache = new Map<string, PreparedModel>();
const sourceCache = new Map<string, WeightedSource[]>();
const MAX_MODELS = 8;
const MAX_SOURCE_SETS = 8;

self.onmessage = (event: MessageEvent<GenerationRequest>) => {
  const { id, modelKey, sourceKey, includeModel, sources, config } = event.data;
  if (sources) sourceCache.set(sourceKey, sources);
  const cachedSources = sourceCache.get(sourceKey);
  if (cachedSources) {
    sourceCache.delete(sourceKey);
    sourceCache.set(sourceKey, cachedSources);
  }
  while (sourceCache.size > MAX_SOURCE_SETS) {
    const oldestKey = sourceCache.keys().next().value;
    if (oldestKey === undefined) break;
    sourceCache.delete(oldestKey);
  }
  let model = modelCache.get(modelKey);
  if (model) modelCache.delete(modelKey);
  else {
    if (!cachedSources) {
      throw new Error("Les sources de génération ne sont plus en cache.");
    }
    model = prepareModel(cachedSources, config);
  }
  modelCache.set(modelKey, model);
  while (modelCache.size > MAX_MODELS) {
    const oldestKey = modelCache.keys().next().value;
    if (oldestKey === undefined) break;
    modelCache.delete(oldestKey);
  }
  const response: GenerationResponse = {
    id,
    ...(includeModel ? { model } : {}),
    words: generateBatch(model, config),
  };
  self.postMessage(response);
};
