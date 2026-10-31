import { useCallback, useEffect, useRef, useState } from 'react';
import { AiError, FALL_BACK_ON, analyzeFood, buildAnalyzeRequestChain, nextModelInChain, parseAnalyzeResponse, type FoodResult } from '../ai';
import { RelayError, deleteJob, getJob, putJob, relayConfig } from '../services/relay';
import { describeRelayFailure } from '../services/relayJobs';
import { withAutoLibrary } from '../utils/autoLibrary';
import { learnMealType, mealByTime, mealHintFor } from '../utils/meals';
import { useStore } from '../store/store';
import type { Clarification, Entry, QueueItem } from '../types';
import { uid } from '../utils/common';
import { atTime, todayKey } from '../utils/dates';

type Loading = Extract<QueueItem, { phase: 'loading' }>;

/** The parts of a queue item that stay the same through every phase. */
const base = ({ id, text, date, createdAt, eatenAt, planned }: QueueItem) => ({
  id,
  text,
  date,
  createdAt,
  ...(eatenAt ? { eatenAt } : {}),
  ...(planned ? { planned } : {}),
});

/** How often waiting requests are checked while the app is open. */
const TICK_MS = 5000;


const toError = (e: unknown) => {
  const err = e instanceof AiError ? e : new AiError('invalid', String(e));
  return { kind: err.kind, message: err.message, detail: err.detail };
};

/**
 * The add flow: send → (clarify →) save, or an error card with "נסה שוב".
 * Messages wait in a persistent queue, so several can be on their way at once. With a relay set in
 * settings, the relay keeps retrying a request until the API answers, even while the app is closed;
 * the app collects the answer the next time it's open.
 */
