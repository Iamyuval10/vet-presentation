import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import { subscribeToPath, incrementVote, QUIZ_ID_TO_NUMBER } from "./firebaseRest";
import { QUESTIONS } from "./data/questions";

/**
 * Vote.jsx
 * רכיב מובייל לשימוש הקהל בזמן מצגת בלייב.
 * מנהל מסכי-מצב: waiting / active / locked-waiting / revealed
 * קובץ יחיד — כולל בתוכו גם את סרגל הבדיקה (DevControls) כקומפוננטה
 * פנימית. החיבור ל-Firebase נעשה דרך REST API בלבד (fetch) — בלי שום
 * import של חבילת firebase (npm), כדי שהקוד ירוץ בכל סביבה בלי תלויות
 * שעלולות לא להיטען (למשל בתצוגה מקדימה של ארטיפקט).
 *
 * חיבור ל-Firebase (devMode=false):
 *  - עושה polling (fetch כל 1.5 שניות) על נתיב currentSession כדי לדעת
 *    האם השקופית הנוכחית במצגת היא בכלל שקופית שאלה (isQuestionSlide),
 *    ואם כן — איזו שאלה פעילה עכשיו ומה מצבה ("active" = שאלה פתוחה
 *    להצבעה, "revealed" = המרצה עבר למסך התוצאה/הסבר). כל עוד המרצה
 *    נמצא על שקופית שאינה שאלה (שער, תוכן, תמונה וכו' — כולל לפני
 *    שהגיע לשאלה הראשונה), isQuestionSlide הוא false ומוצג מסך המתנה
 *    כללי ("השיעור בעיצומו... תיכף מתחילים בשאלות!"), בלי לחשוף מספר
 *    שאלה או ממשק הצבעה כלשהו. המעבר בין המסכים קורה אוטומטית ברגע
 *    שהמרצה מעביר שקופית במצגת הראשית.
 *  - בלחיצה על תשובה, כותב הצבעה לנתיב votes/{questionId}/{option}
 *    (GET ואז PATCH דרך fetch רגיל — ראו incrementVote בקובץ
 *    firebaseRest.js), ושומר את הבחירה מקומית (localStorage, לפי מספר
 *    שאלה ומזהה ה-session הנוכחי) כדי שהמכשיר הזה לא יוכל להצביע
 *    פעמיים לאותה שאלה, גם אחרי רענון עמוד/סגירת טאב — ויעבור מיד
 *    למסך "ממתין לשאלה הבאה" עם הבחירה נעולה, בלי לחשוף אם היא נכונה.
 *  - התשובה הנכונה/הסבר נחשפים אך ורק כשה-status הופך ל-"revealed"
 *    (כלומר כשהמרצה מעביר בפועל את המצגת לשקופית התוצאה).
 *  - כל עליית/רענון של עמוד המצגת הראשית (Presentation.jsx) משדרת
 *    sessionId חדש דרך currentSession. הטלפון משווה אותו למה שהוא שמר
 *    מקומית: אם הוא שונה, זה סימן שהמרצה התחיל מפגש חדש — כל התשובות
 *    השמורות נמחקות אוטומטית, והמשתמש חוזר להיות משתתף "נקי" שיכול
 *    להצביע מחדש על כל שאלה. מזהה המכשיר עצמו (voterId) קבוע לצמיתות
 *    ואינו מתאפס בין sessions.
 *  - דורש קובץ firebaseRest.js (ראו ./firebaseRest) עם אותה כתובת
 *    Database URL כמו שמוגדרת ברכיב המצגת הראשית, כדי ששני הצדדים
 *    יתחברו לאותו מסד נתונים.
 *
 * Props:
 *  - devMode: boolean — מציג סרגל בדיקה בתחתית המסך שמאפשר מעבר ידני בין
 *    מצבים ושאלות, בלי תלות ב-Firebase. ברירת מחדל: true. הפוך ל-false
 *    כדי להתחבר בפועל ל-Firebase (או מחק את בלוק ה-DevControls בתחתית הקובץ).
 */

// מאגר אפשרויות התשובה לכל שאלה (המלל שמוצג בטלפון + התשובה הנכונה),
// לפי מספר השאלה התואם בדיוק לסדר הופעתה במצגת הראשית (ראו
// QUIZ_ID_TO_NUMBER ב-firebaseRest.js). נבנה אוטומטית מתוך
// src/data/questions.js — מקור האמת המשותף גם למצגת הראשית (ראו
// Presentation.jsx) — כך שתוכן השאלות (כולל מספר האפשרויות בפועל,
// למשל שאלה עם 3 אפשרויות בלבד) מסונכרן תמיד בין שני הקבצים.
const QUESTION_OPTIONS = Object.fromEntries(
  Object.entries(QUESTIONS).map(([quizId, q]) => {
    const number = QUIZ_ID_TO_NUMBER[quizId];
    const options = {};
    let correct = null;
    q.options.forEach((opt) => {
      options[opt.id] = opt.text;
      if (opt.correct) correct = opt.id;
    });
    return [number, { number, correct, options }];
  })
);

const COLORS = {
  bg: "#070804",
  textPrimary: "#fbfaf4",
  textSecondary: "#c3c6b4",
  accent: "#d4b055",
  success: "#3fae6f",
  wrong: "#d93744",
};

const OPTION_LABELS = { a: "א", b: "ב", c: "ג", d: "ד" };

// מזהה מכשיר/משתתף קבוע — נוצר פעם אחת בלבד ונשמר לצמיתות ב-localStorage
// (לא מתאפס אף פעם, גם לא בין sessions), כדי לזהות את אותו טלפון לאורך
// כל השימושים באפליקציה.
const VOTER_ID_KEY = "gdv-voter-id";

