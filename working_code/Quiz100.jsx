import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './Quiz100.css';
import dogIntroImg from '../assets/opening.png';
import dogResultsImg from '../assets/result-message.png';

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxmxJhqExvfaHsodo-SZUh4eVvjEXZ8tpVcvFQRILbaws6184xjdyk20xVhNlDXTimh/exec';

async function sendToSheets(payload) {
  console.log("Trying to send to URL:", SHEETS_URL);
  console.log("Payload being sent to Sheets:", JSON.stringify(payload, null, 2));
  try {
    await fetch(SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('שליחה ל-Sheets נכשלה:', err);
  }
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const QUESTION_TIME = 60;

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconLock = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="11" width="14" height="10" rx="2" fill="#C8956C" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#C8956C" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="16" r="1.5" fill="white" />
  </svg>
);

const IconTimer = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2" />
    <path d="M12 9v4l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M9 2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Quiz100({ questions: QUESTIONS, quizTitle = 'בוחן הכשרה', skipSheets = false }) {
  // Screen state
  const [screen, setScreen] = useState('intro');
  const [agreedConfidentiality, setAgreedConfidentiality] = useState(false);

  // Quiz progress
  const [hasRetried, setHasRetried] = useState(false);
  const hasSubmitted = useRef(false);
  const [firstAttemptScore, setFirstAttemptScore] = useState(null);
  const [activeQuestions, setActiveQuestions] = useState([...QUESTIONS]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [answerState, setAnswerState] = useState(null);

  // Answers
  const [currentAttemptAnswers, setCurrentAttemptAnswers] = useState({});
  const [allAnswers, setAllAnswers] = useState({});

  // Image question state
  const [imageRevealed, setImageRevealed] = useState(false);
  const [showImagePopup, setShowImagePopup] = useState(false);

  // Timer
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const timerRef = useRef(null);
  const scormInteractionRef = useRef(0);

  const currentQuestion = activeQuestions[currentIndex] || null;
  const isLastQuestion = currentIndex === activeQuestions.length - 1;

  const shuffledOptions = useMemo(
    () => currentQuestion ? shuffle(Object.entries(currentQuestion.options)) : [],
    [currentQuestion]
  );

  // ── Lock body scroll on confidentiality screen ────────────────────────────
  useEffect(() => {
    if (screen === 'confidentiality' || screen === 'pre-results') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [screen]);

  // ── Scroll to top ─────────────────────────────────────────────────────────
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  useEffect(() => {
    if (isIOS) {
      document.body.style.display = 'none';
      // eslint-disable-next-line no-unused-expressions
      document.body.offsetHeight;
      document.body.style.display = '';
      window.scrollTo(0, 0);
    } else {
      document.getElementById('top')?.scrollIntoView();
    }
  }, [screen, currentIndex, isIOS]);

  // ── Timer ──────────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (screen !== 'quiz') return;
    setTimeLeft(QUESTION_TIME);
  }, [screen, currentIndex]);

  useEffect(() => {
    if (screen !== 'quiz' || answerState !== null) {
      stopTimer();
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return stopTimer;
  }, [screen, currentIndex, answerState, stopTimer]);

  useEffect(() => {
    if (timeLeft === 0 && screen === 'quiz' && answerState === null && currentQuestion) {
      stopTimer();
      setAnswerState('timeout');
      setCurrentAttemptAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: { selected: null, correct: false, timedOut: true },
      }));
    }
  }, [timeLeft, screen, answerState, currentQuestion, stopTimer]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectOption = (key) => {
    if (answerState !== null || !currentQuestion) return;
    stopTimer();
    const correct = key === currentQuestion.correct;
    setSelectedOption(key);
    setAnswerState(correct ? 'correct' : 'wrong');
    setCurrentAttemptAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: { selected: key, correct, timedOut: false },
    }));
  };

  const handleNext = () => {
    setImageRevealed(false);
    setShowImagePopup(false);

    // Record SCORM interaction for the question just answered
    if (typeof window.pipwerks !== "undefined" && pipwerks.SCORM.connection.isActive) {
      const answerData = currentAttemptAnswers[currentQuestion.id];
      if (answerData) {
        const n = scormInteractionRef.current;
        const is2004 = pipwerks.SCORM.version === "2004";
        pipwerks.SCORM.set(`cmi.interactions.${n}.id`, String(currentQuestion.id));
        pipwerks.SCORM.set(`cmi.interactions.${n}.type`, "choice");
        pipwerks.SCORM.set(
          `cmi.interactions.${n}.${is2004 ? "learner_response" : "student_response"}`,
          answerData.timedOut ? "" : answerData.selected
        );
        pipwerks.SCORM.set(`cmi.interactions.${n}.correct_responses.0.pattern`, currentQuestion.correct);
        pipwerks.SCORM.set(
          `cmi.interactions.${n}.result`,
          answerData.correct ? "correct" : (is2004 ? "incorrect" : "wrong")
        );
        scormInteractionRef.current += 1;
      }
    }

    if (isLastQuestion) {
      const merged = { ...allAnswers, ...currentAttemptAnswers };
      setAllAnswers(merged);
      const score = calcScore(merged);

      if (!hasSubmitted.current && !skipSheets) {
        hasSubmitted.current = true;
        const questionAnswers = {};
        QUESTIONS.forEach((q) => {
          const ans = merged[q.id];
          questionAnswers[`Q${q.id}`] = ans?.correct ? 1 : 0;
        });
        sendToSheets({
          Quiz_Name: quizTitle,
          Final_Score: score,
          ...questionAnswers,
        });
      }

      if (typeof window.pipwerks !== "undefined" && pipwerks.SCORM.connection.isActive) {
        const is2004 = pipwerks.SCORM.version === "2004";
        pipwerks.SCORM.score.set(score);
        if (is2004) {
          pipwerks.SCORM.set("cmi.completion_status", "completed");
          pipwerks.SCORM.set("cmi.success_status", score >= 50 ? "passed" : "failed");
        } else {
          pipwerks.SCORM.set("cmi.core.lesson_status", score >= 50 ? "passed" : "failed");
        }
        pipwerks.SCORM.save();
        pipwerks.SCORM.quit();
      }
      const showPreResults = score === 100 || hasRetried;
      setScreen(showPreResults ? 'pre-results' : 'results');
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setAnswerState(null);
      setTimeLeft(QUESTION_TIME);
    }
  };

  const calcScore = (answers) => {
    const correct = Object.values(answers).filter((a) => a.correct).length;
    return Math.round((correct / QUESTIONS.length) * 100);
  };

  const finalScore = calcScore(allAnswers);
  const passed = finalScore === 100;

  const handleRetry = () => {
    setFirstAttemptScore(finalScore);
    const failedQIds = Object.entries(allAnswers)
      .filter(([, a]) => !a.correct)
      .map(([id]) => parseInt(id, 10));
    const failedQs = QUESTIONS.filter((q) => failedQIds.includes(q.id));
    setHasRetried(true);
    setActiveQuestions(shuffle(failedQs));
    setCurrentIndex(0);
    setCurrentAttemptAnswers({});
    setSelectedOption(null);
    setAnswerState(null);
    setTimeLeft(QUESTION_TIME);
    setImageRevealed(false);
    setShowImagePopup(false);
    setScreen('quiz');
  };

  const startQuiz = () => {
    scormInteractionRef.current = 0;
    if (typeof window.pipwerks !== "undefined") {
      pipwerks.SCORM.init();
    }
    setActiveQuestions(shuffle(QUESTIONS));
    setCurrentIndex(0);
    setCurrentAttemptAnswers({});
    setAllAnswers({});
    setSelectedOption(null);
    setAnswerState(null);
    setHasRetried(false);
    setFirstAttemptScore(null);
    setImageRevealed(false);
    setShowImagePopup(false);
    setScreen('confidentiality');
  };

  // ── Timer helpers ──────────────────────────────────────────────────────────
  const timerColor = timeLeft > 30 ? '#2D6A4F' : timeLeft > 15 ? '#E8913A' : '#C0435A';
  const timerPercent = Math.round((timeLeft / QUESTION_TIME) * 100);

  // ── Option style helpers ───────────────────────────────────────────────────
  const getOptionClass = (key) => {
    const isSelected = selectedOption === key;
    const isCorrect = currentQuestion && key === currentQuestion.correct;
    if (answerState === null) return 'option';
    if (answerState === 'timeout') return isCorrect ? 'option option--correct-reveal' : 'option option--dimmed';
    if (isSelected && isCorrect) return 'option option--correct';
    if (isSelected && !isCorrect) return 'option option--wrong';
    if (!isSelected && isCorrect) return 'option option--correct-reveal';
    return 'option option--dimmed';
  };

  const getOptionIcon = (key) => {
    if (answerState === null) return null;
    const isSelected = selectedOption === key;
    const isCorrect = currentQuestion && key === currentQuestion.correct;
    if (answerState === 'timeout') {
      return isCorrect ? <span className="option__icon option__icon--green"><IconCheck /></span> : null;
    }
    if (isSelected && isCorrect) return <span className="option__icon option__icon--green"><IconCheck /></span>;
    if (isSelected && !isCorrect) return <span className="option__icon option__icon--red"><IconX /></span>;
    if (!isSelected && isCorrect) return <span className="option__icon option__icon--green"><IconCheck /></span>;
    return null;
  };

  // ── Results helpers ────────────────────────────────────────────────────────
  const correctCount = Object.values(allAnswers).filter((a) => a.correct).length;
  const isHighScore = finalScore >= 60;
  const scoreColor = isHighScore ? '#2D6A4F' : '#C0435A';
  const scoreBgClass = isHighScore ? 'score-box score-box--pass' : 'score-box score-box--fail';
  const getQuestionStatus = (qId) => {
    const a = allAnswers[qId];
    if (!a) return 'pending';
    if (a.timedOut) return 'timeout';
    if (a.correct) return 'correct';
    return 'wrong';
  };
  const failedCount = QUESTIONS.filter((q) => !allAnswers[q.id]?.correct).length;
  const canRetry = !passed && !hasRetried && failedCount > 0;

  // ── Quiz screen helpers ────────────────────────────────────────────────────
  const questionNumberLabel = currentQuestion ? `שאלה ${currentQuestion.id} מתוך ${QUESTIONS.length}` : '';
  const progressLabel = `${currentIndex + 1} / ${activeQuestions.length}`;
  const explanationBoxClass =
    answerState === 'correct' ? 'explanation-box explanation-box--correct' :
    answerState === 'wrong'   ? 'explanation-box explanation-box--wrong' :
    answerState === 'timeout' ? 'explanation-box explanation-box--timeout' : '';
  const explanationBadge =
    answerState === 'correct' ? '✅ תשובה נכונה!' :
    answerState === 'wrong'   ? '✕ תשובה שגויה' :
    answerState === 'timeout' ? '⏱ נגמר הזמן' : '';

  // ── Single return with persistent scroll container ─────────────────────────
  return (
    <div key={screen + '-' + currentIndex} className="scroll-container">
      <div id="top" />
      <div className="app-shell">

        {/* ── INTRO ── */}
        {screen === 'intro' && (
          <div key="intro" className="screen screen--intro anim-fade-up" style={{ paddingTop: '10vh' }}>
            <div className="intro__dog-wrap">
              <div className="intro__image-container">
                <img src={dogIntroImg} alt={quizTitle} className="intro__dog-img" />
                <span className="intro__title-overlay">{quizTitle}</span>
              </div>
            </div>
            <div className="intro__stats">
              <div className="intro__stat">
                <span className="intro__stat-icon"><IconTimer /></span>
                <div className="intro__stat-num">1</div>
                <div className="intro__stat-label">דקה לשאלה</div>
              </div>
              <div className="intro__stat">
                <span className="intro__stat-icon">📋</span>
                <div className="intro__stat-num">{QUESTIONS.length}</div>
                <div className="intro__stat-label">שאלות</div>
              </div>
            </div>
            <button className="btn btn--green btn--full" onClick={startQuiz}>
              ← התחל בוחן
            </button>
          </div>
        )}

        {/* ── CONFIDENTIALITY ── */}
        {screen === 'confidentiality' && (
          <div key="confidentiality" className="screen screen--overlay anim-fade-scale">
            <div className="confidentiality__card">
              <div className="confidentiality__lock-wrap">
                <div className="confidentiality__lock-circle"><IconLock /></div>
              </div>
              <h2 className="confidentiality__title">הצהרת סודיות</h2>
              <p className="confidentiality__subtitle">לפני שתתחיל, אנא קרא ואשר</p>
              <div className="confidentiality__rules-card">
                <div className="confidentiality__rules-header">
                  📋 חומר הבוחן הינו <strong>סודי לחלוטין</strong> ומוגן.
                </div>
                <ul className="confidentiality__rules-list">
                  <li>אסור להעביר, לשתף או לפרסם את תוכן השאלות</li>
                  <li>אסור לצלם מסך או להקליט את הבוחן</li>
                  <li>אסור לשתף תשובות עם נבחנים אחרים</li>
                  <li>הפרת הסודיות עשויה לגרור השלכות משמעותיות</li>
                </ul>
              </div>
              <label className="confidentiality__checkbox-row">
                <span className="confidentiality__checkbox-text">
                  קראתי, הבנתי, ואני מתחייב לשמור על סודיות החומר
                </span>
                <div
                  className={`confidentiality__checkbox ${agreedConfidentiality ? 'confidentiality__checkbox--checked' : ''}`}
                  onClick={() => setAgreedConfidentiality((v) => !v)}
                >
                  {agreedConfidentiality && <IconCheck />}
                </div>
              </label>
              <button
                className={`btn btn--full ${agreedConfidentiality ? 'btn--green' : 'btn--disabled'}`}
                onClick={() => {
                  if (agreedConfidentiality) setScreen('quiz');
                }}
                disabled={!agreedConfidentiality}
              >
                {agreedConfidentiality ? '← אני מאשר – התחל בוחן' : 'יש לאשר את ההצהרה תחילה'}
              </button>
            </div>
          </div>
        )}

        {/* ── QUIZ ── */}
        {screen === 'quiz' && currentQuestion && (
          <div key={`quiz-${currentIndex}`} className="screen screen--quiz anim-slide-right">

            {/* Image popup overlay */}
            {currentQuestion.hasImage && showImagePopup && (
              <div
                style={{
                  position: 'fixed', inset: 0, zIndex: 9999,
                  background: 'rgba(0,0,0,0.75)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 16,
                }}
              >
                <img
                  src={currentQuestion.image}
                  alt="תמונת שאלה"
                  style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 }}
                />
                <button
                  onClick={() => setShowImagePopup(false)}
                  style={{
                    border: '1px solid #C8956C', borderRadius: 8,
                    background: 'none', color: '#C8956C', fontSize: '0.85rem',
                    padding: '8px 12px', cursor: 'pointer', fontWeight: 500,
                    minWidth: 120,
                  }}
                >
                  ✕ סגור
                </button>
              </div>
            )}

            {/* Step 1: image + question text + reveal button (before imageRevealed) */}
            {currentQuestion.hasImage && !imageRevealed ? (
              <>
                <div className="quiz__header">
                  <div className="quiz__progress-pill">{progressLabel}</div>
                </div>
                <div className="quiz__timer-row">
                  <span className="quiz__timer-label" style={{ color: timerColor }}>{timeLeft}s</span>
                  <div className="quiz__timer-track">
                    <div
                      className="quiz__timer-bar"
                      style={{ width: `${timerPercent}%`, backgroundColor: timerColor, transition: 'width 1s linear, background-color 0.5s' }}
                    />
                  </div>
                </div>
                <div className="quiz__question-card">
                  <p className="quiz__question-text">{currentQuestion.text}</p>
                </div>
                <img
                  src={currentQuestion.image}
                  alt="תמונת שאלה"
                  style={{ width: '100%', maxHeight: '45vh', objectFit: 'contain', borderRadius: 8, display: 'block' }}
                />
                <button
                  onClick={() => setImageRevealed(true)}
                  style={{
                    marginTop: 12, border: '1px solid #C8956C', borderRadius: 8,
                    background: 'none', color: '#C8956C', fontSize: '0.85rem',
                    padding: '8px 12px', cursor: 'pointer', fontWeight: 500,
                    width: '100%',
                  }}
                >
                  לתשובות ←
                </button>
              </>
            ) : (
              /* Step 2: normal layout with answers */
              <>
                <div className="quiz__header">
                  <div className="quiz__progress-pill">{progressLabel}</div>
                </div>
                <div className="quiz__timer-row">
                  <span className="quiz__timer-label" style={{ color: timerColor }}>{timeLeft}s</span>
                  <div className="quiz__timer-track">
                    <div
                      className="quiz__timer-bar"
                      style={{ width: `${timerPercent}%`, backgroundColor: timerColor, transition: 'width 1s linear, background-color 0.5s' }}
                    />
                  </div>
                </div>
                <div className="quiz__question-card">
                  <p className="quiz__question-text">{currentQuestion.text}</p>
                </div>
                {currentQuestion.hasImage && answerState === null && (
                  <button
                    onClick={() => setShowImagePopup(true)}
                    style={{
                      alignSelf: 'flex-start', background: 'none', border: '1px solid #C8956C',
                      borderRadius: 6, padding: '4px 10px', fontSize: '0.8rem',
                      color: '#C8956C', cursor: 'pointer', marginBottom: 4,
                    }}
                  >
                    🔍 חזרה לתמונה
                  </button>
                )}
                <div className="quiz__options">
                  {shuffledOptions.map(([key, text], index) => (
                    <button
                      key={key}
                      className={getOptionClass(key)}
                      onClick={() => handleSelectOption(key)}
                      disabled={answerState !== null}
                    >
                      <span className="option__letter">{String.fromCharCode(65 + index)}</span>
                      <span className="option__text">{text}</span>
                      {getOptionIcon(key)}
                    </button>
                  ))}
                </div>
                {answerState !== null && (
                  <div className={explanationBoxClass}>
                    <span className="explanation-box__badge">{explanationBadge}</span>
                    {currentQuestion.explanation && (
                      <>
                        <hr className="explanation-box__divider" />
                        <p className="explanation-box__note">{currentQuestion.explanation}</p>
                      </>
                    )}
                    <button className="btn btn--green btn--full" onClick={handleNext}>
                      {isLastQuestion ? 'סיים בוחן ←' : `← המשך לשאלה ${currentIndex + 2}`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── PRE-RESULTS POPUP ── */}
        {screen === 'pre-results' && (
          <div key="pre-results" className="screen screen--overlay anim-fade-scale">
            <div className="confidentiality__card">
              <div className="confidentiality__lock-wrap">
                <div className="confidentiality__lock-circle">📸</div>
              </div>
              <h2 className="confidentiality__title">שימו לב</h2>
              <div className="confidentiality__rules-card">
                <p style={{ margin: 0, lineHeight: 1.7, textAlign: 'right', direction: 'rtl', fontSize: '15px' }}>
                  בעמוד הבא יוצג ציונך הסופי.
                  <br />
                  בעמוד זה בלבד נדרש לצלם מסך ולהעביר למפקד הקורס.
                </p>
              </div>
              <button className="btn btn--green btn--full" onClick={() => setScreen('results')}>
                אני מאשר ומעביר לעמוד הציון ←
              </button>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {screen === 'results' && (
          <div key={hasRetried ? 'results-2' : 'results-1'} className="screen screen--results anim-fade-up">
            <div className="results__dog-wrap">
              <img src={dogResultsImg} alt="כלב" className="results__dog-img" />
            </div>
            {hasRetried && firstAttemptScore !== null && (
              <div className="results__scores-row">
                ניסיון ראשון: {firstAttemptScore}% &nbsp;|&nbsp; ניסיון שני: {finalScore}%
              </div>
            )}
            <div className={`${scoreBgClass}`}>
              <div className="score-box__percent" style={{ color: scoreColor }}>{finalScore}%</div>
              <div className="score-box__sub">{correctCount} מתוך {QUESTIONS.length} נכונות</div>
            </div>
            <div className="results__grid">
              {QUESTIONS.map((q) => {
                const status = getQuestionStatus(q.id);
                return (
                  <div key={q.id} className={`results__grid-item results__grid-item--${status}`}>
                    {status === 'correct' && <span className="results__grid-icon">✓</span>}
                    {status === 'wrong'   && <span className="results__grid-icon">✕</span>}
                    {status === 'timeout' && <span className="results__grid-icon">⏱</span>}
                    {status === 'pending' && <span className="results__grid-icon">—</span>}
                    <span className="results__grid-label">שאלה {q.id}</span>
                  </div>
                );
              })}
            </div>
            {canRetry ? (
              <>
                <div className="results__info-box results__info-box--retry">
                  קיבלת ניסיון לתרגול נוסף של שגיאותך - ללא השפעה על הציון
                </div>
                <button className="btn btn--pink btn--full" onClick={handleRetry}>
                  בוחן המשך רק עם השגיאות
                </button>
              </>
            ) : (
              <>
                {passed && (
                  <div className="results__info-box results__info-box--pass">
                    <strong>כל הכבוד! 🎉</strong><br />
                    עברת את הבוחן בהצלחה עם ציון מושלם!
                  </div>
                )}
                {!passed && (
                  <div className="results__info-box results__info-box--no-attempts">
                    <div className="results__info-box__header">🚫 לא ניתן לנסות שוב</div>
                    השתמשת בניסיון החוזר שלך.<br />
                    מומלץ לעבור על החומר שנית.
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
