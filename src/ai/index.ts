// The active AI provider. To switch providers, point these exports at another module with the same API.
export {
  FALL_BACK_ON,
  MODEL_CHAIN,
  PROVIDER,
  analyzeFood,
  buildAnalyzeRequest,
  buildAnalyzeRequestChain,
  buildClassifyRequestChain,
  buildRecommendRequestChain,
  classifyMeals,
  nextModelInChain,
  parseAnalyzeResponse,
  parseClassifyResponse,
  parseRecommendResponse,
  recommendMeals,
  testConnection,
} from './gemini';
export { AiError, type AiErrorKind, type FoodResult, type HttpRequest, type Question } from './food';
export { OVER_TARGET_BUDGET, type MealOption, type RecommendRequest } from './recommend';