// מפתח האחסון המקומי שבו נשמרות תשובות המשתמש, יחד עם ה-sessionId שאליו
// הן שייכות: { sessionId, answers: { [questionNumber]: optionKey } }.
// כל עוד ה-sessionId תואם למה שמשודר כרגע מהמצגת הראשית, התשובות
// נשארות תקפות ונטענות מחדש בכל רענון/פתיחה מחדש של הטלפון — אך ברגע
// שהמרצה מרענן את עמוד המצגת (ומשדר sessionId חדש), הרשומה כולה
// מתאפסת אוטומטית וכל שאלה נפתחת מחדש להצבעה.
const SESSION_STORAGE_KEY = "gdv-vote-session";

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateVoterId() {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(VOTER_ID_KEY);
    if (!id) {
      id = generateId();
      window.localStorage.setItem(VOTER_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function loadStoredSession() {
  if (typeof window === "undefined") return { sessionId: null, answers: {} };
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return { sessionId: null, answers: {} };
    const parsed = JSON.parse(raw);
    return {
      sessionId: parsed.sessionId || null,
      answers: parsed.answers || {},
    };
  } catch {
    return { sessionId: null, answers: {} };
  }
}

function saveStoredSession(record) {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // localStorage לא זמין (מצב פרטי/חסום) — לא קריטי, פשוט לא נשמר בין רענונים
  }
}

// זיהוי משתמש קבוע (onboarding): שני מפתחות נפרדים (לא אובייקט אחד),
// לפי הדרישה המפורשת — "ראשי תיבות" ו"שם הכלב", נשמרים לצמיתות
// ב-localStorage (בניגוד ל-sessionRecord למעלה, זה לא מתאפס בין
// sessions/רענונים של המרצה — זו זהות של האדם המשתמש בטלפון הזה, לא
// חלק ממצב ההצבעה של הרצאה ספציפית).
const USER_INITIALS_KEY = "userInitials";
const DOG_NAME_KEY = "dogName";

function loadOnboardingProfile() {
  if (typeof window === "undefined") return null;
  try {
    const userInitials = window.localStorage.getItem(USER_INITIALS_KEY);
    const dogName = window.localStorage.getItem(DOG_NAME_KEY);
    if (userInitials && dogName) return { userInitials, dogName };
    return null;
  } catch {
    return null;
  }
}

function saveOnboardingProfile(userInitials, dogName) {
  try {
    window.localStorage.setItem(USER_INITIALS_KEY, userInitials);
    window.localStorage.setItem(DOG_NAME_KEY, dogName);
  } catch {
    // localStorage לא זמין — לא קריטי, ה-state בזיכרון עדיין תקף לסשן הנוכחי
  }
}

// כתובת ה-Apps Script Web App (או שירות webhook תואם) שאמורה לקבל POST
// ולרשום כל הצבעה כשורה בגיליון Google Sheets. עדיין לא הוגדרה בפועל —
// יש להחליף במחרוזת הכתובת האמיתית לאחר פריסת ה-Apps Script (Deploy >
// Web App, גישה "Anyone"). כל עוד הערך ריק, השליחה מדולגת בשקט (רק
// אזהרה ב-console), כדי לא לשבור את זרימת ההצבעה בפרודקשן.
const GOOGLE_SHEETS_WEBHOOK_URL = "";

/**
 * שליחת אירוע הצבעה בודד ל-webhook של Google Sheets — fire-and-forget
 * (לא ממתינים לתשובה ולא חוסמים את זרימת ההצבעה אם היא נכשלת/איטית).
 * payload כולל userInitials/dogName (מה-onboarding) יחד עם פרטי
 * ההצבעה עצמה, כדי שכל שורה בגיליון תזהה מי הצביע מה.
 */
function sendVoteToGoogleSheets(payload) {
  if (!GOOGLE_SHEETS_WEBHOOK_URL) {
    console.warn(
      "[Vote] GOOGLE_SHEETS_WEBHOOK_URL is not configured yet — skipping Sheets log:",
      payload
    );
    return;
  }
  fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => console.warn("[Vote] Google Sheets webhook failed:", err));
}

