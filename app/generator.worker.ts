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
  sources: WeightedSource[];
  config: GeneratorConfig;
};

type GenerationResponse = {
  id: number;
  model: PreparedModel;
  words: string[];
};

const modelCache = new Map<string, PreparedModel>();

self.onmessage = (event: MessageEvent<GenerationRequest>) => {
  const { id, modelKey, sources, config } = event.data;
  const model = modelCache.get(modelKey) ?? prepareModel(sources, config);
  modelCache.set(modelKey, model);
  const response: GenerationResponse = {
    id,
    model,
    words: generateBatch(model, config),
  };
  self.postMessage(response);
};
