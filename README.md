# יומן קלוריות

אפליקציית PWA אישית לרישום קלוריות בעברית חופשית, בעזרת Claude API. האפיון המלא ב-[SPEC.md](SPEC.md).

## פיתוח

```bash
npm install
npm run dev
```

- `npm run build` – בדיקת טיפוסים ובנייה ל-`dist/`.
- `npm run preview` – הרצת הבנייה (כולל service worker).
- `npm run icons` – יצירה מחדש של האייקונים מ-`public/icon.svg`.

## פריסה ל-GitHub Pages

1. ליצור ריפו ב-GitHub ולדחוף ל-`main`.
2. בריפו: Settings ← Pages ← Source: **GitHub Actions**.
3. כל push ל-`main` מריץ את [.github/workflows/deploy.yml](.github/workflows/deploy.yml), שבונה עם `BASE_PATH=/<שם-הריפו>/` ומפרסם.

## מבנה

| קובץ | תפקיד |
|---|---|
| `src/claude.ts` | קריאה ל-Claude API, ההנחיה, הכלי `report_food`, בדיקות תקינות ושגיאות |
| `src/addFlow.ts` | זרימת ההוספה: שליחה ← הבהרות ← שמירה / שגיאה |
| `src/db.ts`, `src/store.tsx` | IndexedDB (דרך `idb-keyval`) ומצב האפליקציה |
| `src/seed.ts` | המאגר ההתחלתי |
| `src/perUnit.ts` | חישוב ערך ליחידה בהצעת "לשמור במאגר?" |
| `src/backup.ts` | ייצוא, שחזור, מיזוג |
| `src/components/` | המסכים והרכיבים |

המודל ברירת המחדל הוא `claude-haiku-5-5` (ניתן לשינוי בהגדרות). המפתח נשמר רק במכשיר ולא נכלל בגיבוי.
