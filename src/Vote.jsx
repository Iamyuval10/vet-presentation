import React, { useState, useEffect } from "react";
import { Check, X } from "lucide-react";
import { subscribeToPath, incrementVote } from "./firebaseRest";

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
// QUIZ_ID_TO_NUMBER ב-firebaseRest.js).
const QUESTION_OPTIONS = {
  1: {
    number: 1,
    correct: "b",
    options: {
      a: "הסיכון מושפע אך ורק ממבנה גוף אנטומי בעל חזה עמוק.",
      b: "הסיכון מושפע משילוב של אנטומיה (חזה עמוק), תזונה (ארוחות גדולות) וגורמים התנהגותיים/סטרס.",
      c: "הסיכון מוגבר אך ורק בשל גורמים תזונתיים של האכלה בארוחה אחת גדולה ביום.",
      d: "הסיכון תלוי אך ורק במצבו הנפשי של הכלב ובפרופיל החרדתי שלו.",
    },
  },
  2: {
    number: 2,
    correct: "c",
    options: {
      a: 'נסיונות הקאה לא אפקטיביים ("על ריק").',
      b: "ריור מוגבר וקושי בבליעה.",
      c: "דופק מהיר וחלש וריריות בצבע אדום בוהק.",
      d: "נפיחות בטנית, כאב ואי-שקט.",
    },
  },
  3: {
    number: 3,
    correct: "c",
    options: {
      a: "דיקור קיר הגוף להוצאת אוויר (דקומפרסיה).",
      b: "הכנסת צינור קיבה ושטיפתה.",
      c: "פתיחת וריד ברגל אחורית ומתן נוזלים בקצב מהיר.",
      d: "ניתוח גסטרופקסיה לתפירת הקיבה לקיר הגוף.",
    },
  },
  4: {
    number: 4,
    correct: "b",
    options: {
      a: "המשך ניטור אינטנסיבי מחשש להופעת סיבוכים מאוחרים (כגון הפרעות קצב).",
      b: "שקילת הערת הכלב ושחרורו למעקב בלבד מאחר והצינור עבר והוא התייצב.",
      c: "התייחסות למקרה כמצב חירום קליני הדורש המשך טיפול אינטנסיבי.",
      d: "התחשבות ברמת הסטרס והלחץ של הכלב כחלק מניהול הטיפול.",
    },
  },
};

const COLORS = {
  bg: "#070804",
  textPrimary: "#fbfaf4",
  textSecondary: "#c3c6b4",
  accent: "#d4b055",
  success: "#3fae6f",
  wrong: "#d93744",
};

const PHONE_OPTION_KEYS = ["a", "b", "c", "d"];
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

export default function Vote({ devMode = true }) {
  // מזהה המכשיר הזה — קבוע לצמיתות, לא תלוי ב-session (נוצר פעם אחת
  // ולעולם לא מתאפס). נשמר כרגע רק ב-localStorage; לא נדרש להצבעה
  // עצמה (שהיא מונה פשוט ב-Firebase), אך מבטיח לכל טלפון זהות יציבה
  // לאורך כל השימושים באפליקציה.
  const [voterId] = useState(getOrCreateVoterId);

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
  // האם המכשיר הזה כבר ענה על שאלה כלשהי ב-session הנוכחי — נבדק מול
  // sessionRecord (מגובה ב-localStorage), ומשמש לבחירת הניסוח המתאים
  // במסך ההמתנה: "מתחילים" לפני השאלה הראשונה, "ממשיכים" אחריה.
  const hasAnsweredAnyQuestion = Object.keys(sessionRecord.answers).length > 0;

  const handleSelect = (key) => {
    if (status !== "active" || hasAnswered || !questionId) return;

    setSessionRecord((prev) => {
      const next = { ...prev, answers: { ...prev.answers, [questionId]: key } };
      saveStoredSession(next);
      return next;
    });

    if (devMode) return;

    // שליחת הצבעה: incrementVote עושה GET ואז PATCH דרך fetch רגיל
    // (ראו הערה על מגבלות ה-REST API הפשוט בקובץ firebaseRest.js).
    incrementVote(questionId, key).catch((err) =>
      console.warn("vote failed:", err)
    );
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

  return (
    <div style={styles.screen} dir="rtl">
      <style>{`
        @keyframes gdvVoteFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .gdv-vote-anim { animation: gdvVoteFadeIn 0.35s ease; }
        @media (prefers-reduced-motion: reduce) {
          .gdv-vote-anim { animation: none; }
        }
      `}</style>

      <div className="gdv-vote-anim" key={screenKey} style={styles.animWrap}>
        {screen === "waiting" && <WaitingState hasAnsweredAnyQuestion={hasAnsweredAnyQuestion} />}
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
        <DevControls
          status={devStatus}
          onStatusChange={setDevStatus}
          questionId={devQuestionId}
          onQuestionChange={setDevQuestionId}
        />
      )}
    </div>
  );
}

