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

## שרת לניסיונות חוזרים (אופציונלי)

בתיקייה [worker/](worker/) יש Cloudflare Worker קטן: האפליקציה מעבירה אליו בקשה, והוא ממשיך לנסות אותה (עם המתנה הולכת וגדלה, עד 24 שעות) כל עוד Gemini מחזיר חריגה ממגבלה, עומס או שגיאת שרת. זה עובד גם כשהאפליקציה סגורה, כי הניסיונות רצים בשרת (Durable Object עם alarm). התוצאה נשמרת בשרת עד שהאפליקציה נפתחת ואוספת אותה. הרישום עצמו נכנס ליומן רק אז, כי הנתונים שמורים בטלפון בלבד.

הוראות הפעלה מלאות, כולל פתיחת חשבון, סיסמה לשרת ופריסה: [SETUP.md](SETUP.md).

ב-[worker/wrangler.jsonc](worker/wrangler.jsonc): `ALLOWED_HOSTS` מגביל לאילו שרתים ה-Worker יכול לפנות (רק Gemini), ו-`ALLOWED_ORIGINS` מאילו אתרים מותר להשתמש בו. הסיסמה (`APP_TOKEN`) נשמרת כ-secret ב-Cloudflare, לא בקוד.

- המפתח עובר לשרת יחד עם הבקשה, ונמחק ממנו כשהבקשה מסתיימת. תוצאה שלא נאספה נמחקת אחרי 7 ימים.
- בלי כתובת שרת, האפליקציה פונה ישירות ל-Gemini כמו קודם.
- כל בקשה לשרת צריכה את הסיסמה, והסיסמה נשמרת רק במכשיר ולא נכללת בגיבוי.
- פיתוח מקומי: להעתיק את `worker/.dev.vars.example` ל-`worker/.dev.vars`, ואז `npm run dev` בתיקייה `worker/` (פורט 8787).

## מבנה

| קובץ | תפקיד |
|---|---|
| `src/ai/gemini.ts` | כל הקוד של ספק ה-AI: קריאה ל-Gemini API, סכמת JSON, פענוח התשובה ומיפוי שגיאות |
| `src/ai/food.ts` | חלק שלא תלוי בספק: ההנחיה, הודעת המשתמש, בדיקות תקינות וסוגי שגיאות |
| `src/ai/index.ts` | בחירת הספק הפעיל (להחלפת ספק משנים רק כאן) |
| `src/addFlow.ts` | זרימת ההוספה: תור בקשות שנשמר ב-IndexedDB, שליחה ← הבהרות ← שמירה / שגיאה |
| `src/relay.ts` | לקוח לשרת הניסיונות החוזרים |
| `worker/` | שרת הניסיונות החוזרים (Cloudflare Worker) |
| `src/db.ts`, `src/store.tsx` | IndexedDB (דרך `idb-keyval`) ומצב האפליקציה |
| `src/seed.ts` | המאגר ההתחלתי |
| `src/perUnit.ts` | חישוב ערך ליחידה בהצעת "לשמור במאגר?" |
| `src/backup.ts` | ייצוא, שחזור, מיזוג |
| `src/components/` | המסכים והרכיבים |

המודל ברירת המחדל הוא `gemini-3.8-flash` (ניתן לשינוי בהגדרות). מפתח משיגים בחינם ב-[aistudio.google.com](https://aistudio.google.com/apikey). המפתח נשמר רק במכשיר ולא נכלל בגיבוי.
