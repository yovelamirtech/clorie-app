import { useCallback, useEffect, useRef, useState } from 'react';
import { AiError, buildRecommendRequestChain, parseRecommendResponse, recommendMeals, type RecommendRequest } from './ai';
import { todayKey } from './dates';
import type { MealBudget } from './meals';
import { deleteJob, relayConfig } from './relay';
import { describeRelayFailure, relayFailure, stepJob } from './relayJobs';
import { useStore } from './store';
import type { LibraryItem, MealType, SuggestMode, SuggestState } from './types';
import { uid } from './util';

/** How often a request waiting on the relay is checked while the app is open. */
const TICK_MS = 5000;

/** What the suggestion dialog knows when the user asks: today's budget for the meal and what was eaten. */
export type SuggestContext = { budget: MealBudget; remaining: number; eatenToday: string[] };

const toMessage = (e: unknown) => (e instanceof AiError ? e.message : String(e));

function recommendRequest(s: SuggestState, library: LibraryItem[], mode: SuggestMode, eatenToday: string[], exclude: string[]): RecommendRequest {
  return { meal: s.meal, budget: s.budget, library, eatenToday, mode, exclude };
}

/**
 * Meal suggestions. With a relay set in settings, the request waits there, so the app can be closed;
 * the answer is collected the next time the app is open. The latest suggestions are kept for the day.
 */