export default function Vote({ devMode = true }) {
  // מזהה המכשיר הזה — קבוע לצמיתות, לא תלוי ב-session (נוצר פעם אחת
  // ולעולם לא מתאפס). נשמר כרגע רק ב-localStorage; לא נדרש להצבעה
  // עצמה (שהיא מונה פשוט ב-Firebase), אך מבטיח לכל טלפון זהות יציבה
  // לאורך כל השימושים באפליקציה.
  const [voterId] = useState(getOrCreateVoterId);

  // פרופיל ה-onboarding: { userInitials, dogName } או null אם עדיין לא
  // מולא (או שנמחק). כל עוד הוא null, הרכיב חוסם את המסך הראשי במודל
  // onboarding לא-ניתן-לסגירה (ראו return למטה) — ברגע שממלאים אותו
  // (או שכבר נמצא ב-localStorage מ-session קודם), הוא נשאר קבוע לאורך
  // כל חיי הרכיב.
  const [profile, setProfile] = useState(loadOnboardingProfile);

  const handleOnboardingSubmit = (userInitials, dogName) => {
    saveOnboardingProfile(userInitials, dogName);
    setProfile({ userInitials, dogName });
  };

  // רשומת ה-session המקומית: { sessionId, answers: {[questionNumber]: optionKey} }.
  // נטענת מ-localStorage באתחול כדי לשרוד רענון/סגירה-ופתיחה-מחדש של
  // הטאב, כל עוד עדיין מדובר באותו session שהמרצה שידר.
  const [sessionRecord, setSessionRecord] = useState(loadStoredSession);

  // --- מצב פנימי לשימוש סרגל הבדיקה בלבד ---
  const [devStatus, setDevStatus] = useState("waiting"); // waiting | active | revealed
  const [devQuestionId, setDevQuestionId] = useState(1);

  // --- מצב ייצור: פולינג על currentSession ב-Firebase (REST, fetch כל 1.5 שנ') ---
  // status: "waiting" | "active" | "revealed", isQuestionSlide — האם
  // השקופית שהמרצה נמצא עליה כרגע היא בכלל שקופית שאלה (הצבעה/תוצאה),
  // וגם sessionId — מזהה ה-session הפעיל כרגע, שמשתנה בכל רענון של
  // עמוד המצגת הראשית.
  const [liveSession, setLiveSession] = useState({
    status: "waiting",
    activeQuestionId: null,
    sessionId: null,
    isQuestionSlide: false,
  });

  useEffect(() => {
    if (devMode) return;
    const unsubscribe = subscribeToPath("currentSession", (val) => {
      const v = val || {};
      setLiveSession({
        status: v.status || "waiting",
        activeQuestionId: v.activeQuestionId || null,
        sessionId: v.sessionId || null,
        isQuestionSlide: !!v.isQuestionSlide,
      });
    });
    return () => unsubscribe();
  }, [devMode]);

  // זיהוי session חדש: בכל פעם שה-sessionId המשודר מהמצגת שונה מזה
  // ששמור מקומית (המרצה רענן/פתח מחדש את עמוד המצגת), מאפסים לגמרי את
  // התשובות השמורות בטלפון הזה ומצמידים אותו ל-session החדש — כך
  // שהמשתמש חוזר להיות משתתף "נקי" שיכול להצביע מחדש על כל שאלה.
  useEffect(() => {
    if (devMode) return;
    const liveId = liveSession.sessionId;
    if (!liveId) return;
    setSessionRecord((prev) => {
      if (prev.sessionId === liveId) return prev;
      const next = { sessionId: liveId, answers: {} };
      saveStoredSession(next);
      return next;
    });
  }, [devMode, liveSession.sessionId]);

  const status = devMode ? devStatus : liveSession.status;
  // בדיוק כמו בייצור (isQuestionSlide משודר מ-Presentation.jsx), גם
  // בסרגל הבדיקה status "waiting" מייצג שקופית לא-שאלה (שער/תוכן/וכו')
  // — כל שאר הסטטוסים מייצגים שקופית שאלה בפועל.
  const isQuestionSlide = devMode ? devStatus !== "waiting" : liveSession.isQuestionSlide;
  const questionId = devMode ? devQuestionId : liveSession.activeQuestionId;
  const question = isQuestionSlide && questionId ? QUESTION_OPTIONS[questionId] : null;
  const answeredKey = questionId != null ? sessionRecord.answers[questionId] : undefined;
  const hasAnswered = answeredKey != null;

  // תשובות שנשמרו ב-session הנוכחי (מגובות ב-localStorage דרך
  // sessionRecord) — הספירה שלהן קובעת איזה ניסוח יוצג במסך ההמתנה:
  // 0 תשובות שמורות = טרם התחילו שאלות, יותר מ-0 = כבר ענו על שאלה
  // אחת לפחות וממתינים להמשך.
  const savedAnswers = sessionRecord.answers;
  const savedAnswersCount = Object.keys(savedAnswers).length;

  const handleSelect = (key) => {
    if (status !== "active" || hasAnswered || !questionId) return;

    setSessionRecord((prev) => {
      const next = { ...prev, answers: { ...prev.answers, [questionId]: key } };
      saveStoredSession(next);
      return next;
    });

    if (devMode) return;

    // שליחת הצבעה: incrementVote עושה GET ואז PATCH דרך fetch רגיל
    // (ראו הערה על מגבלות ה-REST API הפשוט בקובץ firebaseRest.js),
    // ובנוסף כותב רשומת אירוע מלאה (כולל userInitials/dogName מה-
    // onboarding) לנתיב voteEvents/. profile אמור תמיד להיות מלא כאן
    // (המסך הראשי חסום ע"י מודל ה-onboarding כל עוד הוא null), אבל אם
    // בכל זאת חסר — שולחים null במקום לזרוק שגיאה.
    const voteMeta = {
      voterId,
      userInitials: profile ? profile.userInitials : null,
      dogName: profile ? profile.dogName : null,
    };
    incrementVote(questionId, key, voteMeta).catch((err) =>
      console.warn("vote failed:", err)
    );

    sendVoteToGoogleSheets({
      questionNumber: questionId,
      optionId: key,
      userInitials: voteMeta.userInitials,
      dogName: voteMeta.dogName,
      voterId,
      ts: Date.now(),
    });
  };

  // מסך שיוצג בפועל, לפי isQuestionSlide + status + האם המכשיר כבר ענה
  // על השאלה הנוכחית:
  //  - waiting: המרצה נמצא על שקופית שאינה שאלה בכלל (שער/תוכן/תמונה
  //    וכו', כולל לפני שהגיע לשאלה הראשונה) — question יהיה null במקרה
  //    הזה, ולכן שני התנאים למטה נכשלים ממילא ותמיד נשארים על waiting.
  //  - active + לא ענה: מסך הצבעה
  //  - active + ענה: "ממתין לשאלה הבאה", עם הבחירה נעולה, בלי לחשוף נכון/לא נכון
  //  - revealed: המרצה עבר למסך התוצאה — חושפים אם התשובה שנבחרה הייתה נכונה
  let screen = "waiting";
  if (status === "active" && question) {
    screen = hasAnswered ? "locked-waiting" : "active";
  } else if (status === "revealed" && question) {
    screen = "revealed";
  }

  // key ייחודי למסך המוצג כרגע (מסך+שאלה) — בכל מעבר קדימה/אחורה בין
  // שאלות או בין מצבים (הצבעה/המתנה/חשיפה), ה-key משתנה וה-div מתחת
  // מתחלף מחדש ב-DOM, מה שמפעיל את אנימציית ה-fade-in ונותן תחושת
  // "צעד קדימה" חלקה גם כשהמעבר מגיע מ-polling ברקע.
  const screenKey = `${screen}-${questionId ?? "none"}`;

  // בלי שום נעילת overflow/position על html/body (ראו בלוק ה-style
  // למטה) — נעילה כזו התבררה כמסוכנת יותר מהבעיה שהיא נועדה לפתור: אם
  // הדפדפן כבר טען את הדף כשהוא גלול-חלקית (למשל בגלל פוקוס אוטומטי או
  // אנימציית ה-URL bar ב-iOS Safari) ואז מיד "ננעל" ב-overflow: hidden,
  // המשתמש נתקע במצב הגלול הזה בלי שום דרך לגלול בחזרה למעלה. הפתרון
  // הנכון הוא ההפך: לאפשר גלילה רגילה של הדף (html/body: overflow-y:
  // auto), ובמקביל לאלץ באופן אקטיבי איפוס-גלילה ל-(0,0) ב-useLayoutEffect
  // — פעם אחת בעליית הרכיב, ופעם נוספת בכל מעבר מסך/שאלה (screenKey
  // משתנה). useLayoutEffect (ולא useEffect) רץ סינכרונית לפני הציור,
  // כדי שלא יהיה רגע נראה-לעין של offset שגוי.
  useLayoutEffect(() => {
    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    resetScroll();
    // ה-onboarding (מודל חובה בטעינה ראשונה) כולל שדות טקסט — פוקוס
    // עליהם פותח את מקלדת המכשיר, וב-iOS Safari זה גורר גלילה אוטומטית
    // של הדף כדי להציג את השדה מעל המקלדת. כשהמודל נסגר (profile
    // מתמלא) המקלדת נסגרת, אבל אנימציית הסגירה שלה יכולה להזיז את
    // הגלילה שוב כמה מאות מ"ש אחרי שה-effect כבר רץ — ולכן איפוס נוסף
    // בעיכוב קצר, בנוסף לאיפוס המיידי.
    const t = setTimeout(resetScroll, 350);
    return () => clearTimeout(t);
  }, [screenKey, !!profile]);

  return (
    <div className="app-container" style={styles.screen} dir="rtl">
      <style>{`
        /* בכוונה בלי overflow: hidden, position: fixed, או height קשיח
           (100dvh) על html/body: כל אחת מהנעילות האלה יכולה "לקפוא"
           את הדף במצב גלול-חלקית אם הוא כבר היה במצב כזה ברגע שהיא
           הוחלה (למשל אחרי פוקוס אוטומטי/אנימציית URL bar ב-iOS
           Safari) — ואז אין למשתמש שום דרך לגלול בחזרה למעלה. במקום
           זאת: גלילה רגילה של הדף (min-height: 100%, overflow-y: auto),
           ואיפוס-גלילה אקטיבי דרך JS בכל טעינה/מעבר שאלה (ראו
           useLayoutEffect למעלה) — כך שהתוכן תמיד *מתחיל* מלמעלה, אבל
           אף פעם לא "נעול" שם אם המשתמש בכל זאת רוצה/צריך לגלול.
           background-color זהה לרקע המצגת (COLORS.bg) כדי שלא יופיע
           רקע לבן בשום מצב. */
        html, body {
          margin: 0;
          padding: 0;
          min-height: 100%;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          background-color: ${COLORS.bg};
        }
        #root, .app-container {
          height: 100dvh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          align-items: stretch;
        }
        @keyframes gdvVoteFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .gdv-vote-anim { animation: gdvVoteFadeIn 0.35s ease; }
        @media (prefers-reduced-motion: reduce) {
          .gdv-vote-anim { animation: none; }
        }
      `}</style>

      {profile && (
        <div style={styles.greetingBar}>
          היי {profile.userInitials}, הבעלים של {profile.dogName}
        </div>
      )}

      <div className="gdv-vote-anim" key={screenKey} style={styles.animWrap}>
        {screen === "waiting" && <WaitingState savedAnswersCount={savedAnswersCount} />}
        {screen === "active" && (
          <ActiveState question={question} onSelect={handleSelect} />
        )}
        {screen === "locked-waiting" && (
          <LockedWaitingState question={question} selected={answeredKey} />
        )}
        {screen === "revealed" && (
          <RevealedState question={question} selected={answeredKey} />
        )}
      </div>

      {devMode && (
        <>
          {/* מרווח בזרימה הרגילה (לא fixed) ששומר מקום כדי שסרגל הבדיקה
              (fixed בתחתית המסך האמיתי) לא יכסה חזותית את סוף התוכן —
              screen זורם באופן טבעי (min-height, לא locked), אז אם
              התוכן ארוך מהמסך הדף גולל, וה-spacer הזה חייב להיות חלק
              מהזרימה כדי שהגלילה תיקח אותו בחשבון. */}
          <div style={{ height: 56, flexShrink: 0 }} aria-hidden="true" />
          <DevControls
            status={devStatus}
            onStatusChange={setDevStatus}
            questionId={devQuestionId}
            onQuestionChange={setDevQuestionId}
          />
        </>
      )}

      {/* מודל onboarding חובה — מוצג מעל כל מסך (overlay מלא), כל עוד
          profile הוא null (אין userInitials+dogName שמורים). אין X,
          אין לחיצה על הרקע לסגירה, ואין מקש Escape — הדרך היחידה
          להיעלם היא שליחת הטופס בהצלחה (ראו handleOnboardingSubmit). */}
      {!profile && <OnboardingModal onSubmit={handleOnboardingSubmit} />}
    </div>
  );
}

