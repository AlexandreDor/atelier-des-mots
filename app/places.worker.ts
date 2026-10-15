import {
  generateBatch,
  prepareModel,
  type GeneratorConfig,
  type WeightedSource,
} from "./generator";

type Request = {
  id: number;
  sourceKey: string;
  modelKey: string;
  sources?: WeightedSource[];
  config: GeneratorConfig;
};

const sourceCache = new Map<string, WeightedSource[]>();
const modelCache = new Map<string, ReturnType<typeof prepareModel>>();
const MAX_SOURCE_SETS = 8;
const MAX_MODELS = 8;

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, sourceKey, modelKey, sources, config } = event.data;
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
  self.postMessage({ id, cores: generateBatch(model, config) });
};
