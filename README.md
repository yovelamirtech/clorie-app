# יומן קלוריות

אפליקציית PWA אישית לרישום קלוריות בעברית חופשית, בעזרת Google Gemini API (שכבה חינמית). האפיון המלא ב-[SPEC.md](SPEC.md).

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
| `src/ai/gemini.ts` | כל הקוד של ספק ה-AI: קריאה ל-Gemini API, סכמת JSON, פענוח התשובה ומיפוי שגיאות |
| `src/ai/food.ts` | חלק שלא תלוי בספק: ההנחיה, הודעת המשתמש, בדיקות תקינות וסוגי שגיאות |
| `src/ai/index.ts` | בחירת הספק הפעיל (להחלפת ספק משנים רק כאן) |
| `src/addFlow.ts` | זרימת ההוספה: שליחה ← הבהרות ← שמירה / שגיאה |
| `src/db.ts`, `src/store.tsx` | IndexedDB (דרך `idb-keyval`) ומצב האפליקציה |
| `src/seed.ts` | המאגר ההתחלתי |
| `src/perUnit.ts` | חישוב ערך ליחידה בהצעת "לשמור במאגר?" |
| `src/backup.ts` | ייצוא, שחזור, מיזוג |
| `src/components/` | המסכים והרכיבים |

המודל ברירת המחדל הוא `gemini-3.8-flash` (ניתן לשינוי בהגדרות). מפתח משיגים בחינם ב-[aistudio.google.com](https://aistudio.google.com/apikey). המפתח נשמר רק במכשיר ולא נכלל בגיבוי.