/**
 * מודל onboarding חובה בפעם הראשונה — חוסם את כל המסך (overlay מלא,
 * z-index גבוה, בלי אפשרות סגירה) עד שהמשתמש ממלא שני שדות ושולח.
 * הכפתור נשאר disabled כל עוד אחד השדות ריק (רווחים בלבד נחשבים ריק
 * — ראו trim() למטה), כדי שלא ייווצרו רשומות עם ערכים ריקים.
 */
// שדה ראשי-התיבות מוגבל ל-2 אותיות (שם פרטי + משפחה) — ה-state עצמו
// מחזיק תמיד רק את האותיות "האמיתיות" (בלי נקודה/רווח), וה-formatting
// מחושב ממנו לצורך התצוגה בלבד. כך אין תלות בפענוח מחרוזת מפורמטת
// בחזרה (diffing) — מקור האמת היחיד הוא רשימת האותיות.
const INITIALS_MAX_LETTERS = 2;

// אות ראשונה -> "א. " (נקודה+רווח, מוכן להקלדת האות הבאה).
// שתי אותיות (או יותר, ליתר ביטחון) -> "א.ב" בלי רווח בין הנקודה
// לאות הבאה, לפי הדוגמה המדויקת בדרישה.
function formatInitials(letters) {
  if (letters.length === 0) return "";
  if (letters.length === 1) return `${letters}. `;
  return letters.split("").join(".");
}

// מסנן מתוך הערך הגולמי של ה-input רק את תווי הפורמט שאנחנו עצמנו
// מוסיפים (נקודה ורווח) — כל שאר התווים (עברית/לועזית) הם "אותיות"
// לכל דבר, וה-slice חותך לכל היותר 2 מהן.
function extractInitialsLetters(raw) {
  return raw
    .split("")
    .filter((ch) => ch !== "." && ch !== " ")
    .slice(0, INITIALS_MAX_LETTERS)
    .join("");
}

