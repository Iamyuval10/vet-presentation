/**
 * firebaseRest.js
 * קובץ עזר משותף לחיבור ל-Firebase Realtime Database — ללא כל תלות
 * ב-SDK של Firebase (אין import של "firebase/app" או "firebase/database").
 * החיבור מתבצע אך ורק דרך REST API רגיל באמצעות fetch, כדי שהקוד ירוץ
 * בכל סביבה (כולל תצוגות מקדימות של ארטיפקטים) בלי תלויות NPM חיצוניות
 * שעלולות לא להיטען.
 *
 * שימי את הקובץ הזה באותה תיקייה בפרויקט (או בנתיב משותף), וייבאי ממנו
 * בשני הקבצים:
 *   import { getPath, putPath, patchPath, incrementVote, ... } from "./firebaseRest";
 *
 * איך זה עובד:
 *  - קריאה: GET לכתובת `${DATABASE_URL}/<path>.json`
 *  - כתיבה מלאה (מחליפה את כל הערך בנתיב): PUT עם body בפורמט JSON
 *  - עדכון חלקי (משלב עם מה שכבר קיים): PATCH עם body בפורמט JSON
 *  - "האזנה" בזמן אמת מדומה: polling עם setInterval (כל 1.5 שניות) —
 *    אין Web Socket/SSE כאן, רק בקשות fetch חוזרות; ה-helper subscribeToPath
 *    למטה עוטף את זה בממשק דומה ל-onValue כדי שיהיה נוח להשתמש בו.
 */

export const DATABASE_URL = "https://vet-presentation-default-rtdb.firebaseio.com";

/** GET גולמי מנתיב נתון (בלי סיומת .json — היא מתווספת אוטומטית) */
export async function getPath(path) {
  const res = await fetch(`${DATABASE_URL}/${path}.json`);
  if (!res.ok) throw new Error(`Firebase REST GET failed (${res.status}) at ${path}`);
  return res.json();
}

/** PUT — מחליף לגמרי את הערך בנתיב הנתון */
export async function putPath(path, value) {
  const res = await fetch(`${DATABASE_URL}/${path}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Firebase REST PUT failed (${res.status}) at ${path}`);
  return res.json();
}

/** PATCH — מעדכן רק את השדות שסופקו, בלי לגעת בשאר הנתונים בנתיב */
export async function patchPath(path, value) {
  const res = await fetch(`${DATABASE_URL}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Firebase REST PATCH failed (${res.status}) at ${path}`);
  return res.json();
}

/**
 * "האזנה" בזמן אמת מדומה דרך polling. מחזירה פונקציית ניקוי (unsubscribe)
 * שעוצרת את ה-interval — בדיוק כמו הערך המוחזר מ-onValue של ה-SDK.
 * onData נקרא מיד עם הערך הראשוני, ואז בכל טעינה נוספת (גם אם לא השתנה
 * הערך בפועל — זה polling פשוט, לא Diff חכם).
 */
export function subscribeToPath(path, onData, intervalMs = 1500) {
  let cancelled = false;

  async function poll() {
    try {
      const data = await getPath(path);
      if (!cancelled) onData(data);
    } catch (err) {
      // שגיאת רשת בודדת לא אמורה לעצור את הסנכרון — פשוט ננסה שוב בסבב הבא
      console.warn(`[firebaseRest] polling error at ${path}:`, err);
    }
  }

  poll();
  const id = setInterval(poll, intervalMs);
  return () => {
    cancelled = true;
    clearInterval(id);
  };
}

/**
 * מעלה ב-1 מונה הצבעה יחיד בנתיב votes/{questionNumber}/{optionId}.
 * ה-REST API הפשוט לא תומך ב-transaction אמיתי (כמו runTransaction ב-SDK),
 * ולכן זו עדכון "קרא ואז כתוב" (read-then-write) — מספיק טוב לכיתה/הרצאה
 * רגילה, אך תיאורטית עלול "לבלוע" הצבעה אחת אם שתי הצבעות מגיעות באותה
 * מילישנייה בדיוק. אם צריך חוסן מלא מול עומס גבוה מאוד, יש לעבור בעתיד
 * לחיבור Firebase אמיתי (SDK) עם runTransaction.
 */
export async function incrementVote(questionNumber, optionId) {
  const current = await getPath(`votes/${questionNumber}/${optionId}`);
  const next = (current || 0) + 1;
  await patchPath(`votes/${questionNumber}`, { [optionId]: next });
  return next;
}

/**
 * מיפוי quizId (במצגת) <-> מזהה מספרי (בטלפון), לפי תוכן השאלות:
 *   1 = dilemma       (דילמה קלינית — שקילת הרדמת הכלב ושחרורו)
 *   2 = diagnosis      (אבחון קליני — ריריות/דופק)
 *   3 = treatment      (פרוטוקול טיפול — עירוי/דקומפרסיה)
 *   4 = riskFactors    (גורמי סיכון — אנטומיה/תזונה/סטרס)
 */
export const QUIZ_ID_TO_NUMBER = {
  dilemma: 1,
  diagnosis: 2,
  treatment: 3,
  riskFactors: 4,
};

export const NUMBER_TO_QUIZ_ID = {
  1: "dilemma",
  2: "diagnosis",
  3: "treatment",
  4: "riskFactors",
};
