import React, { useState, useEffect, useCallback, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  subscribeToPath,
  putPath,
  QUIZ_ID_TO_NUMBER,
  NUMBER_TO_QUIZ_ID,
} from "./firebaseRest";

/**
 * GDV — היפוך קיבה | קורס מדריכים
 * יחידת עוקץ | חטיבת מרום
 *
 * רכיב מצגת React עצמאי — Dark Mode טקטי.
 *
 * ניווט:
 *  - לחיצת עכבר בצד שמאל של המסך  -> שקופית הבאה
 *  - לחיצת עכבר בצד ימין של המסך  -> שקופית קודמת
 *  - מקלדת: רווח / כל אחד מהחיצים -> תמיד קדימה
 *
 * תמונות:
 *  כל תמונה מוגדרת כ-<img src="/GDV-images/slideN.png" />.
 *  יש להניח את קבצי התמונה המקוריים בתיקיית ה-public/GDV-images של הפרויקט,
 *  בשמות התואמים למפורט בהערה שליד כל שקף במערך SLIDES למטה.
 */

// ---------------------------------------------------------------------------
// תוכן המצגת — מחולץ במלואו ולפי הסדר מתוך קובץ ה-PowerPoint המקורי
// ---------------------------------------------------------------------------

// שקפים שבהם התמונה/הגלריה תופסת את מלוא שטח המסך (ללא שוליים מיותרים)
const FLUSH_TYPES = new Set(["image", "caption-image", "gallery"]);
// תת-קבוצה של שקפי "מסך-מלא" שהם צילום בודד הממלא את כל השטח — אלה
// צריכים שוליים נוספים בפינה השמאלית-תחתונה כדי לא להתנגש עם הברקוד.
// שקף הגלריה (gallery) כבר בנוי כקומפוזיציה ממורכזת עם מרווח משלו,
// ולכן לא מקבל את השוליים הנוספים (וגם לא צריך אותם).
const PHOTO_FLUSH_TYPES = new Set(["image", "caption-image"]);