export function useSuggestFlow() {
  const { settings, library, jobs, actions } = useStore();
  const latest = useRef({ settings, library, jobs, actions });
  latest.current = { settings, library, jobs, actions };
  const inFlight = useRef(new Set<string>());
  // A direct (no relay) request in progress; its answer is dropped if the user moved on meanwhile.
  const [directLoading, setDirectLoading] = useState<SuggestMode | null>(null);
  const directId = useRef(0);

  const today = todayKey();
  const state = jobs.suggest?.date === today ? jobs.suggest : undefined;

  /** Change the saved suggestions, but only while they're still the ones with this job (or none). */
  const update = useCallback((jobId: string | undefined, fn: (s: SuggestState) => SuggestState | undefined) => {
    latest.current.actions.updateJobs((j) => {
      if (!j.suggest || j.suggest.job?.id !== jobId) return j;
      const { suggest: _old, ...rest } = j;
      const next = fn(j.suggest);
      return next ? { ...rest, suggest: next } : rest;
    });
  }, []);

  /** Move the relay job one step forward: send it, or check on it. */
  const advance = useCallback(
    async (s: SuggestState) => {
      const job = s.job;
      if (!job || inFlight.current.has(job.id)) return;
      if (job.relay?.accepted && job.relay.nextAttemptAt && Date.now() < job.relay.nextAttemptAt + 2000) return;
      const { settings } = latest.current;
      const relay = relayConfig(settings);
      if (!relay) {
        update(job.id, (cur) => ({ ...cur, job: undefined, error: { message: 'הבקשה לא הושלמה. נסה שוב.', mode: job.mode } }));
        return;
      }
      const cfg = { apiKey: settings.apiKey, model: settings.model };
      inFlight.current.add(job.id);
      try {
        const status = await stepJob(relay, job.id, () =>
          buildRecommendRequestChain(cfg, recommendRequest(s, latest.current.library, job.mode, job.eatenToday, job.exclude)),
        );
        if (status.state === 'done') {
          deleteJob(relay, job.id);
          let options;
          try {
            options = parseRecommendResponse(status.status, status.body, latest.current.library);
          } catch (e) {
            update(job.id, (cur) => ({ ...cur, job: undefined, error: { message: toMessage(e), mode: job.mode } }));
            return;
          }
          update(job.id, (cur) => ({
            ...cur,
            job: undefined,
            options: job.mode === 'new' ? [...cur.options, ...options] : options,
            seen: false,
          }));
        } else {
          update(job.id, (cur) => ({
            ...cur,
            job: {
              ...job,
              relay: { accepted: true, attempts: status.attempts, nextAttemptAt: status.nextAttemptAt, lastError: describeRelayFailure(status.last) },
            },
          }));
        }
      } catch (e) {
        const err = relayFailure(e);
        update(job.id, (cur) =>
          err
            ? { ...cur, job: undefined, error: { message: err.message, mode: job.mode } }
            : { ...cur, job: { ...job, relay: { attempts: 0, accepted: false, ...job.relay, offline: true } } },
        );
      } finally {
        inFlight.current.delete(job.id);
      }
    },
    [update],
  );

  // Resume after reopening the app, and keep checking while it's open.
  useEffect(() => {
    const tick = () => {
      const s = latest.current.jobs.suggest;
      if (!s?.job) return;
      if (s.date !== todayKey()) {
        // Yesterday's request: nobody needs the answer anymore.
        const relay = relayConfig(latest.current.settings);
        if (relay) deleteJob(relay, s.job.id);
        latest.current.actions.updateJobs(({ suggest: _old, ...j }) => j);
        return;
      }
      advance(s);
    };
    const onVisible = () => document.visibilityState === 'visible' && tick();
    tick();
    const id = setInterval(tick, TICK_MS);
    window.addEventListener('online', tick);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [advance]);

  /** Drop today's suggestions (and withdraw a waiting request), e.g. when another meal is picked. */
  const clear = useCallback(() => {
    directId.current++;
    setDirectLoading(null);
    const s = latest.current.jobs.suggest;
    if (!s) return;
    const relay = relayConfig(latest.current.settings);
    if (s.job && relay) deleteJob(relay, s.job.id);
    latest.current.actions.updateJobs(({ suggest: _old, ...j }) => j);
  }, []);

  const request = useCallback(
    async (meal: MealType, mode: SuggestMode, ctx: SuggestContext) => {
      const { settings, library, jobs, actions } = latest.current;
      const cur = jobs.suggest?.date === todayKey() && jobs.suggest.meal === meal ? jobs.suggest : undefined;
      const relay = relayConfig(settings);
      if (cur?.job && relay) deleteJob(relay, cur.job.id);
      const exclude = mode === 'new' && cur ? cur.options.map((o) => o.title) : [];
      // "More" keeps the budget the first options were made for; a fresh request works it out again.
      const base: SuggestState =
        mode === 'new' && cur
          ? { ...cur, job: undefined, error: undefined }
          : {
              date: todayKey(),
              meal,
              budget: ctx.budget.calories,
              reserved: ctx.budget.reserved,
              remaining: ctx.remaining,
              options: [],
              seen: true,
            };

      if (relay) {
        const next: SuggestState = { ...base, job: { id: uid(), mode, eatenToday: ctx.eatenToday, exclude } };
        actions.updateJobs((j) => ({ ...j, suggest: next }));
        advance(next);
        return;
      }

      const id = ++directId.current;
      actions.updateJobs((j) => ({ ...j, suggest: base }));
      setDirectLoading(mode);
      try {
        const options = await recommendMeals(
          { apiKey: settings.apiKey, model: settings.model },
          recommendRequest(base, library, mode, ctx.eatenToday, exclude),
        );
        if (id !== directId.current) return;
        update(undefined, (s) => ({ ...s, options: mode === 'new' ? [...s.options, ...options] : options, seen: false }));
      } catch (e) {
        if (id !== directId.current) return;
        update(undefined, (s) => ({ ...s, error: { message: toMessage(e), mode } }));
      } finally {
        if (id === directId.current) setDirectLoading(null);
      }
    },
    [advance, update],
  );

  const markSeen = useCallback(() => {
    const s = latest.current.jobs.suggest;
    if (s && !s.seen && s.options.length) update(s.job?.id, (cur) => ({ ...cur, seen: true }));
  }, [update]);

  const loading: SuggestMode | null = state?.job?.mode ?? directLoading;
  return { state, loading, request, clear, markSeen };
}

export type SuggestFlow = ReturnType<typeof useSuggestFlow>;
