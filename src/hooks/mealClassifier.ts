import { useCallback, useEffect, useRef, useState } from 'react';
import { AiError, buildClassifyRequestChain, classifyMeals, parseClassifyResponse } from '../ai';
import { deleteJob, relayConfig } from '../services/relay';
import { describeRelayFailure, relayFailure, stepJob } from '../services/relayJobs';
import { useStore } from '../store/store';
import type { ClassifyJob, LibraryItem, MealType } from '../types';
import { uid } from '../utils/common';

/** Items per request, so a large library still fits comfortably in one answer. */
const BATCH = 60;

/** How often a request waiting on the relay is checked while the app is open. */
const TICK_MS = 5000;

/** What the library screen shows about classification (a relay job's progress comes from `job`). */
export type ClassifyStatus =
  | { kind: 'idle' }
  | { kind: 'running'; count: number } // a direct request
  | { kind: 'failed'; message: string; detail?: string; at: string };

/**
 * Library items without meal types (items from before meal types existed, or added without choosing
 * any) are sent to the AI in the background to be classified. With a relay set in settings, the request
 * waits there (and is collected after reopening the app); otherwise it's sent directly. Each item is
 * tried once per app launch, and a failed request stops it until the next launch or "נסה שוב".
 */
export function useMealClassifier() {
  const { settings, library, jobs, actions } = useStore();
  const latest = useRef({ settings, library, jobs, actions });
  latest.current = { settings, library, jobs, actions };
  const tried = useRef(new Set<string>());
  const running = useRef(false);
  const [status, setStatus] = useState<ClassifyStatus>({ kind: 'idle' });
  const failed = status.kind === 'failed';
  const nextCheckAt = useRef(0);
  // Bumped when a request ends, so the next batch (if any) goes out.
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (failed) return;
    const apply = (result: Map<string, MealType[]>) => {
      // An answer that classifies nothing would otherwise look like nothing happened.
      if (!result.size) throw new AiError('invalid', 'no item ids matched', 'ה-AI לא החזיר סיווג לאף פריט.');
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
      const err = e instanceof AiError ? e : new AiError('invalid', String(e));
      console.warn('Meal classification failed', err);
      setStatus({ kind: 'failed', message: err.message, detail: err.detail, at: new Date().toISOString() });
    };
    const updateJob = (id: string, fn: (j: ClassifyJob) => ClassifyJob | undefined) =>
      latest.current.actions.updateJobs((j) => {
        if (j.classify?.id !== id) return j;
        const { classify, ...rest } = j;
        const next = fn(classify);
        return next ? { ...rest, classify: next } : rest;
      });

    const tick = async () => {
      const { settings, library, jobs, actions } = latest.current;
      if (running.current || !settings.apiKey.trim() || !settings.onboardingDone) return;
      const cfg = { apiKey: settings.apiKey, model: settings.model };
      const relay = relayConfig(settings);

      let job = jobs.classify;
      if (!job) {
        const todo = library.filter((i) => !i.mealTypes && !tried.current.has(i.id)).slice(0, BATCH);
        if (!todo.length) return;
        for (const i of todo) tried.current.add(i.id);
        if (!relay) {
          running.current = true;
          setStatus({ kind: 'running', count: todo.length });
          try {
            apply(await classifyMeals(cfg, todo));
            setStatus({ kind: 'idle' });
          } catch (e) {
            fail(e);
          } finally {
            running.current = false;
            setDone((n) => n + 1);
          }
          return;
        }
        job = { id: uid(), itemIds: todo.map((i) => i.id), sentAt: new Date().toISOString() };
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
      running.current = true;
      try {
        const res = await stepJob(relay, id, () => buildClassifyRequestChain(cfg, items()));
        if (res.state === 'done') {
          deleteJob(relay, id);
          updateJob(id, () => undefined);
          try {
            apply(parseClassifyResponse(res.status, res.body, items()));
          } catch (e) {
            fail(e);
          }
          setDone((n) => n + 1);
        } else {
          // The relay retries on its own schedule; nothing changes there before its next attempt.
          nextCheckAt.current = res.nextAttemptAt + 2000;
          const relayProgress = { accepted: true, attempts: res.attempts, nextAttemptAt: res.nextAttemptAt, lastError: describeRelayFailure(res.last) };
          updateJob(id, (j) => ({ ...j, relay: relayProgress }));
        }
      } catch (e) {
        const err = relayFailure(e);
        if (err) {
          updateJob(id, () => undefined);
          fail(err);
        } else {
          updateJob(id, (j) => ({ ...j, relay: { attempts: 0, accepted: false, ...j.relay, offline: true } }));
        }
      } finally {
        running.current = false;
      }
    };

    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [library, settings.apiKey, settings.model, settings.relayUrl, settings.onboardingDone, done, failed]);

  /** "נסה שוב" / "סווג עכשיו": try every unclassified item again. */
  const retry = useCallback(() => {
    tried.current.clear();
    nextCheckAt.current = 0;
    setStatus({ kind: 'idle' });
    setDone((n) => n + 1);
  }, []);

  const unclassified = library.filter((i) => !i.mealTypes).length;
  return { status, job: jobs.classify, unclassified, retry };
}

export type MealClassifier = ReturnType<typeof useMealClassifier>;