const SLIDES = [
  {
    type: "cover",
    eyebrow: `קורס מדריכים`,
    megaTitle: `GDV`,
    subtitle: `היפוך קיבה`,
  },
  {
    type: "list",
    size: "xl",
    eyebrow: `נתוני יחידה`,
    title: `תיאור מקרים`,
    bullets: [`3 מקרים בממוצע בשנה.`, `אחוזי תמותה ביחידה: 10%`],
    tags: [`ג'ולי`, `סו`, `בקס`, `סטורם`, `דקסטר`, `בורה`, `הילי`, `ג'ו`],
    tagsLabel: `כלבי היחידה שסבלו מהתופעה`,
  },
  {
    type: "list",
    size: "xl",
    eyebrow: `רקע רפואי`,
    title: `מבוא`,
    bullets: [
      `שילוב של התנפחות וסיבוב סביב ציר של הקיבה.`,
      `מדובר בבעיה רב-גורמית, כשלמבנה גופו של הכלב ולתנאים הסביבתיים השפעה חזקה.`,
      `כלב עם GDV יסבול מירידת לחץ דם, הלם, סכנה להנמקות חלק מהקיבה ו/או הטחול, התמוטטות מע' קרישת הדם, זיהום מפושט ומוות.`,
      `היווה בעבר סיבה לתמותת מעל 10% מכלבי השירות בצבא האמריקאי. אצלנו ביחידה בסה"כ מדובר בשכיחות נמוכה: 0.5-1.0% בשנה.`,
      `30% בממוצע (25-50%) מהכלבים שסובלים מ-GDV ימותו (לפני הניתוח/במהלכו או מהסיבוכים שלאחריו).`,
      `הצלחה בטיפול מחייבת התערבות רפואית וכירורגית מהירה, ולאחריה טיפול-נמרץ יעיל.`,
    ],
  },
  {
    // slide_4.png — כלב עם התנפחות בטן, מבט מלמעלה, עם סימוני מיקום
    type: "image",
    eyebrow: `תיעוד חזותי`,
    title: null,
    image: { src: "/GDV-images/slide_4.png", alt: `כלב עם התנפחות בטן — מבט מלמעלה, עם סימוני מיקום ההתנפחות` },
  },
  {
    // slide_5.png — אותו כלב, מבט מהצד
    type: "image",
    eyebrow: `תיעוד חזותי`,
    title: null,
    image: { src: "/GDV-images/slide_5.png", alt: `כלב עם התנפחות בטן — מבט מהצד, עם סימון מיקום ההתנפחות` },
  },
  {
    // slide_6.png — איור אנטומי יחיד (קיבה, סרעפת, ושט, תריסריון)
    type: "image",
    eyebrow: `תיעוד חזותי`,
    title: null,
    image: { src: "/GDV-images/slide_6.png", alt: `איור אנטומי — מיקום הקיבה, הסרעפת, הוושט והתריסריון בכלב` },
  },
  {
    // slide_7.mp4 — סרטון הדמיה תלת-ממדית, מוטמע וניתן להפעלה
    type: "video",
    eyebrow: `תיעוד חזותי`,
    title: null,
    video: { src: "/GDV-images/slide_7.mp4" },
  },
  {
    type: "list",
    eyebrow: `גורמי סיכון`,
    title: `גורמי סיכון (עפ"י מחקר מאוניברסיטת Purdue המבוסס על 1,900 כלבים)`,
    bullets: [
      `גזעים גדולים וענקיים.`,
      `הגזע בעל הסיכון הגבוה ביותר לפתח GDV במהלך חייו הוא ה"דני הענק" — 42%.`,
      `נפוץ יותר בכלבים מבוגרים.`,
      `כלבים רזים בסיכון רב יותר משמנים.`,
    ],
  },
  {
    type: "list",
    eyebrow: `גורמי סיכון`,
    title: `גורמי סיכון — המשך`,
    bullets: [
      `קשר גנטי.`,
      `האכלה אחת ביום בלבד מעלה את הסיכון.`,
      `לכלב בעל אופי עצבני, אגרסיבי או פחדן — נטייה גבוהה יותר.`,
      `לחץ ("סטרס").`,
      `אכילה מהירה מדי (בליעת אוויר).`,
    ],
  },
  {
    type: "list",
    eyebrow: `גורמי סיכון`,
    title: `גורמים נוספים`,
    bullets: [
      `האכלה רק על מזון יבש לעומת מזון יבש + רטוב?`,
      `מזון יבש שהורטב — מעלה את הסיכון.`,
      `הקשר בין האכלה לפני פעילות או אחרי פעילות לא ברור, שכן הרבה מאוד מהמקרים קורים באמצע הלילה.`,
      `הקשר בין התנפחות קיבה וסיבובה/היפוכה לאחר מכן לא ברור.`,
      `בליעת אוויר ו/או הצטברות גזים בקיבה מהווים גורם סיכון חשוב ביותר.`,
      `השפעות הורמונים שונים על תנועתיות, כיווץ והתרוקנות הקיבה.`,
      `הפרעות במנגנון השיהוק. כמו כן נמצא קשר לשינה ולהרדמה.`,
    ],
  },
  {
    type: "quiz-vote",
    quizId: `riskFactors`,
    scenario: `בשיחה על רפואה מונעת במרפאה, עולה השאלה אילו גורמים תורמים להתפתחות תסמונת היפוך קיבה. איזה מבין המשפטים הבאים מתאר בצורה המקיפה והנכונה ביותר את גורמי הסיכון שהוכחו במחקרים?`,
    options: [
      { id: "a", text: `הסיכון מושפע אך ורק ממבנה גוף אנטומי בעל חזה עמוק.`, correct: false },
      { id: "b", text: `הסיכון מושפע משילוב של אנטומיה (חזה עמוק), תזונה (ארוחות גדולות) וגורמים התנהגותיים/סטרס.`, correct: true },
      { id: "c", text: `הסיכון מוגבר אך ורק בשל גורמים תזונתיים של האכלה בארוחה אחת גדולה ביום.`, correct: false },
      { id: "d", text: `הסיכון תלוי אך ורק במצבו הנפשי של הכלב ובפרופיל החרדתי שלו.`, correct: false },
    ],
  },
  {
    type: "quiz-result",
    quizId: `riskFactors`,
    scenario: `בשיחה על רפואה מונעת במרפאה, עולה השאלה אילו גורמים תורמים להתפתחות תסמונת היפוך קיבה. איזה מבין המשפטים הבאים מתאר בצורה המקיפה והנכונה ביותר את גורמי הסיכון שהוכחו במחקרים?`,
    options: [
      { id: "a", text: `הסיכון מושפע אך ורק ממבנה גוף אנטומי בעל חזה עמוק.`, correct: false },
      { id: "b", text: `הסיכון מושפע משילוב של אנטומיה (חזה עמוק), תזונה (ארוחות גדולות) וגורמים התנהגותיים/סטרס.`, correct: true },
      { id: "c", text: `הסיכון מוגבר אך ורק בשל גורמים תזונתיים של האכלה בארוחה אחת גדולה ביום.`, correct: false },
      { id: "d", text: `הסיכון תלוי אך ורק במצבו הנפשי של הכלב ובפרופיל החרדתי שלו.`, correct: false },
    ],
    feedbackCorrect: `מדויק! היפוך קיבה הוא תסמונת מולטי-פקטוריאלית המושפעת משילוב של אנטומיה, תזונה וגורמים התנהגותיים.`,
    feedbackWrongPart1: `התשובות האחרות מצמצמות את הסיכון לגורם יחיד בלבד, בעוד שבפועל מדובר בשילוב גורמים.`,
    feedbackWrongPart2: `התשובה הנכונה היא ב' — המחקרים מראים בבירור שרק שילוב של כלל הגורמים (אנטומיה, תזונה וסטרס) מעלה את הסיכון באופן משמעותי.`,
  },
  {
    // slide_11.png — כלב עומד על רגליים אחוריות (תסמין), + לינק לסרטון הדגמה
    type: "list",
    eyebrow: `אבחון קליני`,
    title: `סימנים קליניים`,
    bullets: [
      `ניסיונות הקאה לא פרודוקטיביים.`,
      `חוסר מנוחה.`,
      `ריור יתר.`,
      `התנפחות הדרגתית.`,
      `סימני כאב חזקים.`,
      `טימפניות של הבטן.`,
      `ריריות חיוורות, דופק מהיר וחלש, קשיי נשימה.`,
    ],
    note: { label: `אבחון`, text: `ע"פ סיגנלמנט, סימנים קליניים וצילום רנטגן.` },
    image: { src: "/GDV-images/slide_11.png", alt: `כלב עומד על רגליים אחוריות — תסמין קליני` },
    videoLink: {
      url: `https://youtu.be/mrrB1ojgK7M?si=aGUoRz_38aypEb_J`,
      label: `צפו בסרטון הדגמה`,
    },
  },
  {
    // slide_12.png — צילום רנטגן
    type: "caption-image",
    eyebrow: `אבחון קליני`,
    title: null,
    caption: `צילום רנטגן`,
    image: { src: "/GDV-images/slide_12.png", alt: `צילום רנטגן — התנפחות והיפוך הקיבה` },
  },
  {
    type: "quiz-vote",
    quizId: `diagnosis`,
    scenario: `כלב מובא בחירום למרפאה עם חשד כבד להיפוך קיבה (GDV). הווטרינר ניגש לבצע בדיקה פיזיקלית ראשונית והערכת תסמינים. איזה מהממצאים הבאים הוא הפחות סביר לצפייה בבדיקה?`,
    options: [
      { id: "a", text: `ניסיונות הקאה לא אפקטיביים ("על ריק").`, correct: false },
      { id: "b", text: `ריור מוגבר וקושי בבליעה.`, correct: false },
      { id: "c", text: `דופק מהיר וחלש וריריות בצבע אדום בוהק.`, correct: true },
      { id: "d", text: `נפיחות בטנית, כאב ואי-שקט.`, correct: false },
    ],
  },
  {
    type: "quiz-result",
    quizId: `diagnosis`,
    scenario: `כלב מובא בחירום למרפאה עם חשד כבד להיפוך קיבה (GDV). הווטרינר ניגש לבצע בדיקה פיזיקלית ראשונית והערכת תסמינים. איזה מהממצאים הבאים הוא הפחות סביר לצפייה בבדיקה?`,
    options: [
      { id: "a", text: `ניסיונות הקאה לא אפקטיביים ("על ריק").`, correct: false },
      { id: "b", text: `ריור מוגבר וקושי בבליעה.`, correct: false },
      { id: "c", text: `דופק מהיר וחלש וריריות בצבע אדום בוהק.`, correct: true },
      { id: "d", text: `נפיחות בטנית, כאב ואי-שקט.`, correct: false },
    ],
    feedbackCorrect: `אבחנה מבוססת! ב-GDV הכלב נמצא בשוק היפווולמי, ולכן הריריות יהיו חיוורות מאוד, אפורות או ציאנוטיות, ולא אדומות בוהקות.`,
    feedbackWrongPart1: `הקאות על ריק, ריור ונפיחות הן אכן תופעות שכיחות ב-GDV, אך הן לא הממצא הפחות סביר בבדיקה.`,
    feedbackWrongPart2: `התשובה הנכונה היא ג' — במצב של GDV הכלב שרוי בשוק היפווולמי מתקדם, ומצופה לראות ריריות חיוורות או אפורות ולא אדומות בוהקות.`,
  },
  {
    // slide_13a.png, slide_13b.png, slide_13c.png — לפי סדר א-ב-ג
    type: "list-gallery",
    eyebrow: `טיפול חירום`,
    title: `טיפול`,
    bullets: [
      `עירוי נוזלים.`,
      `דקומפרסיה של הקיבה (שחרור גז עודף) — ע"י ניסיון החדרת צינור קיבה.`,
      `ניקוב דופן הקיבה — טרוכריזציה.`,
      `תיקון כירורגי.`,
    ],
    images: [
      { src: "/GDV-images/slide_13a.png", alt: `טיפול ראשוני בכלב` },
      { src: "/GDV-images/slide_13b.png", alt: `ניסיון החדרת צינור קיבה לדקומפרסיה` },
      { src: "/GDV-images/slide_13c.png", alt: `תיקון כירורגי — תפירת דופן הקיבה לדופן הבטן` },
    ],
  },
  {
    type: "quiz-vote",
    quizId: `treatment`,
    scenario: `צוות המרפאה נערך לקבלת מקרה GDV ומכין את ציוד ההחייאה והניתוח בהתאם לפרוטוקול הייצוב הסטנדרטי. איזה מהצעדים הבאים אינו חלק מהפרוטוקול הסטנדרטי הנכון?`,
    options: [
      { id: "a", text: `דיקור קיר הגוף להוצאת אוויר (דקומפרסיה).`, correct: false },
      { id: "b", text: `הכנסת צינור קיבה ושטיפתה.`, correct: false },
      { id: "c", text: `פתיחת וריד ברגל אחורית ומתן נוזלים בקצב מהיר.`, correct: true },
      { id: "d", text: `ניתוח גסטרופקסיה לתפירת הקיבה לקיר הגוף.`, correct: false },
    ],
  },
  {
    type: "quiz-result",
    quizId: `treatment`,
    scenario: `צוות המרפאה נערך לקבלת מקרה GDV ומכין את ציוד ההחייאה והניתוח בהתאם לפרוטוקול הייצוב הסטנדרטי. איזה מהצעדים הבאים אינו חלק מהפרוטוקול הסטנדרטי הנכון?`,
    options: [
      { id: "a", text: `דיקור קיר הגוף להוצאת אוויר (דקומפרסיה).`, correct: false },
      { id: "b", text: `הכנסת צינור קיבה ושטיפתה.`, correct: false },
      { id: "c", text: `פתיחת וריד ברגל אחורית ומתן נוזלים בקצב מהיר.`, correct: true },
      { id: "d", text: `ניתוח גסטרופקסיה לתפירת הקיבה לקיר הגוף.`, correct: false },
    ],
    feedbackCorrect: `מצוין! הקיבה הנפוחה חוסמת את החזר הדם מהחלק האחורי של הגוף. נוזלים ברגל אחורית לא יגיעו ללב – תמיד פותחים ורידים ברגליים קדמיות או בצוואר!`,
    feedbackWrongPart1: `דקומפרסיה, צינור קיבה וגסטרופקסיה הם אכן חלקים חיוניים ומקובלים בפרוטוקול הטיפול.`,
    feedbackWrongPart2: `התשובה הנכונה היא ג' — לחץ הקיבה הנפוחה חוסם את הווריד הנבוב התחתון, ולכן נוזלים שיינתנו ברגל אחורית לא יגיעו לזרם הדם המרכזי.`,
  },
  {
    // slide_14.png — ניסיון החדרת צינור לדקומפרסיה
    type: "image",
    eyebrow: `תיעוד חזותי`,
    title: null,
    image: { src: "/GDV-images/slide_14.png", alt: `ניסיון החדרת צינור קיבה לדקומפרסיה` },
  },
  {
    // slide_15.png — תמונה כירורגית מתויגת "קיבה"
    type: "caption-image",
    eyebrow: `תיעוד חזותי`,
    title: null,
    caption: `קיבה`,
    image: { src: "/GDV-images/slide_15.png", alt: `תמונה כירורגית — הקיבה מסומנת בניתוח` },
  },
  {
    type: "list",
    eyebrow: `סיבוכים`,
    title: `סיבוכים לאחר ניתוח`,
    intro: `נובעים בעיקר מהשוק ומשחרור הרעלנים שהצטברו ברקמת הקיבה והטחול.`,
    bullets: [
      `הפרעות בקצב הלב.`,
      `לחץ דם נמוך.`,
      `כשל כליות.`,
      `נמק בדופן הקיבה ובעקבותיו היווצרות חור ודליפה לחלל הבטן, דלקת מפושטת בחלל הבטן.`,
      `התמוטטות מע' קרישת הדם.`,
      `דלקת-ריאות שאיפתית עקב ניסיונות ההקאה לפני הניתוח.`,
    ],
  },
  {
    type: "quiz-vote",
    quizId: `dilemma`,
    scenario: `צוות המרפאה החדיר צינור קיבה לכלב המאובחן עם היפוך קיבה, ניקז את הגזים והשיג ייצוב ראשוני של המדדים. איזה מבין הצעדים הבאים מבוסס על תפיסה שגויה ומסוכנת של המצב?`,
    options: [
      { id: "a", text: `המשך ניטור אינטנסיבי מחשש להופעת סיבוכים מאוחרים (כגון הפרעות קצב).`, correct: false },
      { id: "b", text: `שקילת הערת הכלב ושחרורו למעקב בלבד מאחר והצינור עבר והוא התייצב.`, correct: true },
      { id: "c", text: `התייחסות למקרה כמצב חירום קליני הדורש המשך טיפול אינטנסיבי.`, correct: false },
      { id: "d", text: `התחשבות ברמת הסטרס והלחץ של הכלב כחלק מניהול הטיפול.`, correct: false },
    ],
  },
  {
    type: "quiz-result",
    quizId: `dilemma`,
    scenario: `צוות המרפאה החדיר צינור קיבה לכלב המאובחן עם היפוך קיבה, ניקז את הגזים והשיג ייצוב ראשוני של המדדים. איזה מבין הצעדים הבאים מבוסס על תפיסה שגויה ומסוכנת של המצב?`,
    options: [
      { id: "a", text: `המשך ניטור אינטנסיבי מחשש להופעת סיבוכים מאוחרים (כגון הפרעות קצב).`, correct: false },
      { id: "b", text: `שקילת הערת הכלב ושחרורו למעקב בלבד מאחר והצינור עבר והוא התייצב.`, correct: true },
      { id: "c", text: `התייחסות למקרה כמצב חירום קליני הדורש המשך טיפול אינטנסיבי.`, correct: false },
      { id: "d", text: `התחשבות ברמת הסטרס והלחץ של הכלב כחלק מניהול הטיפול.`, correct: false },
    ],
    feedbackCorrect: `מדויק! השקילה להעיר את הכלב ולעקוב בלבד היא תפיסה שגויה ומסוכנת. מעבר הצינור והייצוב הראשוני אינם פותרים את הבעיה המכנית, וללא התערבות כירורגית הקיבה תסתובב שוב.`,
    feedbackWrongPart1: `ניטור, התייחסות כחירום וניהול סטרס הם אכן שלבים נכונים וחשובים בטיפול.`,
    feedbackWrongPart2: `התשובה הנכונה היא ב' — מעבר הצינור והייצוב הזמני אינם מתקנים את הסיבוב האנטומי של הקיבה, ושחרור ללא ניתוח יוביל בסבירות גבוהה לחזרה מיידית של היפוך הקיבה.`,
  },
  {
    // slide_17a.png, slide_17b.png — שקף סיום הומוריסטי
    type: "gallery",
    eyebrow: `לסיום`,
    title: null,
    images: [
      { src: "/GDV-images/slide_17a.png", alt: `תמונת סיום — כלב שמן ליד כדור טניס` },
      { src: "/GDV-images/slide_17b.png", alt: `תמונת סיום הומוריסטית` },
    ],
  },
];

