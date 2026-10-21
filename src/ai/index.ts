// The active AI provider. To switch providers, point these exports at another module with the same API.
export {
  MODEL_CHAIN,
  PROVIDER,
  analyzeFood,
  buildAnalyzeRequest,
  buildAnalyzeRequestChain,
  classifyMeals,
  nextModelInChain,
  parseAnalyzeResponse,
  recommendMeals,
  testConnection,
} from './gemini';
export { AiError, type AiErrorKind, type FoodResult, type HttpRequest, type Question } from './food';
export { OVER_TARGET_BUDGET, type MealOption } from './recommend';