export function useAddFlow() {
  const { settings, library, queue, actions } = useStore();
  const [draft, setDraft] = useState('');
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  // Keep the latest store values for async callbacks.
  const latest = useRef({ settings, library, queue, actions });
  latest.current = { settings, library, queue, actions };
  const inFlight = useRef(new Set<string>());

  /** Replace the item if it's still on this attempt (it may have been cancelled meanwhile). */
  const replace = useCallback((item: Loading, next: QueueItem | null): boolean => {
    let found = false;
    latest.current.actions.updateQueue((q) =>
      q.flatMap((x) => {
        if (x.id !== item.id || x.phase !== 'loading' || x.attempt !== item.attempt) return [x];
        found = true;
        return next ? [next] : [];
      }),
    );
    return found;
  }, []);

  /** Turn the API's answer into an entry, a clarification card or an error card. */
  const settle = useCallback(
    (item: Loading, outcome: () => FoodResult) => {
      const { text, date, createdAt, answers, eatenAt, planned } = item;
      let res: FoodResult;
      try {
        res = outcome();
      } catch (e) {
        replace(item, { ...base(item), answers, phase: 'error', error: toError(e) });
        return;
      }
      if (res.status === 'needs_clarification') {
        replace(item, { ...base(item), phase: 'clarify', questions: res.questions });
        return;
      }
      if (!replace(item, null)) return;
      const mealType = res.mealType ?? mealByTime(new Date(eatenAt ?? createdAt));
      const { items, added, updated } = withAutoLibrary(res.items, latest.current.library, mealType);
      const entry: Entry = {
        id: uid(),
        date,
        createdAt,
        originalText: text,
        title: res.title,
        items,
        ...(answers?.length ? { clarifications: answers } : {}),
        mealType,
        ...(eatenAt ? { eatenAt } : {}),
        ...(planned ? { planned: true } : {}),
      };
      latest.current.actions.addEntry(entry);
      const used = new Set(items.flatMap((i) => (i.libraryItemId ? [i.libraryItemId] : [])));
      if (used.size) {
        const changed = new Map(updated.map((u) => [u.id, u]));
        latest.current.actions.updateLibrary((l) => learnMealType([...l.map((x) => changed.get(x.id) ?? x), ...added], used, mealType));
      }
      setLastAddedId(entry.id);
    },
    [replace],
  );

  /** Move a loading item one step forward: send it, or check on it at the relay. */
  const advance = useCallback(
    async (item: Loading) => {
      if (inFlight.current.has(item.attempt)) return;
      // The relay retries on its own schedule; nothing changes there before the next attempt.
      if (item.relay?.accepted && item.relay.nextAttemptAt && Date.now() < item.relay.nextAttemptAt + 2000) return;
      inFlight.current.add(item.attempt);
      try {
        const { settings, library } = latest.current;
        const cfg = { apiKey: settings.apiKey, model: settings.model };
        const hint = mealHintFor(item.date, item.createdAt, item.eatenAt);
        const relay = relayConfig(settings);

        if (!relay) {
          // Every request starts from the configured model; on a rate-limit or overload, step down the
          // fallback chain and retry right away, for this request only — settings aren't touched, so
          // the next request starts from the configured model again.
          let model = cfg.model;
          let res: FoodResult;
          for (;;) {
            try {
              res = await analyzeFood({ ...cfg, model }, item.text, library, hint, item.answers);
              break;
            } catch (e) {
              const next = e instanceof AiError && FALL_BACK_ON.has(e.kind) ? nextModelInChain(model) : undefined;
              if (!next) {
                settle(item, () => { throw e; });
                return;
              }
              model = next;
            }
          }
          settle(item, () => res);
          return;
        }

        let status;
        try {
          status = item.relay?.accepted ? await getJob(relay, item.attempt) : null;
          // Unknown to the relay (never arrived, or expired): send it (again).
          status ??= await putJob(relay, item.attempt, buildAnalyzeRequestChain(cfg, item.text, library, hint, item.answers));
        } catch (e) {
          if (e instanceof RelayError && e.kind === 'unreachable') {
            const relay = { attempts: 0, accepted: false, ...item.relay, offline: true };
            replace(item, { ...item, relay });
          } else if (e instanceof RelayError && e.kind === 'auth') {
            settle(item, () => { throw new AiError('auth', e.message, 'הסיסמה לשרת הניסיונות החוזרים לא נכונה. כדאי לבדוק אותה בהגדרות.'); });
          } else if (e instanceof RelayError) {
            settle(item, () => { throw new AiError('bad_request', e.message, 'שרת הניסיונות החוזרים דחה את הבקשה.'); });
          } else {
            settle(item, () => { throw e; });
          }
          return;
        }

        if (status.state === 'done') {
          deleteJob(relay, item.attempt);
          const { status: code, body } = status;
          settle(item, () => parseAnalyzeResponse(code, body, latest.current.library, item.answers));
        } else {
          replace(item, {
            ...item,
            relay: {
              accepted: true,
              attempts: status.attempts,
              nextAttemptAt: status.nextAttemptAt,
              lastError: describeRelayFailure(status.last),
            },
          });
        }
      } finally {
        inFlight.current.delete(item.attempt);
      }
    },
    [replace, settle],
  );

  // Resume after reopening the app, and keep checking while it's open.
  useEffect(() => {
    const tick = () => {
      for (const item of latest.current.queue) if (item.phase === 'loading') advance(item);
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

  const start = useCallback(
    (item: Omit<QueueItem, 'phase'>, existing: boolean) => {
      const next: Loading = { ...item, phase: 'loading', attempt: uid() };
      actions.updateQueue((q) => (existing ? q.map((x) => (x.id === item.id ? next : x)) : [...q, next]));
      advance(next);
    },
    [actions, advance],
  );

  /** `time` is "HH:MM" on `date` when the user gave one; null = now. An entry for tomorrow is planned. */
  const send = useCallback(
    (date: string, time: string | null = null) => {
      const text = draft.trim();
      if (!text) return;
      setDraft('');
      start({
        id: uid(),
        text,
        date,
        createdAt: new Date().toISOString(),
        ...(time ? { eatenAt: atTime(date, time) } : {}),
        ...(date > todayKey() ? { planned: true } : {}),
      }, false);
    },
    [draft, start],
  );

  const find = (id: string) => latest.current.queue.find((x) => x.id === id);

  /** Retry after an error, with the same text and answers. */
  const retry = useCallback(
    (id: string) => {
      const item = find(id);
      if (item?.phase !== 'error') return;
      start({ ...base(item), answers: item.answers }, true);
    },
    [start],
  );

  const answer = useCallback(
    (id: string, answers: Clarification[]) => {
      const item = find(id);
      if (item?.phase !== 'clarify') return;
      start({ ...base(item), answers }, true);
    },
    [start],
  );

  /** Drop the card (a waiting request is withdrawn) and put the text back in the composer. */
  const cancel = useCallback(
    (id: string) => {
      const item = find(id);
      if (!item) return;
      const relay = relayConfig(latest.current.settings);
      if (item.phase === 'loading' && item.relay?.accepted && relay) deleteJob(relay, item.attempt);
      actions.updateQueue((q) => q.filter((x) => x.id !== id));
      setDraft((d) => (d.trim() ? `${d.trimEnd()}\n${item.text}` : item.text));
    },
    [actions],
  );

  const clearLastAdded = useCallback(() => setLastAddedId(null), []);

  return { draft, setDraft, queue, send, retry, answer, cancel, lastAddedId, clearLastAdded };
}

export type AddFlow = ReturnType<typeof useAddFlow>;
