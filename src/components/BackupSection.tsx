import { useRef, useState } from 'react';
import { useStore } from '../store';
import { type Backup, exportBackup, mergeBackup, parseBackup, replaceWithBackup } from '../backup';
import { ConfirmDialog, Dialog } from './Dialog';

type ImportStep = { backup: Backup; confirmReplace: boolean } | null;

export function BackupSection() {
  const { settings, entries, library, ui, queue, jobs, actions } = useStore();
  const data = { settings, entries, library, ui, queue, jobs };
  const fileRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [importStep, setImportStep] = useState<ImportStep>(null);
  const [wipeStep, setWipeStep] = useState<0 | 1 | 2>(0);

  const doExport = async () => {
    setStatus(null);
    try {
      const r = await exportBackup(data);
      if (r !== 'cancelled') setStatus({ ok: true, msg: `הגיבוי נוצר: ${entries.length} רישומים, ${library.length} פריטי מאגר.` });
    } catch (e) {
      setStatus({ ok: false, msg: `הייצוא נכשל: ${String(e)}` });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setStatus(null);
    try {
      const backup = parseBackup(await file.text());
      setImportStep({ backup, confirmReplace: false });
    } catch (e) {
      setStatus({ ok: false, msg: (e as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const applyImport = async (mode: 'merge' | 'replace') => {
    if (!importStep) return;
    const next = mode === 'merge' ? mergeBackup(data, importStep.backup) : replaceWithBackup(data, importStep.backup);
    setImportStep(null);
    try {
      await actions.replaceAll(next);
      setStatus({ ok: true, msg: `השחזור הושלם: ${next.entries.length} רישומים, ${next.library.length} פריטי מאגר.` });
    } catch (e) {
      setStatus({ ok: false, msg: `השחזור נכשל: ${String(e)}` });
    }
  };

  return (
    <>
      <section className="card">
        <h2 className="section-title">גיבוי ושחזור</h2>
        <p className="hint">הנתונים נשמרים רק במכשיר הזה. כדאי לייצא גיבוי מדי פעם. הגיבוי לא כולל את מפתח ה-API.</p>
        <div className="field-row">
          <button className="btn" onClick={doExport}>ייצוא</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>שחזור מקובץ</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        {status && <div className={status.ok ? 'ok-box' : 'error-box'}>{status.msg}</div>}
      </section>

      <section className="card">
        <h2 className="section-title">מחיקת כל הנתונים</h2>
        <p className="hint">מוחק את כל הרישומים, המאגר וההגדרות, כולל מפתח ה-API.</p>
        <button className="btn btn-ghost-danger" onClick={() => setWipeStep(1)}>מחיקת כל הנתונים</button>
      </section>

      {importStep && !importStep.confirmReplace && (
        <Dialog
          title="שחזור מגיבוי"
          onClose={() => setImportStep(null)}
          actions={
            <>
              <button className="btn" onClick={() => setImportStep(null)}>ביטול</button>
              <button className="btn btn-danger" onClick={() => setImportStep({ ...importStep, confirmReplace: true })}>החלפת הכול</button>
              <button className="btn btn-primary" onClick={() => applyImport('merge')}>מיזוג</button>
            </>
          }
        >
          <div className="text-muted">
            בקובץ: {importStep.backup.entries.length} רישומים ו-{importStep.backup.library.length} פריטי מאגר.
            <ul className="bullets">
              <li><b>מיזוג</b>: מוסיף את מה שחסר, בלי למחוק כלום.</li>
              <li><b>החלפת הכול</b>: מוחק את הנתונים הנוכחיים ושם במקומם את הגיבוי.</li>
            </ul>
          </div>
        </Dialog>
      )}

      {importStep?.confirmReplace && (
        <ConfirmDialog
          title="להחליף את כל הנתונים?"
          message={`${entries.length} הרישומים ו-${library.length} פריטי המאגר הנוכחיים יימחקו ויוחלפו בגיבוי.`}
          confirmLabel="החלפה"
          danger
          onCancel={() => setImportStep(null)}
          onConfirm={() => applyImport('replace')}
        />
      )}

      {wipeStep === 1 && (
        <ConfirmDialog
          title="למחוק את כל הנתונים?"
          message="כל הרישומים, המאגר וההגדרות יימחקו מהמכשיר."
          confirmLabel="המשך"
          danger
          onCancel={() => setWipeStep(0)}
          onConfirm={() => setWipeStep(2)}
        />
      )}
      {wipeStep === 2 && (
        <ConfirmDialog
          title="בטוח?"
          message="אי אפשר לבטל את הפעולה הזאת. אם אין לך גיבוי, הנתונים יאבדו."
          confirmLabel="מחיקה סופית"
          danger
          onCancel={() => setWipeStep(0)}
          onConfirm={() => { setWipeStep(0); actions.resetAll(); }}
        />
      )}
    </>
  );
}
