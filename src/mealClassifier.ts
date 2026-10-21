import { useEffect, useRef, useState } from 'react';
import { buildClassifyRequestChain, classifyMeals, parseClassifyResponse } from './ai';
import { deleteJob, relayConfig } from './relay';
import { relayFailure, stepJob } from './relayJobs';
import { useStore } from './store';
import type { LibraryItem, MealType } from './types';
import { uid } from './util';

/** Items per request, so a large library still fits comfortably in one answer. */
const BATCH = 60;

/** How often a request waiting on the relay is checked while the app is open. */
const TICK_MS = 5000;

/**
 * Library items without meal types (items from before meal types existed, or added without choosing
 * any) are sent to the AI in the background to be classified. With a relay set in settings, the request
 * waits there (and is collected after reopening the app); otherwise it's sent directly. Each item is
 * tried once per app launch, and a failed request stops it until the next launch.
 */
export function useMealClassifier() {
  const { settings, library, jobs, actions } = useStore();
  const latest = useRef({ settings, library, jobs, actions });
  latest.current = { settings, library, jobs, actions };
  const tried = useRef(new Set<string>());
  const running = useRef(false);
  const failed = useRef(false);
  const nextCheckAt = useRef(0);
  // Bumped when a request ends, so the next batch (if any) goes out.
  const [done, setDone] = useState(0);

  useEffect(() => {
    const apply = (result: Map<string, MealType[]>) => {
      if (!result.size) return;
      const now = new Date().toISOString();
      // The user may have edited an item meanwhile; only fill in items that are still unclassified.
      latest.current.actions.updateLibrary((l) =>
        l.map((i) => {
          const meals = result.get(i.id);
          return meals && !i.mealTypes && !i.mealTypesByUser ? { ...i, mealTypes: meals, updatedAt: now } : i;
        }),
      );
    };
    const fail = (e: unknown) => {
      failed.current = true;
      console.warn('Meal classification failed', e);
    };

    const tick = async () => {
      const { settings, library, jobs, actions } = latest.current;
      if (running.current || failed.current || !settings.apiKey.trim() || !settings.onboardingDone) return;
      const cfg = { apiKey: settings.apiKey, model: settings.model };
      const relay = relayConfig(settings);

      let job = jobs.classify;
      if (!job) {
        const todo = library.filter((i) => !i.mealTypes && !tried.current.has(i.id)).slice(0, BATCH);
        if (!todo.length) return;
        for (const i of todo) tried.current.add(i.id);
        if (!relay) {
          running.current = true;
          classifyMeals(cfg, todo)
            .then(apply, fail)
            .finally(() => {
              running.current = false;
              setDone((n) => n + 1);
            });
          return;
        }
        job = { id: uid(), itemIds: todo.map((i) => i.id) };
        const created = job;
        actions.updateJobs((j) => ({ ...j, classify: created }));
        nextCheckAt.current = 0;
      }
      // A job saved while a relay was set, but the relay was removed since: drop it and start over directly.
      if (!relay) {
        actions.updateJobs(({ classify: _dropped, ...j }) => j);
        return;
      }
      if (Date.now() < nextCheckAt.current) return;

      const ids = new Set(job.itemIds);
      const items = (): LibraryItem[] => latest.current.library.filter((i) => ids.has(i.id));
      const { id } = job;
      const finish = () => latest.current.actions.updateJobs(({ classify: _done, ...j }) => j);
      running.current = true;
      try {
        const status = await stepJob(relay, id, () => buildClassifyRequestChain(cfg, items()));
        if (status.state === 'done') {
          deleteJob(relay, id);
          finish();
          try {
            apply(parseClassifyResponse(status.status, status.body, items()));
          } catch (e) {
            fail(e);
          }
          setDone((n) => n + 1);
        } else {
          // The relay retries on its own schedule; nothing changes there before its next attempt.
          nextCheckAt.current = status.nextAttemptAt + 2000;
        }
      } catch (e) {
        const err = relayFailure(e);
        if (err) {
          finish();
          fail(err);
        }
      } finally {
        running.current = false;
      }
    };

    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [library, settings.apiKey, settings.model, settings.relayUrl, settings.onboardingDone, done]);
}