/**
 * מסך המתנה כללי, המוצג בכל שקופית שאינה שאלה. הניסוח משתנה לפי
 * העבר של המשתתף ב-session הנוכחי: לפני שענה על אף שאלה — "מתחילים";
 * אחרי שכבר ענה על שאלה אחת לפחות — "ממשיכים".
 */
function WaitingState({ hasAnsweredAnyQuestion }) {
  return (
    <div style={styles.centerWrap}>
      <div style={styles.pulseDot} />
      <p style={styles.waitingTitle}>השיעור בעיצומו...</p>
      <p style={styles.waitingSubtitle}>
        {hasAnsweredAnyQuestion ? "תיכף ממשיכים בשאלות!" : "תיכף מתחילים בשאלות!"}
      </p>
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
  return (
    <div style={styles.activeWrap}>
      <QuestionHeader number={question.number} />

      <div style={styles.optionsWrap}>
        {PHONE_OPTION_KEYS.map((key) => (
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
  return (
    <div style={styles.votedWrap}>
      <QuestionHeader number={question.number} />

      <div style={styles.votedHeader}>
        <Check size={18} strokeWidth={3} color={COLORS.accent} />
        <p style={styles.votedTitle}>תשובתך נקלטה!</p>
      </div>

      <div style={styles.optionsWrap}>
        {PHONE_OPTION_KEYS.map((key) => {
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

  return (
    <div style={styles.votedWrap}>
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
        {PHONE_OPTION_KEYS.map((key) => {
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
  screen: {
    minHeight: "100vh",
    width: "100%",
    backgroundColor: COLORS.bg,
    color: COLORS.textPrimary,
    fontFamily:
      "'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    paddingBottom: 44,
    position: "relative",
  },
  animWrap: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },
  centerWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 24px",
    textAlign: "center",
  },
  pulseDot: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    backgroundColor: COLORS.accent,
    marginBottom: 28,
    boxShadow: `0 0 0 8px rgba(212, 176, 85, 0.15)`,
  },
  waitingTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: COLORS.textPrimary,
    margin: 0,
    marginBottom: 10,
  },
  waitingSubtitle: {
    fontSize: 16,
    fontWeight: 400,
    color: COLORS.textSecondary,
    margin: 0,
  },
  activeWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: "28px 16px 24px",
    boxSizing: "border-box",
  },
  header: {
    textAlign: "center",
    marginBottom: 24,
    flexShrink: 0,
  },
  questionNumber: {
    fontSize: 20,
    fontWeight: 700,
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
  optionsWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    justifyContent: "center",
  },
  optionButton: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    minHeight: 76,
    padding: "16px 18px",
    backgroundColor: "#141510",
    border: "2px solid #2a2c22",
    borderRadius: 16,
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: 500,
    lineHeight: 1.4,
    textAlign: "right",
    cursor: "pointer",
    boxSizing: "border-box",
    WebkitTapHighlightColor: "transparent",
    transition:
      "background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease",
  },
  optionBadge: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: "50%",
    backgroundColor: "#2a2c22",
    color: COLORS.textSecondary,
    fontSize: 15,
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
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: "28px 16px 24px",
    boxSizing: "border-box",
    alignItems: "center",
  },
  votedHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 22,
    flexShrink: 0,
  },
  votedTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: COLORS.textPrimary,
    margin: 0,
  },
  votedSubtitle: {
    fontSize: 15,
    fontWeight: 400,
    color: COLORS.textSecondary,
    margin: 0,
    marginTop: 22,
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
};
