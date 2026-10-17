// The active AI provider. To switch providers, point these exports at another module with the same API.
export { PROVIDER, analyzeFood, testConnection } from './gemini';
export { AiError, type AiErrorKind, type FoodResult, type Question } from './food';