function OnboardingModal({ onSubmit }) {
  // initialsLetters מחזיק רק אותיות גולמיות (למשל "אב"), לעולם לא את
  // הנקודה/רווח המפורמטים — אלה מחושבים אך ורק לתצוגה (formatInitials).
  const [initialsLetters, setInitialsLetters] = useState("");
  const [dogName, setDogName] = useState("");
  const canSubmit = initialsLetters.length > 0 && dogName.trim().length > 0;

  const handleInitialsChange = (e) => {
    setInitialsLetters(extractInitialsLetters(e.target.value));
  };

  // מיירטים Backspace/Delete באופן מלא (preventDefault) ומטפלים בהם
  // ידנית על רשימת האותיות הגולמית — כך שמחיקה תמיד מסירה אות שלמה
  // אחת, ולא "נתקעת" על הנקודה/רווח שהוספנו אוטומטית (למשל: אחרי "א. ",
  // Backspace יחיד מרוקן את השדה לגמרי, לא רק מוחק את הרווח). אם יש
  // טווח מסומן (למשל בחירת-הכל), מוחקים הכל בבת אחת.
  const handleInitialsKeyDown = (e) => {
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    e.preventDefault();
    const hasSelection = e.target.selectionStart !== e.target.selectionEnd;
    setInitialsLetters((prev) => (hasSelection ? "" : prev.slice(0, -1)));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(formatInitials(initialsLetters).trim(), dogName.trim());
  };

  return (
    <div style={styles.onboardingOverlay}>
      <form style={styles.onboardingCard} onSubmit={handleSubmit}>
        <h2 style={styles.onboardingTitle}>ברוכים הבאים! בואו נכיר...</h2>

        <div style={styles.onboardingField}>
          <label style={styles.onboardingLabel} htmlFor="onboarding-initials">
            ראשי תיבות של שם פרטי ומשפחה
          </label>
          <input
            id="onboarding-initials"
            type="text"
            inputMode="text"
            value={formatInitials(initialsLetters)}
            onChange={handleInitialsChange}
            onKeyDown={handleInitialsKeyDown}
            placeholder="א.י"
            style={styles.onboardingInput}
            autoComplete="off"
            autoFocus={false}
          />
        </div>

        <div style={styles.onboardingField}>
          <label style={styles.onboardingLabel} htmlFor="onboarding-dog-name">
            אני הבעלים של...
          </label>
          <input
            id="onboarding-dog-name"
            type="text"
            value={dogName}
            onChange={(e) => setDogName(e.target.value)}
            placeholder="שם הכלב..."
            style={styles.onboardingInput}
            autoComplete="off"
            autoFocus={false}
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            ...styles.onboardingSubmit,
            ...(canSubmit ? {} : styles.onboardingSubmitDisabled),
          }}
        >
          להתחלת השאלון
        </button>
      </form>
    </div>
  );
}

// כרטיסי התשובה שומרים כברירת מחדל על גודל טקסט/ריפוד "נוח" קבוע.
// רק אם המסך קטן מדי מכדי להכיל את כל האפשרויות בלי גלילה (למשל שאלה
// עם טקסט ארוך במיוחד — ראו שאלה 4 — על מסך טלפון נמוך), ה-hook הזה
// מודד את הגובה הטבעי הדרוש מול הגובה הזמין בפועל, ובמקרה כזה בלבד
// מצמצם קנה-מידה אחיד (חושף אותו כ-CSS custom property --vote-scale
// על אלמנט השורש, שכל הגדלים המוצמדים לו — טקסט/ריפוד/מרווחים —
// מוכפלים בו דרך calc()) — כך שהתוכן תמיד נכנס במלואו במסך אחד בלי
// לגלוש ובלי צורך ב-scroll, ובלי לקטין דבר כשאין בכך צורך.
const MIN_FIT_SCALE = 0.72;

function useFitScale(deps) {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    function measure() {
      // מדידה תמיד מתבצעת בקנה-מידה טבעי (1), כדי לדעת אם באמת נדרש
      // כיווץ ביחס לתוכן המלא, ולא ביחס לכיווץ שהוחל בסבב קודם.
      el.style.setProperty("--vote-scale", "1");
      const natural = el.scrollHeight;
      const available = el.clientHeight;
      if (!available || natural <= available) {
        setScale(1);
        return;
      }
      setScale(Math.max(MIN_FIT_SCALE, available / natural));
    }

    measure();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, scale };
}

// שני הניסוחים המלאים של מסך ההמתנה, כמחרוזת שלמה אחת כל אחד (בלי
// לפצל בין title/subtitle), כדי למנוע כל אי-ודאות סביב סדר התווים
// כשהם מוצגים יחד ב-DOM.
const WAITING_MESSAGE_BEFORE_ANY_ANSWER = "השיעור בעיצומו... תיכף מתחילים בשאלות!";
const WAITING_MESSAGE_BETWEEN_QUESTIONS = "השיעור בעיצומו... מוכן לשאלה הבאה?";

/**
 * מסך המתנה כללי, המוצג בכל שקופית שאינה שאלה. הניסוח נבחר לפי ספירת
 * התשובות השמורות ב-session הנוכחי (savedAnswersCount, מחושב בהורה
 * מתוך sessionRecord.answers): 0 = טרם התחילו שאלות, יותר מ-0 = כבר
 * ענו על שאלה אחת לפחות וממתינים להמשך. מכיוון שהספירה מחושבת מחדש
 * בכל render, המסך מתעדכן אוטומטית ברגע שהמשתמש מצביע בפעם הראשונה.
 */
function WaitingState({ savedAnswersCount }) {
  const message =
    savedAnswersCount > 0 ? WAITING_MESSAGE_BETWEEN_QUESTIONS : WAITING_MESSAGE_BEFORE_ANY_ANSWER;

  return (
    <div style={styles.centerWrap}>
      <div style={styles.pulseDot} />
      <p style={styles.waitingTitle}>{message}</p>
    </div>
  );
}

/**
 * כותרת "שאלה N" — מוצגת בזהות (אותו מבנה/עיצוב) בראש כל מסך שקשור
 * לשאלה כלשהי (הצבעה פעילה / המתנה נעולה / חשיפת תשובה), כדי שהמספור
 * יישאר עקבי לחלוטין לאורך כל מסכי הטלפון ויתאם למספר המוצג במצגת.
 */
function QuestionHeader({ number }) {
  return (
    <div style={styles.header}>
      <span style={styles.questionNumber}>שאלה {number}</span>
    </div>
  );
}

