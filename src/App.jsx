import React from "react";
import Presentation from "./Presentation";
import Vote from "./Vote";

/**
 * App.jsx
 * ניתוב פשוט לפי הנתיב (pathname) בדפדפן — בלי תלות בחבילת ניתוב
 * חיצונית (כמו react-router-dom). לא חובה, אבל מספיק ונקי לפרויקט
 * דו-מסכי כזה:
 *
 *   /        -> Presentation  (מסך המרצה/המקרן)
 *   /vote    -> Vote          (מסך ההצבעה בטלפון של הקהל)
 *
 * הערה חשובה לפריסה ב-Vercel: מכיוון שזה ניתוב בצד הלקוח (client-side)
 * בלבד, גישה ישירה לכתובת /vote (למשל דרך סריקת ברקוד) חייבת להחזיר
 * את אותו index.html כדי שהאפליקציה תעלה ותבצע את הניתוב בעצמה —
 * ראו את קובץ vercel.json המצורף, שמגדיר rewrite מתאים לכך.
 */
export default function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const isVoteRoute = path === "/vote" || path.startsWith("/vote/");

  return isVoteRoute ? <Vote devMode={false} /> : <Presentation />;
}
