import { useCallback, useRef, useState } from 'react';
import { analyzeFood, ClaudeError, type Question } from './claude';
import { useStore } from './store';
import type { Clarification, Entry } from './types';
import { uid } from './util';

export type Pending =
  | { phase: 'loading'; text: string; date: string; answers?: Clarification[] }
  | { phase: 'clarify'; text: string; date: string; questions: Question[] }
  | { phase: 'error'; text: string; date: string; error: ClaudeError; answers?: Clarification[] };

/** The add flow: send → (clarify →) save, or error with the text kept in the composer. */
export function useAddFlow() {
  const { settings, library, actions } = useStore();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  // Keep the latest store values for async callbacks.
  const latest = useRef({ settings, library, actions });
  latest.current = { settings, library, actions };

  const run = useCallback(async (text: string, date: string, answers?: Clarification[]) => {
    setPending({ phase: 'loading', text, date, answers });
    setDraft('');
    try {
      const { settings, library, actions } = latest.current;
      const res = await analyzeFood({ apiKey: settings.apiKey, model: settings.model }, text, library, answers);
      if (res.status === 'needs_clarification') {
        setPending({ phase: 'clarify', text, date, questions: res.questions });
        return;
      }
      const entry: Entry = {
        id: uid(),
        date,
        createdAt: new Date().toISOString(),
        originalText: text,
        title: res.title,
        items: res.items.map((i) => ({ id: uid(), ...i })),
        ...(answers?.length ? { clarifications: answers } : {}),
      };
      actions.addEntry(entry);
      setPending(null);
      setLastAddedId(entry.id);
    } catch (e) {
      const error = e instanceof ClaudeError ? e : new ClaudeError('invalid', String(e));
      setPending({ phase: 'error', text, date, error, answers });
      setDraft(text);
    }
  }, []);

  const send = useCallback(
    (date: string) => {
      const text = draft.trim();
      if (!text || pending?.phase === 'loading' || pending?.phase === 'clarify') return;
      run(text, date);
    },
    [draft, pending, run],
  );

  /** Retry after an error. Uses the (possibly edited) composer text; keeps answers if the text is unchanged. */
  const retry = useCallback(() => {
    if (pending?.phase !== 'error') return;
    const text = draft.trim() || pending.text;
    run(text, pending.date, text === pending.text ? pending.answers : undefined);
  }, [draft, pending, run]);

  const answer = useCallback(
    (answers: Clarification[]) => {
      if (pending?.phase !== 'clarify') return;
      run(pending.text, pending.date, answers);
    },
    [pending, run],
  );

  /** Abandon the clarification/error card and put the text back in the composer. */
  const cancel = useCallback(() => {
    if (!pending || pending.phase === 'loading') return;
    setDraft(pending.text);
    setPending(null);
  }, [pending]);

  const clearLastAdded = useCallback(() => setLastAddedId(null), []);

  return { draft, setDraft, pending, send, retry, answer, cancel, lastAddedId, clearLastAdded };
}

export type AddFlow = ReturnType<typeof useAddFlow>;
