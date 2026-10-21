import { useEffect, useRef, useState } from 'react';
import { classifyMeals } from './ai';
import { useStore } from './store';

/** Items per request, so a large library still fits comfortably in one answer. */
const BATCH = 60;

/**
 * Library items without meal types (items from before meal types existed, or added without choosing
 * any) are sent to the AI in the background to be classified. Each item is tried once per app launch,
 * and a failed request stops it until the next launch, so it doesn't eat into the rate limit.
 */
export function useMealClassifier() {
  const { settings, library, actions } = useStore();
  const tried = useRef(new Set<string>());
  const running = useRef(false);
  const failed = useRef(false);
  // Bumped when a request ends, so the next batch (if any) goes out.
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (running.current || failed.current || !settings.apiKey.trim() || !settings.onboardingDone) return;
    const todo = library.filter((i) => !i.mealTypes && !tried.current.has(i.id)).slice(0, BATCH);
    if (!todo.length) return;
    for (const i of todo) tried.current.add(i.id);
    running.current = true;

    classifyMeals({ apiKey: settings.apiKey, model: settings.model }, todo)
      .then((result) => {
        if (!result.size) return;
        const now = new Date().toISOString();
        // The user may have edited an item meanwhile; only fill in items that are still unclassified.
        actions.updateLibrary((l) =>
          l.map((i) => {
            const meals = result.get(i.id);
            return meals && !i.mealTypes && !i.mealTypesByUser ? { ...i, mealTypes: meals, updatedAt: now } : i;
          }),
        );
      })
      .catch((e) => {
        failed.current = true;
        console.warn('Meal classification failed', e);
      })
      .finally(() => {
        running.current = false;
        setDone((n) => n + 1);
      });
  }, [library, settings.apiKey, settings.model, settings.onboardingDone, actions, done]);
}
