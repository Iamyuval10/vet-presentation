import React, { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { subscribeToPath, incrementVote } from "./firebaseRest";

/**
 * Vote.jsx
 * רכיב מובייל לשימוש הקהל בזמן מצגת בלייב.
 * מנהל 3 מצבים: waiting / active / voted
 * קובץ יחיד — כולל בתוכו גם את סרגל הבדיקה (DevControls) כקומפוננטה
 * פנימית. החיבור ל-Firebase נעשה דרך REST API בלבד (fetch) — בלי שום
 * import של חבילת firebase (npm), כדי שהקוד ירוץ בכל סביבה בלי תלויות
 * שעלולות לא להיטען (למשל בתצוגה מקדימה של ארטיפקט).
 *
 * חיבור ל-Firebase (devMode=false):
 *  - עושה polling (fetch כל 1.5 שניות) על נתיב currentSession כדי לדעת
 *    איזו שאלה פעילה עכשיו, ועובר אליה אוטומטית ברגע שהמרצה מעביר
 *    שקופית במצגת הראשית.
 *  - בלחיצה על תשובה, כותב הצבעה לנתיב votes/{questionId}/{option}
 *    (GET ואז PATCH דרך fetch רגיל — ראו incrementVote בקובץ
 *    firebaseRest.js), ושומר flag מקומי (votedQuestionId) כדי שהמכשיר
 *    הזה לא יוכל להצביע פעמיים לאותה שאלה, ויעבור מיד למסך "הצבעתך
 *    נקלטה" — גם אם המרצה עדיין לא עבר למסך התוצאה.
 *  - דורש קובץ firebaseRest.js (ראו ./firebaseRest) עם אותה כתובת
 *    Database URL כמו שמוגדרת ברכיב המצגת הראשית, כדי ששני הצדדים
 *    יתחברו לאותו מסד נתונים.
 *
 * Props:
 *  - status: 'waiting' | 'active' | 'voted' — משמש רק אם devMode=true
 *    (בפרודקשן הסטטוס מגיע מ-Firebase דרך currentSession)
 *  - activeQuestionId: number (1-4) — משמש רק אם devMode=true
 *  - onVote: (optionKey: 'a'|'b'|'c'|'d') => void — נקרא בנוסף לכתיבה
 *    ל-Firebase, כ-hook אופציונלי לצרכי בדיקה/אנליטיקס בצד הקורא
 *  - selectedAnswer: 'a'|'b'|'c'|'d' | null — התשובה שנבחרה (לשימוש במצב 'voted')
 *  - devMode: boolean — מציג סרגל בדיקה בתחתית המסך שמאפשר מעבר ידני בין
 *    מצבים ושאלות, בלי תלות ב-Firebase. ברירת מחדל: true. הפוך ל-false
 *    כדי להתחבר בפועל ל-Firebase (או מחק את בלוק ה-DevControls בתחתית הקובץ).
 */

// מאגר אפשרויות התשובה לכל שאלה (רק המלל שמוצג בטלפון)
const QUESTION_OPTIONS = {
  1: {
    number: 1,
    options: {
      a: "המשך ניטור אינטנסיבי מחשש להופעת סיבוכים מאוחרים (כגון הפרעות קצב).",
      b: "שקילת הערת הכלב ושחרורו למעקב בלבד מאחר והצינור עבר והוא התייצב.",
      c: "התייחסות למקרה כמצב חירום קליני הדורש המשך טיפול אינטנסיבי.",
      d: "התחשבות ברמת הסטרס והלחץ של הכלב כחלק מניהול הטיפול.",
    },
  },
  2: {
    number: 2,
    options: {
      a: 'נסיונות הקאה לא אפקטיביים ("על ריק").',
      b: "ריור מוגבר וקושי בבליעה.",
      c: "דופק מהיר וחלש וריריות בצבע אדום בוהק.",
      d: "נפיחות בטנית, כאב ואי-שקט.",
    },
  },
  3: {
    number: 3,
    options: {
      a: "דיקור קיר הגוף להוצאת אוויר (דקומפרסיה).",
      b: "הכנסת צינור קיבה ושטיפתה.",
      c: "פתיחת וריד ברגל אחורית ומתן נוזלים בקצב מהיר.",
      d: "ניתוח גסטרופקסיה לתפירת הקיבה לקיר הגוף.",
    },
  },
  4: {
    number: 4,
    options: {
      a: "הסיכון מושפע אך ורק ממבנה גוף אנטומי בעל חזה עמוק.",
      b: "הסיכון מושפע משילוב של אנטומיה (חזה עמוק), תזונה (ארוחות גדולות) וגורמים התנהגותיים/סטרס.",
      c: "הסיכון מוגבר אך ורק בשל גורמים תזונתיים של האכלה בארוחה אחת גדולה ביום.",
      d: "הסיכון תלוי אך ורק במצבו הנפשי של הכלב ובפרופיל החרדתי שלו.",
    },
  },
};

const COLORS = {
  bg: "#070804",
  textPrimary: "#fbfaf4",
  textSecondary: "#c3c6b4",
  accent: "#d4b055",
};

const PHONE_OPTION_KEYS = ["a", "b", "c", "d"];
const OPTION_LABELS = { a: "א", b: "ב", c: "ג", d: "ד" };

export default function Vote({
  status = "waiting",
  activeQuestionId = null,
  onVote = () => {},
  selectedAnswer = null,
  devMode = true,
}) {
  const [localSelected, setLocalSelected] = useState(selectedAnswer);

  // מצב פנימי לשימוש סרגל הבדיקה בלבד: כשה-devMode פעיל, הסרגל
  // "עוקף" את הפרופים שמגיעים מבחוץ כדי לאפשר מעבר ידני חופשי בין
  // מצבים ושאלות, בלי תלות בשרת. במצב ייצור (devMode=false) הרכיב
  // מתחבר ישירות ל-Firebase ומאזין לנתיב currentSession בזמן אמת.
  const [devStatus, setDevStatus] = useState(status);
  const [devQuestionId, setDevQuestionId] = useState(activeQuestionId || 1);

  // --- מצב ייצור: פולינג על currentSession ב-Firebase (REST, fetch כל 1.5 שנ') ---
  // כשהמרצה מעביר שקופית לשאלה חדשה במצגת הראשית, הערך הזה מתעדכן
  // אוטומטית וכל הטלפונים המחוברים "קופצים" לשאלה החדשה בעצמם.
  const [liveSession, setLiveSession] = useState({ status: "waiting", activeQuestionId: null });

  useEffect(() => {
    if (devMode) return;
    const unsubscribe = subscribeToPath("currentSession", (val) => {
      const v = val || {};
      setLiveSession({
        status: v.status || "waiting",
        activeQuestionId: v.activeQuestionId || null,
      });
    });
    return () => unsubscribe();
  }, [devMode]);

  // --- מניעת הצבעה כפולה ---
  // flag מקומי (למכשיר הזה בלבד): לאיזו שאלה כבר הצבענו. ברגע שהצבעתי
  // לשאלה X, המסך שלי עובר ל"הצבעתך נקלטה" מיד — גם אם שאר הקהל עדיין
  // מצביע ומסך המצגת הראשית עדיין לא עבר למסך התוצאה. כשמתחילה שאלה
  // חדשה (activeQuestionId משתנה), הפלג הזה כבר לא תואם ואפשר להצביע שוב.
  const [votedQuestionId, setVotedQuestionId] = useState(null);

  const liveHasVotedCurrent =
    liveSession.activeQuestionId != null && votedQuestionId === liveSession.activeQuestionId;
  const effectiveStatus = devMode
    ? devStatus
    : liveHasVotedCurrent
    ? "voted"
    : liveSession.status;
  const effectiveQuestionId = devMode ? devQuestionId : liveSession.activeQuestionId;

  useEffect(() => {
    setLocalSelected(selectedAnswer);
  }, [selectedAnswer]);

  // באיפוס שאלה/מצב מהסרגל, ננקה בחירה קודמת כדי שלא "תידלף" בין שאלות
  useEffect(() => {
    if (devMode) setLocalSelected(null);
  }, [devStatus, devQuestionId, devMode]);

  // כשמתחילה שאלה חדשה בזמן אמת (activeQuestionId משתנה), מנקים את
  // הבחירה המקומית שהוצגה כמסומנת, כדי שהמסך יתחיל נקי עבור השאלה הבאה
  useEffect(() => {
    if (!devMode) setLocalSelected(null);
  }, [liveSession.activeQuestionId, devMode]);

  const question = effectiveQuestionId
    ? QUESTION_OPTIONS[effectiveQuestionId]
    : null;

  const handleSelect = (key) => {
    if (effectiveStatus !== "active") return;
    setLocalSelected(key);
    onVote(key);

    if (devMode) {
      setDevStatus("voted");
      return;
    }

    // שליחת הצבעה: incrementVote עושה GET ואז PATCH דרך fetch רגיל
    // (ראו הערה על מגבלות ה-REST API הפשוט בקובץ firebaseRest.js).
    incrementVote(effectiveQuestionId, key).catch((err) =>
      console.warn("vote failed:", err)
    );
    setVotedQuestionId(effectiveQuestionId);
  };

  return (
    <div style={styles.screen} dir="rtl">
      {effectiveStatus === "waiting" && <WaitingState />}
      {effectiveStatus === "active" && question && (
        <ActiveState
          question={question}
          selected={localSelected}
          onSelect={handleSelect}
        />
      )}
      {effectiveStatus === "voted" && question && (
        <VotedState question={question} selected={localSelected} />
      )}

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

function WaitingState() {
  return (
    <div style={styles.centerWrap}>
      <div style={styles.pulseDot} />
      <p style={styles.waitingTitle}>השיעור בעיצומו...</p>
      <p style={styles.waitingSubtitle}>המתן לשאלה הבאה</p>
    </div>
  );
}

function ActiveState({ question, selected, onSelect }) {
  return (
    <div style={styles.activeWrap}>
      <div style={styles.header}>
        <span style={styles.questionNumber}>שאלה {question.number}</span>
      </div>

      <div style={styles.optionsWrap}>
        {PHONE_OPTION_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            style={{
              ...styles.optionButton,
              ...(selected === key ? styles.optionButtonSelected : {}),
            }}
          >
            <span
              style={{
                ...styles.optionBadge,
                ...(selected === key ? styles.optionBadgeSelected : {}),
              }}
            >
              {OPTION_LABELS[key]}
            </span>
            <span style={styles.optionText}>{question.options[key]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function VotedState({ question, selected }) {
  return (
    <div style={styles.votedWrap}>
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

      <p style={styles.votedSubtitle}>הסתכל על הלוח לתוצאות</p>
    </div>
  );
}

/**
 * DevControls
 * סרגל בדיקה דיסקרטי לתחתית המסך — מאפשר מעבר ידני בין מצבי ה-UI
 * (waiting / active / voted) ובין שאלות 1-4, לפני חיבור לשרת.
 * ממוזג לתוך אותו קובץ לפי בקשה, אך נשאר קומפוננטה עצמאית ומבודדת —
 * כדי להסיר אותה בהמשך מספיק למחוק את הפונקציה הזו ואת התג
 * <DevControls /> בתוך VoteScreen, בלי לגעת בשאר הלוגיקה.
 */
function DevControls({ status, onStatusChange, questionId, onQuestionChange }) {
  const STATUSES = ["waiting", "active", "voted"];
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
  optionButtonSelected: {
    backgroundColor: "rgba(212, 176, 85, 0.12)",
    borderColor: COLORS.accent,
    transform: "scale(0.99)",
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