// ---------------------------------------------------------------------------
// רכיבי עזר
// ---------------------------------------------------------------------------

/** ארבע זוויות מסגרת "טקטיות" — האלמנט המזהה החוזר של המצגת. */
function Corners() {
  return (
    <>
      <span className="gdv-corner gdv-corner-tl" />
      <span className="gdv-corner gdv-corner-tr" />
      <span className="gdv-corner gdv-corner-bl" />
      <span className="gdv-corner gdv-corner-br" />
    </>
  );
}

function Framed({ className = "", children }) {
  return (
    <div className={`gdv-framed ${className}`}>
      <Corners />
      {children}
    </div>
  );
}

function SlideImage({ src, alt, className = "" }) {
  return (
    <Framed className={`gdv-image-frame ${className}`}>
      <img src={src} alt={alt} className="gdv-image" draggable={false} />
    </Framed>
  );
}

const FEATURED_EYEBROWS = new Set([`גורמי סיכון`, `אבחון קליני`]);

function Eyebrow({ children }) {
  if (!children) return null;
  const featured = FEATURED_EYEBROWS.has(children);
  return (
    <div className={`gdv-eyebrow ${featured ? "gdv-eyebrow-featured" : ""}`}>
      {children}
    </div>
  );
}

// כתובת מסך ההצבעה בטלפון — קבועה, מצביעה ישירות לדומיין החי בפרודקשן.
const VOTE_URL = `https://vet-presentation.vercel.app/vote`;

/**
 * ברקוד QR חי (qrcode.react) המצביע ל-VOTE_URL. label: הטקסט הנלווה
 * מתחת לברקוד.
 */
function QRCodeBox({ size = 80, label }) {
  const isLarge = size >= 200;
  return (
    <div className="gdv-qr-wrap" style={{ width: size }}>
      <div
        className={`gdv-qr-box ${isLarge ? "gdv-qr-box-lg" : ""}`}
        style={{ width: size, height: size }}
      >
        <QRCodeSVG
          value={VOTE_URL}
          size={256}
          bgColor="transparent"
          fgColor="#fbfaf4"
          level="M"
          className="gdv-qr-image"
        />
      </div>
      {label && <span className="gdv-qr-caption-below">{label}</span>}
    </div>
  );
}

const OPTION_LETTERS = { a: `א'`, b: `ב'`, c: `ג'`, d: `ד'` };

/**
 * שקופית שאלת סימולציה — הצבעה חיה (לחיצה = קול), ואז חשיפת התשובה
 * הנכונה + פידבק בלחיצת "הבא" נוספת (נשלט ע"י ה-prop revealed מלמעלה).
 * ה-state של ההצבעות מקומי לרכיב הזה בלבד, ולכן מתאפס אוטומטית בכל
 * פעם שהשקופית מוצגת מחדש (הרכיב נטען-מחדש דרך ה-key על ההורה).
 */