function ActiveState({ question, onSelect }) {
  const { ref, scale } = useFitScale([question]);
  return (
    <div ref={ref} style={{ ...styles.activeWrap, "--vote-scale": scale }}>
      <QuestionHeader number={question.number} />

      <div style={styles.optionsWrap}>
        {Object.keys(question.options).map((key) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            style={styles.optionButton}
          >
            <span style={styles.optionBadge}>{OPTION_LABELS[key]}</span>
            <span style={styles.optionText}>{question.options[key]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * מוצג כאשר המכשיר כבר הצביע על השאלה הנוכחית, אך המרצה עדיין לא עבר
 * למסך התוצאה. הבחירה הקודמת נשארת מסומנת ונעולה, ואין שום רמז אם היא
 * נכונה — הפידבק מתעכב עד שהמרצה עצמו חושף את התשובה במצגת.
 */
function LockedWaitingState({ question, selected }) {
  const { ref, scale } = useFitScale([question, selected]);
  return (
    <div ref={ref} style={{ ...styles.votedWrap, "--vote-scale": scale }}>
      <QuestionHeader number={question.number} />

      <div style={styles.votedHeader}>
        <Check size={18} strokeWidth={3} color={COLORS.accent} />
        <p style={styles.votedTitle}>תשובתך נקלטה!</p>
      </div>

      <div style={styles.optionsWrap}>
        {Object.keys(question.options).map((key) => {
          const isSelected = selected === key;
          return (
            <div
              key={key}
              style={{
                ...styles.optionButton,
                ...styles.lockedOptionRow,
                ...(isSelected ? styles.lockedOptionRowSelected : {}),
              }}
            >
              <span
                style={{
                  ...styles.optionBadge,
                  ...(isSelected ? styles.optionBadgeSelected : {}),
                }}
              >
                {OPTION_LABELS[key]}
              </span>
              <span
                style={{
                  ...styles.optionText,
                  ...(isSelected ? styles.lockedOptionTextSelected : {}),
                }}
              >
                {question.options[key]}
              </span>
              {isSelected && (
                <Check
                  size={20}
                  strokeWidth={3}
                  color={COLORS.accent}
                  style={styles.lockedCheckIcon}
                />
              )}
            </div>
          );
        })}
      </div>

      <p style={styles.votedSubtitle}>ממתין לשאלה הבאה...</p>
    </div>
  );
}

/**
 * מוצג רק לאחר שהמרצה עצמו עבר במצגת לשקופית התוצאה/הסבר של השאלה
 * הזו (status === "revealed"). כאן — ורק כאן — נחשף אם הבחירה של
 * המשתמש הייתה נכונה או שגויה, יחד עם סימון האפשרות הנכונה.
 */
function RevealedState({ question, selected }) {
  const answered = selected != null;
  const isCorrect = answered && selected === question.correct;
  const { ref, scale } = useFitScale([question, selected]);

  return (
    <div ref={ref} style={{ ...styles.votedWrap, "--vote-scale": scale }}>
      <QuestionHeader number={question.number} />

      <div style={styles.votedHeader}>
        {answered ? (
          isCorrect ? (
            <Check size={20} strokeWidth={3} color={COLORS.success} />
          ) : (
            <X size={20} strokeWidth={3} color={COLORS.wrong} />
          )
        ) : null}
        <p
          style={{
            ...styles.votedTitle,
            color: !answered
              ? COLORS.textPrimary
              : isCorrect
              ? COLORS.success
              : COLORS.wrong,
          }}
        >
          {answered ? (isCorrect ? "כל הכבוד, ענית נכון!" : "התשובה שבחרת שגויה") : "לא הספקת להצביע"}
        </p>
      </div>

      <div style={styles.optionsWrap}>
        {Object.keys(question.options).map((key) => {
          const isSelected = selected === key;
          const isRight = key === question.correct;
          const rowStyle = isRight
            ? styles.revealCorrectRow
            : isSelected
            ? styles.revealWrongRow
            : styles.lockedOptionRow;
          return (
            <div
              key={key}
              style={{
                ...styles.optionButton,
                ...rowStyle,
              }}
            >
              <span
                style={{
                  ...styles.optionBadge,
                  ...(isRight
                    ? styles.optionBadgeCorrect
                    : isSelected
                    ? styles.optionBadgeWrong
                    : {}),
                }}
              >
                {OPTION_LABELS[key]}
              </span>
              <span
                style={{
                  ...styles.optionText,
                  ...(isRight || isSelected ? styles.lockedOptionTextSelected : {}),
                }}
              >
                {question.options[key]}
              </span>
              {isRight && (
                <Check size={20} strokeWidth={3} color={COLORS.success} style={styles.lockedCheckIcon} />
              )}
              {!isRight && isSelected && (
                <X size={20} strokeWidth={3} color={COLORS.wrong} style={styles.lockedCheckIcon} />
              )}
            </div>
          );
        })}
      </div>

      <p style={styles.votedSubtitle}>הסתכל על הלוח להסבר המלא</p>
    </div>
  );
}

/**
 * DevControls
 * סרגל בדיקה דיסקרטי לתחתית המסך — מאפשר מעבר ידני בין מצבי ה-session
 * (waiting / active / revealed) ובין שאלות 1-4, בלי תלות בשרת. ההצבעה
 * עצמה (ולכן מעבר למסך "ממתין לשאלה הבאה") מתבצעת ע"י לחיצה בפועל על
 * אחת האפשרויות במסך active, בדיוק כמו בייצור.
 */
function DevControls({ status, onStatusChange, questionId, onQuestionChange }) {
  const STATUSES = ["waiting", "active", "revealed"];
  const QUESTION_IDS = [1, 2, 3, 4];

  return (
    <div style={styles.devBar}>
      <div style={styles.devLabel}>Dev</div>

      <div style={styles.devGroup}>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => onStatusChange(s)}
            style={{
              ...styles.devBtn,
              ...(status === s ? styles.devBtnActive : {}),
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={styles.devDivider} />

      <div style={styles.devGroup}>
        {QUESTION_IDS.map((id) => (
          <button
            key={id}
            onClick={() => onQuestionChange(id)}
            style={{
              ...styles.devQBtn,
              ...(questionId === id ? styles.devBtnActive : {}),
            }}
          >
            {id}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  // height: 100dvh + overflow-y: auto -> הקונטיינר הראשי (.app-container,
  // ראו className על אלמנט השורש למטה, ובלוק ה-style למעלה) תופס בדיוק
  // גובה מסך אחד. זה *לא* אותו דבר כמו הנעילה המסוכנת של html/body
  // (overflow: hidden) שנמנעה בכוונה למעלה (ראו ההערה על useLayoutEffect
  // של איפוס-גלילה) — .app-container הוא div רגיל, לא body עצמו, ולכן
  // לא מפריע להתנהגות ה-URL bar הטבעית של הדפדפן ואינו יכול "לנעול"
  // משתמש במצב גלול-חלקית. הגובה הקשיח כאן חשוב במיוחד כדי ש-useFitScale
  // (ראו activeWrap/votedWrap למטה) יוכל בכלל למדוד "כמה שטח יש" ולכווץ
  // תוכן שלא נכנס — בלי גובה קשיח כלשהו בשרשרת ה-flex, clientHeight תמיד
  // שווה ל-scrollHeight וההתאמה האוטומטית לא עושה כלום. overflow-y: auto
  // (לא hidden) הוא רשת ביטחון: אם התוכן עדיין ארוך מדי גם אחרי הכיווץ
  // המקסימלי (MIN_FIT_SCALE), אפשר לגלול בתוך .app-container עצמו במקום
  // שהתוכן ייחתך בשקט. justifyContent: "flex-start" + alignItems:
  // "stretch" מבטיחים שהתוכן תמיד מתחיל מהפינה העליונה-ימנית. הסגנון
  // הזה (inline) חופף במתכוון לכללי ה-CSS class למעלה — inline תמיד
  // גובר, אז שני המקורות חייבים להישאר מסונכרנים.
  screen: {
    height: "100dvh",
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    width: "100%",
    backgroundColor: COLORS.bg,
    color: COLORS.textPrimary,
    fontFamily:
      "'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "stretch",
    boxSizing: "border-box",
    padding: "0.5rem",
    margin: 0,
    position: "relative",
  },
  // flex: 1 + minHeight: 0 -> כשהתוכן קצר (למשל מסך "ממתין"), האזור הזה
  // נמתח למלא את שארית הגובה הקשיח של screen (כדי ש-centerWrap יוכל
  // למרכז אנכית). ה-minHeight: 0 קריטי: בלעדיו, item בתוך flex column
  // מקבל min-height: auto כברירת מחדל (= גובה התוכן שלו), מה שמבטל את
  // אילוץ ה-flex:1 ומונע מ-activeWrap/votedWrap למטה לקבל גובה זמין
  // אמיתי לצורך המדידה של useFitScale.
  animWrap: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    margin: 0,
    position: "relative",
  },
  // פס ברכה קבוע ("היי X, הבעלים של Y") — מוצג בכל מסך (waiting/
  // active/locked/revealed כאחד) ברגע שיש profile שמור, לא רק במסך
  // אחד ספציפי. flexShrink: 0 כדי שלא ייגזל ממנו שטח בטעות בתוך
  // ה-flex column של screen.
  greetingBar: {
    flexShrink: 0,
    textAlign: "center",
    fontSize: "0.75rem",
    fontWeight: 500,
    color: COLORS.textSecondary,
    paddingBottom: "0.5rem",
  },
  centerWrap: {
    flex: 1,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 0",
    textAlign: "center",
    boxSizing: "border-box",
  },
  pulseDot: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    backgroundColor: COLORS.accent,
    marginBottom: 28,
    flexShrink: 0,
    boxShadow: `0 0 0 8px rgba(212, 176, 85, 0.15)`,
  },
  waitingTitle: {
    fontSize: "clamp(16px, 5vw, 20px)",
    fontWeight: 700,
    color: COLORS.textPrimary,
    margin: 0,
    lineHeight: 1.5,
  },
  // activeWrap/votedWrap הם אלמנט השורש שעליו נחשף --vote-scale (ראו
  // useFitScale למעלה) — ברירת המחדל היא תמיד 1 (גדלים "נוחים" רגילים,
  // בלי שום קנה-מידה מוקטן מראש); רק אם המדידה בפועל מגלה שהתוכן לא
  // נכנס בגובה הזמין, הערך יורד וכל calc() התלוי בו מתכווץ יחד איתו.
  activeWrap: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    display: "flex",
    flexDirection: "column",
    padding: "0 0 calc(0.5rem * var(--vote-scale, 1))",
    boxSizing: "border-box",
  },
  header: {
    textAlign: "center",
    marginBottom: "calc(0.625rem * var(--vote-scale, 1))",
    flexShrink: 0,
  },
  questionNumber: {
    fontSize: "calc(clamp(0.95rem, 4vw, 1.15rem) * var(--vote-scale, 1))",
    fontWeight: 700,
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
  // justifyContent: flex-start -> הכרטיסים מתחילים מלמעלה ותופסים כל
  // אחד את הגובה הטבעי שהתוכן שלו דורש; אם התוכן ארוך מדי (למשל שאלה
  // עם טקסט ארוך על מסך קטן), useFitScale עדיין מכווץ קנה-מידה אחיד
  // (--vote-scale) כדי לצמצם למינימום את הסיכוי לגלילה, ואם זה עדיין
  // לא מספיק — animWrap (ראו למעלה) גולל פנימית במקום לחתוך תוכן.
  // gap: 0.5rem (יחסי, לא px קבוע) -> מרווח מצומצם בין כרטיסי תשובה.
  optionsWrap: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "calc(0.5rem * var(--vote-scale, 1))",
    justifyContent: "flex-start",
  },
  // ללא flex-grow (אין עוד flex: "1 1 0") — כל כרטיס תשובה מקבל בדיוק
  // את הגובה הטבעי שהתוכן שלו דורש (בקנה-המידה הנוכחי), ולא נמתח כדי
  // "למלא" את השטח הפנוי, כדי שהטקסט לא ייראה מתוח/מנופח. padding:
  // 0.75rem אחיד (יחסי) בכל הכיוונים, כדי לצמצם את הגובה הכולל של כל
  // כרטיס ולתת יותר סיכוי ל-4 האפשרויות להיכנס במסך בלי גלילה.
  optionButton: {
    display: "flex",
    alignItems: "center",
    gap: "calc(0.625rem * var(--vote-scale, 1))",
    width: "100%",
    flexShrink: 0,
    padding: "calc(0.75rem * var(--vote-scale, 1))",
    backgroundColor: "#141510",
    border: "2px solid #2a2c22",
    borderRadius: 16,
    color: COLORS.textPrimary,
    fontSize: "calc(clamp(0.85rem, 3.4vw, 1rem) * var(--vote-scale, 1))",
    fontWeight: 500,
    lineHeight: 1.35,
    textAlign: "right",
    cursor: "pointer",
    boxSizing: "border-box",
    WebkitTapHighlightColor: "transparent",
    transition:
      "background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease",
  },
  optionBadge: {
    flexShrink: 0,
    width: "calc(clamp(1.5rem, 7vw, 1.75rem) * var(--vote-scale, 1))",
    height: "calc(clamp(1.5rem, 7vw, 1.75rem) * var(--vote-scale, 1))",
    borderRadius: "50%",
    backgroundColor: "#2a2c22",
    color: COLORS.textSecondary,
    fontSize: "calc(clamp(0.7rem, 3.2vw, 0.85rem) * var(--vote-scale, 1))",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  optionBadgeSelected: {
    backgroundColor: COLORS.accent,
    color: COLORS.bg,
  },
  optionBadgeCorrect: {
    backgroundColor: COLORS.success,
    color: COLORS.bg,
  },
  optionBadgeWrong: {
    backgroundColor: COLORS.wrong,
    color: COLORS.textPrimary,
  },
  optionText: {
    flex: 1,
  },
  votedWrap: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    padding: "0 0 calc(0.5rem * var(--vote-scale, 1))",
    boxSizing: "border-box",
    alignItems: "center",
    width: "100%",
  },
  votedHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: "calc(0.625rem * var(--vote-scale, 1))",
    flexShrink: 0,
  },
  votedTitle: {
    fontSize: "calc(clamp(0.8rem, 3.6vw, 1rem) * var(--vote-scale, 1))",
    fontWeight: 700,
    color: COLORS.textPrimary,
    margin: 0,
  },
  votedSubtitle: {
    fontSize: "calc(clamp(0.7rem, 3.2vw, 0.85rem) * var(--vote-scale, 1))",
    fontWeight: 400,
    color: COLORS.textSecondary,
    margin: 0,
    marginTop: "calc(0.75rem * var(--vote-scale, 1))",
    textAlign: "center",
    flexShrink: 0,
  },
  lockedOptionRow: {
    cursor: "default",
    opacity: 0.45,
    position: "relative",
  },
  lockedOptionRowSelected: {
    opacity: 1,
    backgroundColor: "rgba(212, 176, 85, 0.12)",
    borderColor: COLORS.accent,
    boxShadow: "0 0 20px rgba(212, 176, 85, 0.2)",
    paddingLeft: 44,
  },
  lockedOptionTextSelected: {
    fontWeight: 700,
    color: COLORS.textPrimary,
  },
  lockedCheckIcon: {
    position: "absolute",
    left: 14,
    top: "50%",
    transform: "translateY(-50%)",
    flexShrink: 0,
  },
  revealCorrectRow: {
    cursor: "default",
    opacity: 1,
    position: "relative",
    backgroundColor: "rgba(63, 174, 111, 0.14)",
    borderColor: COLORS.success,
    boxShadow: "0 0 20px rgba(63, 174, 111, 0.22)",
    paddingLeft: 44,
  },
  revealWrongRow: {
    cursor: "default",
    opacity: 1,
    position: "relative",
    backgroundColor: "rgba(217, 55, 68, 0.14)",
    borderColor: COLORS.wrong,
    boxShadow: "0 0 20px rgba(217, 55, 68, 0.22)",
    paddingLeft: 44,
  },
  devBar: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    borderTop: "1px solid rgba(255, 255, 255, 0.12)",
    zIndex: 9999,
    fontFamily: "monospace",
    boxSizing: "border-box",
    overflowX: "auto",
  },
  devLabel: {
    fontSize: 10,
    color: "#888",
    flexShrink: 0,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  devGroup: {
    display: "flex",
    gap: 4,
    flexShrink: 0,
  },
  devDivider: {
    width: 1,
    height: 18,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    flexShrink: 0,
  },
  devBtn: {
    fontSize: 10,
    padding: "5px 8px",
    borderRadius: 6,
    border: "1px solid rgba(255, 255, 255, 0.15)",
    backgroundColor: "transparent",
    color: "#aaa",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  devQBtn: {
    fontSize: 10,
    width: 22,
    height: 22,
    borderRadius: 6,
    border: "1px solid rgba(255, 255, 255, 0.15)",
    backgroundColor: "transparent",
    color: "#aaa",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  devBtnActive: {
    backgroundColor: "#d4b055",
    borderColor: "#d4b055",
    color: "#070804",
    fontWeight: 700,
  },
  // --- מודל onboarding חובה ---
  // z-index גבוה משמעותית מ-devBar (9999), כדי שהמודל תמיד יהיה מעל
  // הכל, כולל סרגל הבדיקה. position: fixed + inset: 0 מכסה את כל
  // המסך בלי תלות בגלילה/גובה תוכן.
  onboardingOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 20000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(7, 8, 4, 0.94)",
    boxSizing: "border-box",
  },
  onboardingCard: {
    width: "100%",
    maxWidth: 360,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    backgroundColor: "#141510",
    border: "2px solid #2a2c22",
    borderRadius: 18,
    padding: "30px 22px",
    boxSizing: "border-box",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
  },
  onboardingTitle: {
    margin: "0 0 4px",
    fontSize: 21,
    fontWeight: 700,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  onboardingField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  onboardingLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: COLORS.textSecondary,
  },
  // fontSize: 16 (לא פחות) על ה-input -> מונע זום אוטומטי ב-iOS Safari
  // בפוקוס על שדה טקסט (התנהגות ידועה: iOS מגדיל זום אם font-size של
  // input קטן מ-16px).
  onboardingInput: {
    width: "100%",
    padding: "13px 14px",
    fontSize: 16,
    fontFamily: "inherit",
    color: COLORS.textPrimary,
    backgroundColor: "#0d0f09",
    border: "2px solid #2a2c22",
    borderRadius: 10,
    boxSizing: "border-box",
    textAlign: "right",
  },
  onboardingSubmit: {
    marginTop: 4,
    padding: "14px 16px",
    fontSize: 16,
    fontWeight: 700,
    color: COLORS.bg,
    backgroundColor: COLORS.accent,
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  },
  onboardingSubmitDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
};