const OPTION_ORDER = ["a", "b", "c", "d"];
const ZERO_VOTES = { a: 0, b: 0, c: 0, d: 0 };

/**
 * מסך 1 — תצוגת הצבעה בלבד (read-only). המצגת הראשית אינה נקודת הצבעה —
 * הקולות מגיעים אך ורק מהטלפונים (Vote.jsx). כאן רק מוצגת התפלגות חיה
 * של הקולות שכבר נקלטו ב-Firebase, ללא כל אפשרות אינטראקציה/לחיצה.
 * ה-state של הקולות מוחזק בהורה (לפי quizId) כדי שיישמר גם בניווט אחורה/קדימה.
 */
function QuizVoteSlide({ slide, votes, questionNumber }) {
  const total = votes.a + votes.b + votes.c + votes.d;

  return (
    <div className="gdv-quiz">
      <div className="gdv-quiz-header">
        <span className="gdv-quiz-qnum">שאלה {questionNumber}</span>
      </div>
      <p className="gdv-quiz-scenario">{slide.scenario}</p>

      <div className="gdv-quiz-options">
        {slide.options.map((opt) => {
          const count = votes[opt.id];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={opt.id} className="gdv-quiz-option" aria-readonly="true">
              <span className="gdv-quiz-option-top">
                <span className="gdv-quiz-option-letter">{OPTION_LETTERS[opt.id]}</span>
                <span className="gdv-quiz-option-text">{opt.text}</span>
                <span className="gdv-quiz-option-pct">{pct}%</span>
              </span>
              <span className="gdv-quiz-bar-track">
                <span className="gdv-quiz-bar-fill" style={{ width: `${pct}%` }} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="gdv-quiz-voters">סה״כ מצביעים: {total}</div>
    </div>
  );
}

/**
 * מסך 2 — תוצאה + הסבר. משדר "הצלחה" (ירוק) אם רוב הקהל בחר נכון,
 * או "אזהרה" (אדום) אם הרוב טעה — עם הסבר גדול במרכז, ותקציר קטן
 * של השאלה והאפשרויות בתחתית.
 */
function QuizResultSlide({ slide, votes, questionNumber }) {
  const total = votes.a + votes.b + votes.c + votes.d;
  const majorityId =
    total > 0 ? OPTION_ORDER.reduce((best, id) => (votes[id] > votes[best] ? id : best), "a") : null;
  const majorityOpt = majorityId ? slide.options.find((o) => o.id === majorityId) : null;
  const majorityPct = total > 0 ? Math.round((votes[majorityId] / total) * 100) : 0;
  const majorityCorrect = majorityOpt ? majorityOpt.correct : null;

  const themeKey = total === 0 ? "neutral" : majorityCorrect ? "success" : "wrong";
  const showDualExplanation = total > 0 && !majorityCorrect;

  return (
    <div className={`gdv-quiz-result gdv-quiz-result-${themeKey}`}>
      <div className="gdv-quiz-result-header">
        <span className="gdv-quiz-qnum gdv-quiz-qnum-result">שאלה {questionNumber} — תשובה</span>
      </div>
      <div className="gdv-quiz-result-main">
        {showDualExplanation ? (
          <div className="gdv-quiz-result-dual">
            <p className="gdv-quiz-result-explanation gdv-quiz-result-explanation-primary">
              {slide.feedbackWrongPart2}
            </p>
            <p className="gdv-quiz-result-explanation-secondary">{slide.feedbackWrongPart1}</p>
          </div>
        ) : (
          <p className="gdv-quiz-result-explanation gdv-quiz-result-explanation-primary">
            {slide.feedbackCorrect}
          </p>
        )}
      </div>

      <div className="gdv-quiz-result-banner">
        {total === 0 ? (
          <span>טרם התקבלו הצבעות עבור שאלה זו</span>
        ) : (
          <span>
            רובו של הקהל ({majorityPct}%) בחר בתשובה {OPTION_LETTERS[majorityId]}
          </span>
        )}
      </div>

      <div className="gdv-quiz-result-recap">
        <p className="gdv-quiz-result-recap-scenario">{slide.scenario}</p>
        <div className="gdv-quiz-result-recap-options">
          {slide.options.map((opt) => {
            const isCorrect = opt.correct;
            const isWrongMajority = total > 0 && !majorityCorrect && opt.id === majorityId;
            const stateClass = isCorrect ? "is-correct" : isWrongMajority ? "is-wrong-majority" : "";
            return (
              <div key={opt.id} className={`gdv-quiz-recap-opt ${stateClass}`}>
                <span className="gdv-quiz-recap-letter">{OPTION_LETTERS[opt.id]}</span>
                <span className="gdv-quiz-recap-text">{opt.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// רינדור תוכן לפי סוג שקף
// ---------------------------------------------------------------------------

function SlideContent({ slide, quizVotes }) {
  switch (slide.type) {
    case "cover":
      return (
        <div className="gdv-cover">
          <Eyebrow>{slide.eyebrow}</Eyebrow>
          <h1 className="gdv-title-mega">{slide.megaTitle}</h1>
          {slide.subtitle && <p className="gdv-cover-subtitle">{slide.subtitle}</p>}
          <QRCodeBox size={250} label={`סרקו כדי להצטרף להצבעה`} />
        </div>
      );

    case "list": {
      const bodyList = (
        <>
          <Eyebrow>{slide.eyebrow}</Eyebrow>
          <h2 className="gdv-title">{slide.title}</h2>
          {slide.intro && <p className="gdv-intro">{slide.intro}</p>}
          <ul className="gdv-bullets">
            {slide.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          {slide.tags && (
            <div className="gdv-tags-block">
              {slide.tagsLabel && (
                <div className="gdv-tags-label">{slide.tagsLabel}</div>
              )}
              <div className="gdv-tags">
                {slide.tags.map((t, i) => (
                  <span className="gdv-tag" key={i}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {slide.note && (
            <Framed className="gdv-note">
              <span className="gdv-note-label">{slide.note.label}</span>
              <p className="gdv-note-text">{slide.note.text}</p>
            </Framed>
          )}
          {slide.videoLink && (
            <a
              className="gdv-video-link"
              href={slide.videoLink.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="gdv-video-link-icon">▶</span>
              {slide.videoLink.label}
            </a>
          )}
        </>
      );

      const sizeClass = slide.size === "xl" ? "gdv-content-xl" : "";

      if (slide.image) {
        return (
          <div className={`gdv-content gdv-content-split ${sizeClass}`}>
            <div className="gdv-split-text">{bodyList}</div>
            <div className="gdv-split-media">
              <SlideImage src={slide.image.src} alt={slide.image.alt} />
            </div>
          </div>
        );
      }

      return <div className={`gdv-content ${sizeClass}`}>{bodyList}</div>;
    }

    case "list-gallery":
      return (
        <div className="gdv-content">
          <Eyebrow>{slide.eyebrow}</Eyebrow>
          <h2 className="gdv-title">{slide.title}</h2>
          <ul className="gdv-bullets">
            {slide.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <div className="gdv-gallery gdv-gallery-inline">
            {slide.images.map((img, i) => (
              <SlideImage key={i} src={img.src} alt={img.alt} />
            ))}
          </div>
        </div>
      );

    case "image":
      return (
        <div className="gdv-content-fullbleed">
          <SlideImage
            src={slide.image.src}
            alt={slide.image.alt}
            className="gdv-image-frame-flush"
          />
        </div>
      );

    case "caption-image":
      return (
        <div className="gdv-content-fullbleed">
          <div className="gdv-caption-wrap">
            <SlideImage
              src={slide.image.src}
              alt={slide.image.alt}
              className="gdv-image-frame-flush"
            />
            {slide.caption && (
              <span className="gdv-caption-badge">{slide.caption}</span>
            )}
          </div>
        </div>
      );

    case "gallery":
      return (
        <div className="gdv-gallery-closing">
          <div className="gdv-gallery-sized">
            {slide.images.map((img, i) => (
              <SlideImage key={i} src={img.src} alt={img.alt} className="gdv-image-frame-sized" />
            ))}
          </div>
        </div>
      );

    case "video":
      return (
        <div className="gdv-content gdv-content-centered gdv-content-video">
          <Framed className="gdv-image-frame gdv-video-frame">
            {/* controls => לחיץ/ניתן להפעלה, כולל אפשרות מסך-מלא מובנית */}
            <video className="gdv-video" src={slide.video.src} controls preload="metadata" />
          </Framed>
        </div>
      );

    case "divider":
      return (
        <div className="gdv-divider">
          <div className="gdv-divider-ring" />
          <span className="gdv-divider-letter">{slide.title}</span>
        </div>
      );

    case "quiz-vote":
      return (
        <QuizVoteSlide
          slide={slide}
          votes={quizVotes[slide.quizId] || ZERO_VOTES}
          questionNumber={QUIZ_ID_TO_NUMBER[slide.quizId]}
        />
      );

    case "quiz-result":
      return (
        <QuizResultSlide
          slide={slide}
          votes={quizVotes[slide.quizId] || ZERO_VOTES}
          questionNumber={QUIZ_ID_TO_NUMBER[slide.quizId]}
        />
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// הרכיב הראשי
// ---------------------------------------------------------------------------

// רוחב/גובה "קנבס" קבועים — כל השקופיות מעוצבות ביחס למסך Full HD (16:9),
// והקנבס כולו מוקטן/מוגדל באופן אחיד כדי להתאים לכל גודל מסך בפועל
// (כולל מקרן). כך אין תלות ב-vh/vw של הדפדפן שיכולים להשתנות בין מכשירים
// ולגרום לחיתוכי תוכן.
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

// מפתח ה-sessionStorage ששומר את מספר השקופית הנוכחית. sessionStorage
// (בניגוד ל-localStorage) משותף רק בתוך אותה לשונית/חלון — רענון עמוד
// (F5) שומר על אותו session ולכן חוזר לאותה שקופית, בעוד שפתיחת הקישור
// בלשונית/חלון חדש מקבלת session ריק ומתחילה מהשקופית הראשונה.
const SLIDE_STORAGE_KEY = "currentSlide";

function getInitialSlide(total) {
  if (typeof window === "undefined") return 0;
  const saved = Number(window.sessionStorage.getItem(SLIDE_STORAGE_KEY));
  if (Number.isInteger(saved) && saved >= 0 && saved < total) return saved;
  return 0;
}

/**
 * מזהה session חדש וייחודי — נוצר פעם אחת בכל עליית/רענון של עמוד
 * המצגת, ומשודר ל-Firebase (בתוך currentSession) כדי שכל טלפון מחובר
 * יוכל לזהות "המרצה התחיל מפגש חדש" (ראו Vote.jsx) ולאפס את עצמו
 * בהתאם — גם אם המכשיר שלו לא היה מחובר ברגע הרענון עצמו.
 */
function generateSessionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function Presentation() {
  const [current, setCurrent] = useState(() => getInitialSlide(SLIDES.length));
  const total = SLIDES.length;
  const containerRef = useRef(null);
  const viewportRef = useRef(null);
  const [scale, setScale] = useState(1);

  // --- סנכרון Firebase (REST, ללא SDK): קולות הצבעה ---
  // קולות ההצבעה של כל שאלת סימולציה, לפי quizId. מקור האמת הוא
  // Firebase (נתיב votes/{questionNumber}) — פולינג (fetch כל 1.5 שניות)
  // על כל 4 השאלות בו-זמנית מרגע העלאת הרכיב, כך שהנתונים מתעדכנים
  // כמעט בזמן אמת (כולל הצבעות שמגיעות מטלפונים של הקהל דרך
  // VoteScreen.jsx), ונשמרים גם בניווט אחורה/קדימה בין מסך ההצבעה
  // למסך התוצאה.
  const [quizVotes, setQuizVotes] = useState({});

  // sessionId ייחודי לעליית המצגת הנוכחית — נוצר פעם אחת (useState עם
  // אתחול עצל) ונשאר קבוע כל עוד העמוד לא נטען מחדש. כל רענון/פתיחה
  // מחדש של עמוד המצגת מייצר sessionId חדש לגמרי.
  const [sessionId] = useState(generateSessionId);

  // איפוס אוטומטי בעליית המצגת: בכל פתיחה/רענון של עמוד המצגת (המסך
  // הראשי בלבד — לא מסך ההצבעה בטלפון), מנקים את כל הקולות שנצברו,
  // ומשדרים ל-Firebase session חדש (currentSession עם sessionId טרי,
  // ללא שאלה פעילה) — כך שכל הרצאה מתחילה מנתונים נקיים, וכל טלפון
  // מחובר (ראו Vote.jsx) מזהה את ה-session החדש ומאפס את עצמו בהתאם.
  useEffect(() => {
    putPath("votes", null).catch((err) =>
      console.warn("reset votes failed:", err)
    );
    putPath("currentQuestion", 1).catch((err) =>
      console.warn("reset currentQuestion failed:", err)
    );
    putPath("currentSession", {
      sessionId,
      activeQuestionId: null,
      status: "waiting",
    }).catch((err) => console.warn("reset currentSession failed:", err));
  }, [sessionId]);

  // שמירת מיקום השקופית הנוכחית ב-sessionStorage בכל שינוי, כדי שרענון
  // עמוד (F5) יחזיר את המרצה לאותה שקופית במקום להתחיל מחדש מההתחלה.
  useEffect(() => {
    window.sessionStorage.setItem(SLIDE_STORAGE_KEY, String(current));
  }, [current]);

  useEffect(() => {
    const unsubscribers = Object.entries(NUMBER_TO_QUIZ_ID).map(([num, quizId]) =>
      subscribeToPath(`votes/${num}`, (val) => {
        const v = val || {};
        setQuizVotes((prev) => ({
          ...prev,
          [quizId]: {
            a: v.a || 0,
            b: v.b || 0,
            c: v.c || 0,
            d: v.d || 0,
          },
        }));
      })
    );
    return () => unsubscribers.forEach((unsub) => unsub());
  }, []);

  // --- סנכרון Firebase (REST): שידור השאלה הפעילה ---
  // בכל מעבר לשקופית שאלה (הצבעה או תוצאה), משדרים ל-currentSession
  // (PUT דרך fetch) את מזהה השאלה הפעילה ואת הסטטוס — כך שכל הטלפונים
  // המחוברים (VoteScreen.jsx, שמבצע polling על אותו נתיב) עוברים
  // אוטומטית לאותה שאלה, בלי שהמרצה יצטרך לעשות משהו נוסף.
  useEffect(() => {
    const slide = SLIDES[current];
    if (slide.type !== "quiz-vote" && slide.type !== "quiz-result") return;
    const questionNumber = QUIZ_ID_TO_NUMBER[slide.quizId];
    if (!questionNumber) return;
    // PUT מחליף את כל הערך בנתיב, ולכן צריך לכלול את ה-sessionId בכל
    // כתיבה (אחרת הוא יימחק) — כך שהטלפונים תמיד יודעים גם לאיזו שאלה
    // לעבור וגם שמדובר עדיין באותו session שאליו הם משויכים.
    putPath("currentSession", {
      sessionId,
      activeQuestionId: questionNumber,
      status: slide.type === "quiz-vote" ? "active" : "revealed",
    }).catch((err) => console.warn("currentSession update failed:", err));
  }, [current, sessionId]);

  // חישוב קנה-מידה כך שהקנבס (1920x1080) תמיד נכנס במלואו בתוך המסך
  // הזמין, בלי חיתוך ובלי צורך בגלילה — בדיוק כמו הקרנת מצגת אמיתית.
  useEffect(() => {
    function updateScale() {
      const el = viewportRef.current;
      const availW = el ? el.clientWidth : window.innerWidth;
      const availH = el ? el.clientHeight : window.innerHeight;
      const next = Math.min(availW / CANVAS_WIDTH, availH / CANVAS_HEIGHT);
      setScale(next > 0 ? next : 1);
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    const ro = viewportRef.current && window.ResizeObserver ? new ResizeObserver(updateScale) : null;
    if (ro && viewportRef.current) ro.observe(viewportRef.current);
    return () => {
      window.removeEventListener("resize", updateScale);
      if (ro) ro.disconnect();
    };
  }, []);

  const goNext = useCallback(() => {
    setCurrent((c) => Math.min(c + 1, total - 1));
  }, [total]);

  const goPrev = useCallback(() => {
    setCurrent((c) => Math.max(c - 1, 0));
  }, []);

  // רכיבים אינטראקטיביים (וידאו, לינקים, כפתורים) לא אמורים להפעיל ניווט שקופיות
  const isInteractiveTarget = (el) =>
    !!el.closest && !!el.closest("a, button, video, input, textarea, [contenteditable='true']");

  // ניווט מקלדת — רווח וכל חץ תמיד מעבירים קדימה (חוץ מאשר בזמן שהפוקוס
  // נמצא על רכיב אינטראקטיבי, כדי לא לחטוף למשל את מקש הרווח מנגן הוידאו)
  useEffect(() => {
    function handleKeyDown(e) {
      if (isInteractiveTarget(e.target)) return;
      const forwardKeys = [
        " ",
        "Spacebar",
        "ArrowRight",
        "ArrowLeft",
        "ArrowUp",
        "ArrowDown",
      ];
      if (forwardKeys.includes(e.key)) {
        e.preventDefault();
        goNext();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext]);

  // ניווט עכבר — לחיצה בצד שמאל הפיזי של המסך = קדימה, בצד ימין = אחורה.
  // clientX נמדד תמיד משמאל למסך (ללא תלות בכיווניות RTL/LTR), ולכן
  // X קטן מחצי הרוחב = צד שמאל = קדימה.
  // לחיצה על וידאו/לינק/כפתור לא מפעילה ניווט, כדי שיהיה אפשר להפעיל
  // ולפתוח את הסרטונים כרגיל.
  const handleScreenClick = (e) => {
    if (isInteractiveTarget(e.target)) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const half = rect.width / 2;
    if (clickX < half) {
      goNext(); // צד שמאל של המסך -> שקופית הבאה
    } else {
      goPrev(); // צד ימין של המסך -> שקופית קודמת
    }
  };

  const slide = SLIDES[current];
  const progressPct = ((current + 1) / total) * 100;

  return (
    <div className="gdv-viewport" ref={viewportRef}>
      <div
        className="gdv-root"
        dir="rtl"
        lang="he"
        onClick={handleScreenClick}
        style={{
          width: `${CANVAS_WIDTH}px`,
          height: `${CANVAS_HEIGHT}px`,
          transform: `scale(${scale})`,
        }}
      >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&family=Rubik:wght@600;700;800;900&display=swap');

        .gdv-viewport {
          width: 100%;
          height: 100vh;
          min-height: 480px;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .gdv-root {
          --bg-void: #070804;
          --bg-panel: #10130b;
          --bg-panel-raised: #1a1e12;
          --olive: #5c6f31;
          --olive-deep: #2e371a;
          --olive-light: #9cb066;
          --burgundy: #6d1a26;
          --burgundy-bright: #b23348;
          --gold: #d4b055;
          --gold-soft: #c2a058;
          --text-primary: #fbfaf4;
          --text-muted: #c3c6b4;

          position: relative;
          width: 1920px;
          height: 1080px;
          flex-shrink: 0;
          transform-origin: center center;
          min-height: 0;
          background:
            radial-gradient(ellipse at 20% 0%, rgba(87,105,47,0.16), transparent 55%),
            radial-gradient(ellipse at 85% 100%, rgba(109,26,38,0.14), transparent 55%),
            var(--bg-void);
          color: var(--text-primary);
          font-family: 'Heebo', 'Arial Hebrew', sans-serif;
          overflow: hidden;
          user-select: none;
          box-sizing: border-box;
        }
        .gdv-root *, .gdv-root *::before, .gdv-root *::after {
          box-sizing: border-box;
        }

        .gdv-texture {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.05;
          background-image: repeating-linear-gradient(
            135deg,
            var(--olive-light) 0px,
            var(--olive-light) 1px,
            transparent 1px,
            transparent 26px
          );
          z-index: 0;
        }

        /* --- eyebrow --- */
        .gdv-eyebrow {
          display: inline-block;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: var(--gold);
          background: rgba(212,176,85,0.10);
          border: 1px solid rgba(212,176,85,0.4);
          border-radius: 3px;
          padding: 6px 14px;
          margin-bottom: 20px;
        }
        .gdv-eyebrow-featured {
          display: block;
          width: fit-content;
          margin: 0 auto 28px;
          text-align: center;
          font-size: 24px;
          font-weight: 800;
          font-family: 'Rubik', 'Heebo', sans-serif;
          letter-spacing: 0.06em;
          color: var(--bg-void);
          background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%);
          border: none;
          border-radius: 5px;
          padding: 12px 34px;
          box-shadow: 0 6px 22px rgba(212,176,85,0.28);
        }

        /* --- main stage --- */
        .gdv-stage {
          position: relative;
          z-index: 3;
          height: calc(100% - 64px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px 64px 90px;
        }
        .gdv-stage-flush {
          padding: 20px 24px;
        }
        .gdv-stage-flush-photo {
          padding: 24px 24px 130px 190px;
        }
        .gdv-slide-anim {
          width: 85%;
          max-width: 1560px;
          animation: gdvFadeIn 0.45s ease;
        }
        .gdv-slide-anim-flush {
          width: 100%;
          max-width: none;
          height: 100%;
        }
        @media (prefers-reduced-motion: reduce) {
          .gdv-slide-anim { animation: none; }
        }
        @keyframes gdvFadeIn {
          from { opacity: 0; transform: translateY(10px) scale(0.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .gdv-content-fullbleed {
          width: 100%;
          height: 100%;
          display: flex;
        }

        .gdv-content {
          background: linear-gradient(180deg, var(--bg-panel) 0%, var(--bg-panel-raised) 100%);
          border: 1.5px solid var(--olive-deep);
          border-radius: 8px;
          padding: 64px 76px;
          min-height: 640px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          position: relative;
        }
        .gdv-content-xl {
          padding: 88px 100px;
          min-height: 780px;
        }
        .gdv-content-xl .gdv-title { font-size: 52px; margin-bottom: 34px; }
        .gdv-content-xl .gdv-bullets { gap: 24px; }
        .gdv-content-xl .gdv-bullets li { font-size: 28px; line-height: 1.6; padding-right: 32px; }
        .gdv-content-xl .gdv-bullets li::before { width: 12px; height: 12px; top: 9px; }
        .gdv-content-xl .gdv-intro { font-size: 25px; }
        .gdv-content-xl .gdv-eyebrow:not(.gdv-eyebrow-featured) { font-size: 18px; padding: 8px 18px; }
        .gdv-content-xl .gdv-tags-label { font-size: 18px; margin-bottom: 14px; }
        .gdv-content-xl .gdv-tag { font-size: 20px; padding: 10px 22px; }
        .gdv-content-xl .gdv-tags-block { margin-top: 38px; }
        .gdv-content-centered {
          background: none;
          border: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .gdv-content-centered .gdv-eyebrow { align-self: flex-start; }

        .gdv-content-split {
          display: grid;
          grid-template-columns: 1.3fr 1fr;
          gap: 40px;
          align-items: center;
        }
        .gdv-split-media .gdv-image-frame {
          width: 100%;
          aspect-ratio: 238 / 179;
          height: auto;
        }

        .gdv-title {
          font-family: 'Rubik', 'Heebo', sans-serif;
          font-weight: 800;
          font-size: 36px;
          line-height: 1.25;
          color: var(--text-primary);
          margin: 0 0 26px;
          letter-spacing: -0.01em;
        }
        .gdv-title-mega {
          font-family: 'Rubik', 'Heebo', sans-serif;
          font-weight: 900;
          font-size: 190px;
          line-height: 1;
          color: var(--text-primary);
          margin: 6px 0 0;
          letter-spacing: 0.02em;
          text-align: center;
          text-shadow: 0 0 90px rgba(200,162,74,0.22);
        }

        .gdv-intro {
          font-size: 18px;
          color: var(--text-muted);
          margin: -10px 0 22px;
          line-height: 1.6;
        }

        .gdv-bullets {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        .gdv-bullets li {
          position: relative;
          padding-right: 26px;
          font-size: 19px;
          line-height: 1.55;
          color: var(--text-primary);
        }
        .gdv-bullets li::before {
          content: '';
          position: absolute;
          right: 0;
          top: 7px;
          width: 9px;
          height: 9px;
          background: var(--olive-light);
          transform: rotate(45deg);
          box-shadow: 0 0 0 3px rgba(143,162,92,0.12);
        }

        .gdv-tags-block { margin-top: 30px; }
        .gdv-tags-label {
          font-size: 13px;
          color: var(--text-muted);
          margin-bottom: 10px;
          letter-spacing: 0.04em;
        }
        .gdv-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .gdv-tag {
          font-size: 15px;
          font-weight: 500;
          padding: 7px 16px;
          border-radius: 3px;
          background: var(--olive-deep);
          border: 1px solid var(--olive);
          color: var(--text-primary);
        }

        .gdv-note {
          margin-top: 28px;
          background: rgba(109,26,38,0.14);
          border: 1px solid var(--burgundy-bright);
          border-radius: 4px;
          padding: 16px 20px;
          position: relative;
        }
        .gdv-note-label {
          display: inline-block;
          font-family: 'Rubik', sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #e2909c;
          background: rgba(156,44,58,0.25);
          border-radius: 3px;
          padding: 3px 10px;
          margin-bottom: 8px;
        }
        .gdv-note-text {
          margin: 0;
          font-size: 17px;
          color: var(--text-primary);
        }

        /* --- framed / corners (signature element) --- */
        .gdv-framed {
          position: relative;
          border: 1px solid var(--olive-deep);
        }
        .gdv-corner {
          position: absolute;
          width: 18px;
          height: 18px;
          pointer-events: none;
          z-index: 2;
        }
        .gdv-corner-tl { top: -1px; left: -1px; border-top: 2px solid var(--gold); border-left: 2px solid var(--gold); }
        .gdv-corner-tr { top: -1px; right: -1px; border-top: 2px solid var(--gold); border-right: 2px solid var(--gold); }
        .gdv-corner-bl { bottom: -1px; left: -1px; border-bottom: 2px solid var(--gold); border-left: 2px solid var(--gold); }
        .gdv-corner-br { bottom: -1px; right: -1px; border-bottom: 2px solid var(--gold); border-right: 2px solid var(--gold); }

        /* --- שקופיות שאלת סימולציה --- */
        .gdv-quiz {
          width: 100%;
          background: linear-gradient(180deg, var(--bg-panel) 0%, var(--bg-panel-raised) 100%);
          border: 1.5px solid var(--olive-deep);
          border-radius: 10px;
          padding: 52px 68px;
          display: flex;
          flex-direction: column;
          gap: 26px;
        }
        .gdv-quiz-header {
          display: flex;
          justify-content: flex-start;
        }
        .gdv-quiz-qnum {
          display: inline-block;
          font-family: 'Rubik', sans-serif;
          font-weight: 800;
          font-size: 16px;
          letter-spacing: 0.06em;
          color: var(--bg-void);
          background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%);
          border-radius: 4px;
          padding: 6px 16px;
        }
        .gdv-quiz-scenario {
          margin: 0;
          padding-bottom: 22px;
          border-bottom: 1px solid var(--olive-deep);
          font-size: 25px;
          line-height: 1.6;
          font-weight: 500;
          color: var(--text-primary);
        }
        .gdv-quiz-options {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .gdv-quiz-option {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          text-align: right;
          background: var(--bg-panel-raised);
          border: 1.5px solid var(--olive-deep);
          border-radius: 7px;
          padding: 16px 22px;
          cursor: default;
          font-family: 'Heebo', sans-serif;
          transition: border-color 0.2s, background 0.2s, opacity 0.2s;
        }
        .gdv-quiz-option-top {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .gdv-quiz-option-letter {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--olive-deep);
          color: var(--gold);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Rubik', sans-serif;
          font-weight: 800;
          font-size: 16px;
        }
        .gdv-quiz-option-text {
          flex: 1;
          font-size: 19px;
          line-height: 1.45;
          color: var(--text-primary);
        }
        .gdv-quiz-option-pct {
          flex-shrink: 0;
          min-width: 52px;
          text-align: left;
          font-family: 'Rubik', sans-serif;
          font-weight: 700;
          font-size: 18px;
          color: var(--gold);
        }
        .gdv-quiz-bar-track {
          display: block;
          width: 100%;
          height: 8px;
          border-radius: 4px;
          background: var(--olive-deep);
          overflow: hidden;
        }
        .gdv-quiz-bar-fill {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, var(--olive-light), var(--gold));
          transition: width 0.35s ease;
        }
        .gdv-quiz-voters {
          text-align: center;
          font-size: 16px;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }

        /* --- מסך תוצאה + הסבר --- */
        .gdv-quiz-result {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 22px;
          padding: 52px 68px;
          border-radius: 10px;
          box-sizing: border-box;
          animation: gdvRevealIn 0.55s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .gdv-quiz-result { animation: none; }
        }
        @keyframes gdvRevealIn {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        .gdv-quiz-result-header {
          display: flex;
          justify-content: flex-start;
        }
        .gdv-quiz-qnum-result {
          background: linear-gradient(135deg, var(--text-primary) 0%, var(--text-muted) 100%);
        }
        .gdv-quiz-result-success {
          background: linear-gradient(180deg, rgba(63,174,111,0.22) 0%, rgba(7,8,4,0.55) 55%);
          border: 2px solid #3fae6f;
          box-shadow: inset 0 0 90px rgba(63,174,111,0.14), 0 0 60px rgba(63,174,111,0.18);
        }
        .gdv-quiz-result-wrong {
          background: linear-gradient(180deg, rgba(217,55,68,0.24) 0%, rgba(7,8,4,0.55) 55%);
          border: 3px solid #d93744;
          box-shadow: inset 0 0 90px rgba(217,55,68,0.16), 0 0 60px rgba(217,55,68,0.2);
        }
        .gdv-quiz-result-neutral {
          background: linear-gradient(180deg, rgba(212,176,85,0.16) 0%, rgba(7,8,4,0.55) 55%);
          border: 2px solid var(--gold-soft);
        }
        .gdv-quiz-result-banner {
          align-self: center;
          max-width: 90%;
          background: rgba(0,0,0,0.38);
          border: 1.5px solid rgba(255,255,255,0.25);
          border-radius: 8px;
          padding: 12px 30px;
          font-size: 19px;
          font-weight: 600;
          line-height: 1.5;
          color: var(--text-muted);
          text-align: center;
        }
        .gdv-quiz-result-banner b { color: var(--gold); }
        .gdv-quiz-result-main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 0 40px;
          min-height: 0;
        }
        .gdv-quiz-result-explanation {
          margin: 0;
          line-height: 1.55;
          color: var(--text-primary);
          text-shadow: 0 2px 14px rgba(0,0,0,0.45);
        }
        .gdv-quiz-result-dual {
          display: flex;
          flex-direction: column;
          gap: 20px;
          width: 100%;
        }
        .gdv-quiz-result-explanation-primary {
          font-size: 38px;
          font-weight: 800;
        }
        .gdv-quiz-result-explanation-secondary {
          margin: 0;
          font-size: 19px;
          font-weight: 500;
          line-height: 1.55;
          color: var(--text-muted);
        }
        .gdv-quiz-result-recap {
          border-top: 1px solid rgba(255,255,255,0.18);
          padding-top: 18px;
          flex-shrink: 0;
        }
        .gdv-quiz-result-recap-scenario {
          margin: 0 0 12px;
          font-size: 14px;
          line-height: 1.5;
          color: var(--text-muted);
        }
        .gdv-quiz-result-recap-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .gdv-quiz-recap-opt {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          color: var(--text-muted);
          border: 1.5px solid transparent;
          border-radius: 6px;
          padding: 7px 12px;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .gdv-quiz-recap-letter {
          flex-shrink: 0;
          font-weight: 700;
          font-family: 'Rubik', sans-serif;
          color: var(--text-primary);
        }
        .gdv-quiz-recap-text { flex: 1; line-height: 1.4; }
        .gdv-quiz-recap-opt.is-correct {
          color: var(--text-primary);
          border-color: #3fae6f;
          background: rgba(63,174,111,0.12);
          box-shadow: 0 0 16px rgba(63,174,111,0.25);
        }
        .gdv-quiz-recap-opt.is-wrong-majority {
          color: var(--text-primary);
          border-color: #d93744;
          background: rgba(217,55,68,0.14);
          box-shadow: 0 0 16px rgba(217,55,68,0.3);
        }

        /* --- images --- */
        .gdv-image-frame {
          background: var(--bg-panel);
          border: 2px solid var(--olive-light);
          border-radius: 4px;
          overflow: hidden;
          line-height: 0;
        }
        .gdv-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        /* תמונה יחידה בשקופית — ממלאת כמעט את כל שטח המסך; cover כדי שהתמונה
           תמלא את המסגרת במדויק (עם חיתוך אוטומטי של השוליים החורגים) */
        .gdv-image-frame-flush {
          width: 100%;
          height: 100%;
        }

        /* שקופית הסיום — שתי תמונות ביחס 245:195, בפריסה נקייה וממורכזת */
        .gdv-gallery-closing {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .gdv-gallery-sized {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 36px;
        }
        .gdv-image-frame-sized {
          width: 900px;
          aspect-ratio: 245 / 195;
          height: auto;
          flex-shrink: 0;
        }

        .gdv-gallery {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 22px;
          width: 100%;
          max-width: 900px;
        }
        .gdv-gallery .gdv-image-frame { height: 340px; }
        .gdv-gallery-inline {
          margin-top: 34px;
          max-width: none;
          grid-template-columns: repeat(3, 1fr);
          gap: 26px;
        }
        .gdv-gallery-inline .gdv-image-frame {
          width: 100%;
          height: auto;
          aspect-ratio: 215 / 140;
        }

        .gdv-content-video {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .gdv-video-frame {
          width: 1280px;
          height: 720px;
          background: #000;
        }
        .gdv-video {
          width: 1280px;
          height: 720px;
          display: block;
          background: #000;
        }

        .gdv-video-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 22px;
          font-family: 'Heebo', sans-serif;
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          background: var(--olive-deep);
          border: 1px solid var(--olive-light);
          border-radius: 4px;
          padding: 10px 20px;
          text-decoration: none;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }
        .gdv-video-link:hover {
          background: var(--olive);
          border-color: var(--gold);
        }
        .gdv-video-link-icon {
          color: var(--gold);
          font-size: 13px;
        }

        .gdv-caption-wrap { position: relative; width: 100%; height: 100%; }
        .gdv-caption-badge {
          position: absolute;
          bottom: 24px;
          right: 24px;
          background: var(--burgundy);
          color: var(--text-primary);
          font-family: 'Rubik', sans-serif;
          font-weight: 700;
          font-size: 14px;
          padding: 6px 18px;
          border-radius: 3px;
          border: 1px solid var(--gold-soft);
        }

        /* --- cover --- */
        .gdv-cover {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          height: 100%;
        }
        .gdv-cover-subtitle {
          font-family: 'Heebo', sans-serif;
          font-weight: 500;
          font-size: 26px;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          margin: 22px 0 0;
        }

        /* --- מקום שמור לברקוד (QR placeholder) --- */
        .gdv-qr-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .gdv-cover .gdv-qr-wrap { margin-top: 36px; }
        .gdv-qr-box {
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--gold-soft);
          border-radius: 8px;
          background: rgba(255,255,255,0.04);
          padding: 10px;
          overflow: hidden;
        }
        .gdv-qr-box-lg {
          border-width: 3px;
          border-radius: 14px;
          background: rgba(255,255,255,0.05);
        }
        .gdv-qr-image { width: 100%; height: 100%; object-fit: contain; }
        .gdv-qr-caption-below {
          font-size: 12px;
          color: var(--text-muted);
          text-align: center;
          white-space: nowrap;
        }
        .gdv-qr-corner {
          position: absolute;
          bottom: 25px;
          left: 30px;
          z-index: 14;
          padding: 10px;
          border-radius: 12px;
          background: rgba(7,8,4,0.55);
          backdrop-filter: blur(2px);
        }

        /* --- divider --- */
        .gdv-divider {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 497px;
        }
        .gdv-divider-ring {
          position: absolute;
          width: 300px;
          height: 300px;
          border-radius: 50%;
          border: 1px solid var(--olive-deep);
        }
        .gdv-divider-ring::before {
          content: '';
          position: absolute;
          inset: 34px;
          border-radius: 50%;
          border: 1px solid var(--olive-deep);
        }
        .gdv-divider-letter {
          font-family: 'Rubik', sans-serif;
          font-weight: 900;
          font-size: 170px;
          color: var(--gold);
          line-height: 1;
          text-shadow: 0 0 60px rgba(200,162,74,0.25);
        }

        /* --- bottom bar --- */
        .gdv-bottombar {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          padding: 0 40px 20px;
          pointer-events: none;
        }
        .gdv-dots {
          display: flex;
          justify-content: center;
          gap: 7px;
          pointer-events: auto;
        }
        .gdv-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--olive-deep);
          border: 1px solid var(--olive);
          cursor: pointer;
          padding: 0;
          transition: background 0.2s, transform 0.2s;
        }
        .gdv-dot:hover { transform: scale(1.3); }
        .gdv-dot.active {
          background: var(--gold);
          border-color: var(--gold);
        }
        .gdv-footlabel {
          font-size: 12px;
          letter-spacing: 0.08em;
          color: var(--olive-light);
          opacity: 0.7;
        }
        .gdv-footlabel-spacer { justify-self: end; }

        .gdv-progress {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 2px;
          background: var(--olive-deep);
          z-index: 11;
        }
        .gdv-progress-fill {
          height: 100%;
          background: var(--gold);
          transition: width 0.35s ease;
        }
      `}</style>

      <div className="gdv-texture" />

      {/* גוף השקופית */}
      <div className={`gdv-stage ${FLUSH_TYPES.has(slide.type) ? (PHOTO_FLUSH_TYPES.has(slide.type) ? "gdv-stage-flush-photo" : "gdv-stage-flush") : ""}`} ref={containerRef}>
        <div className={`gdv-slide-anim ${FLUSH_TYPES.has(slide.type) ? "gdv-slide-anim-flush" : ""}`} key={current}>
          <SlideContent slide={slide} quizVotes={quizVotes} />
        </div>
      </div>

      {/* סרגל תחתון */}
      <div className="gdv-bottombar">
        <span className="gdv-footlabel">GDV — היפוך קיבה</span>
        <div className="gdv-dots">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              className={`gdv-dot ${i === current ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setCurrent(i);
              }}
              aria-label={`מעבר לשקופית ${i + 1}`}
            />
          ))}
        </div>
        <span className="gdv-footlabel-spacer" aria-hidden="true" />
      </div>

      {/* ברקוד משני — דיסקרטי, בכל השקפים חוץ מהפתיחה (שם יש ברקוד ראשי גדול) */}
      {current !== 0 && (
        <div className="gdv-qr-corner">
          <QRCodeBox size={110} label={`סרוק להצטרפות`} />
        </div>
      )}

      <div className="gdv-progress">
        <div className="gdv-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      </div>
    </div>
  );
}
