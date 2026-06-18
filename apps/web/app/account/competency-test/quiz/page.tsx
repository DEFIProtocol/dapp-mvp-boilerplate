"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignMessage } from "wagmi";
import { useUser } from "@/contexts/UserContext";
import { getShuffledQuiz, COMPETENCY_QUESTIONS } from "./questions";
import styles from "./CompetencyQuiz.module.css";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:3001"
).replace(/\/$/, "") + "/api";

interface UserAnswers {
  [questionId: string]: number; // Selected answer index (0-3)
}

export default function CompetencyQuizPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { user, refreshUser } = useUser();

  // Quiz state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswers>({});
  const [showResults, setShowResults] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [quizData, setQuizData] = useState<ReturnType<typeof getShuffledQuiz> | null>(null);

  // Results state
  const [score, setScore] = useState(0);
  const [passed, setPassed] = useState(false);

  // Generate shuffled quiz on mount
  useEffect(() => {
    const shuffled = getShuffledQuiz();
    setQuizData(shuffled);
  }, []);

  // Fetch attempt count
  useEffect(() => {
    const fetchAttemptCount = async () => {
      if (!address) return;
      
      try {
        const res = await fetch(`${API_BASE}/onboarding/competency/result/${address}`);
        const data = await res.json();
        
        if (data.success && data.data.attempt_count !== undefined) {
          setAttemptCount(data.data.attempt_count || 0);
        }
      } catch (err) {
        console.error("Failed to fetch attempt count:", err);
      }
    };

    void fetchAttemptCount();
  }, [address]);

  const currentQuestion = quizData?.questions[currentQuestionIndex];
  const totalQuestions = COMPETENCY_QUESTIONS.length;
  const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;
  const attemptsRemaining = Math.max(0, 3 - attemptCount);
  const canAttempt = attemptCount < 3;

  const handleAnswerSelect = (answerIndex: number) => {
    if (!currentQuestion) return;
    
    setUserAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: answerIndex
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!address || !isConnected || !quizData) {
      setError("Please connect your wallet to submit");
      return;
    }

    // Check if all questions are answered
    const allAnswered = COMPETENCY_QUESTIONS.every(q => userAnswers[q.id] !== undefined);
    if (!allAnswered) {
      setError("Please answer all questions before submitting");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Convert user answers from shuffled indices back to original answer indices
      const mappedAnswers: Record<string, number> = {};
      
      for (const [questionId, selectedIndex] of Object.entries(userAnswers)) {
        // Get the mapping for this question
        const mapping = quizData.mapping[questionId];
        // Map the selected shuffled index to the original answer index
        const originalIndex = mapping[selectedIndex];
        mappedAnswers[questionId] = originalIndex;
      }

      // Sign the submission
      const payload = {
        action: "COMPETENCY_SUBMIT",
        wallet_address: address.toLowerCase(),
        timestamp: Math.floor(Date.now() / 1000),
        answers: mappedAnswers,
      };
      const message = JSON.stringify(payload);
      const signature = await signMessageAsync({ message });

      // Submit to backend
      const res = await fetch(`${API_BASE}/onboarding/competency/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: address,
          message,
          signature,
          answers: mappedAnswers,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Submission failed");
      }

      // Update results
      setScore(data.score || 0);
      setPassed(data.passed || false);
      setShowResults(true);
      
      // Refresh user data
      await refreshUser();
    } catch (err: any) {
      setError(err.message || "Failed to submit quiz");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    router.push("/account");
  };

  // Check if user already passed
  if (user?.competency_status === "COMPETENCY_PASSED") {
    return (
      <div className={styles.quizContainer}>
        <div className={styles.quizCard}>
          <div className={styles.resultsCard}>
            <div className={styles.resultsIcon}>🎉</div>
            <h1 className={styles.resultsTitle}>Already Completed!</h1>
            <p className={styles.resultsMessage}>
              You have already passed the competency test. Your voting rights voucher will be available once DAO credentials are issued.
            </p>
            <button onClick={() => router.push("/account")} className={`${styles.button} ${styles.buttonPrimary}`}>
              Return to Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check if user has attempts remaining
  if (!canAttempt) {
    return (
      <div className={styles.quizContainer}>
        <div className={styles.quizCard}>
          <div className={styles.resultsCard}>
            <div className={styles.resultsIcon}>🚫</div>
            <h1 className={styles.resultsTitle}>No Attempts Remaining</h1>
            <p className={styles.resultsMessage}>
              You have used all 3 attempts for the competency test. Please contact support if you believe this is an error or need a reset.
            </p>
            <button onClick={() => router.push("/account")} className={`${styles.button} ${styles.buttonPrimary}`}>
              Return to Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check KYC status
  if (user?.kyc_status !== "KYC_VERIFIED") {
    return (
      <div className={styles.quizContainer}>
        <div className={styles.quizCard}>
          <div className={styles.walletPrompt}>
            <h2>KYC Verification Required</h2>
            <p>You must complete KYC verification before taking the competency test.</p>
            <button 
              onClick={() => router.push("/account/kyc-registration")} 
              className={`${styles.button} ${styles.buttonPrimary}`}
              style={{ marginTop: "1rem" }}
            >
              Complete KYC
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className={styles.quizContainer}>
        <div className={styles.quizCard}>
          <div className={styles.walletPrompt}>
            <h2>Wallet Connection Required</h2>
            <p>Please connect your wallet to take the competency test.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!quizData) {
    return (
      <div className={styles.quizContainer}>
        <div className={styles.quizCard}>
          <div style={{ textAlign: "center", padding: "3rem" }}>
            <div className={styles.loadingSpinner} />
            <p style={{ marginTop: "1rem", color: "rgba(255, 255, 255, 0.6)" }}>Loading quiz...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show results
  if (showResults) {
    return (
      <div className={styles.quizContainer}>
        <div className={styles.quizCard}>
          <div className={styles.resultsCard}>
            <div className={styles.resultsIcon}>{passed ? "🎉" : "📚"}</div>
            <h1 className={styles.resultsTitle}>{passed ? "Congratulations!" : "Not Quite There"}</h1>
            <div className={`${styles.resultsScore} ${passed ? styles.resultsPassed : styles.resultsFailed}`}>
              {score}/{totalQuestions}
            </div>
            <p className={styles.resultsMessage}>
              {passed
                ? "You've passed the competency test! Your voting rights voucher will be available once DAO credentials are issued."
                : `You need a perfect score (${totalQuestions}/${totalQuestions}) to pass. You have ${attemptsRemaining - 1} attempt${attemptsRemaining - 1 === 1 ? "" : "s"} remaining.`}
            </p>

            {!passed && (
              <div className={styles.reviewSection}>
                <h3 className={styles.reviewTitle}>Review Your Answers</h3>
                {COMPETENCY_QUESTIONS.map((question, idx) => {
                  const userAnswerIndex = userAnswers[question.id];
                  const mapping = quizData.mapping[question.id];
                  const originalAnswerIndex = mapping[userAnswerIndex];
                  const correctAnswerIndex = question.answers.findIndex(a => a.isCorrect);
                  const isCorrect = originalAnswerIndex === correctAnswerIndex;

                  return (
                    <div key={question.id} className={styles.questionCard}>
                      <div className={styles.questionNumber}>Question {idx + 1}</div>
                      <div className={styles.questionText}>{question.question}</div>
                      <div className={styles.answersGrid}>
                        {question.answers.map((answer, answerIdx) => {
                          const wasSelected = originalAnswerIndex === answerIdx;
                          const isCorrectAnswer = answerIdx === correctAnswerIndex;
                          
                          let className = styles.answerOption;
                          if (wasSelected && isCorrect) className += ` ${styles.correct}`;
                          if (wasSelected && !isCorrect) className += ` ${styles.incorrect}`;
                          if (!wasSelected && isCorrectAnswer) className += ` ${styles.correct}`;
                          className += ` ${styles.disabled}`;

                          return (
                            <div key={answerIdx} className={className}>
                              <div className={styles.answerLabel}>
                                <div className={styles.answerLetter}>
                                  {String.fromCharCode(65 + answerIdx)}
                                </div>
                                <div className={styles.answerText}>{answer.text}</div>
                              </div>
                              {(wasSelected || isCorrectAnswer) && (
                                <div className={styles.explanation}>{answer.explanation}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={handleRetry} className={`${styles.button} ${styles.buttonPrimary}`}>
              Return to Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show quiz
  return (
    <div className={styles.quizContainer}>
      <div className={styles.quizCard}>
        <div className={styles.header}>
          <h1 className={styles.title}>Supply Chain Competency Test</h1>
          <p className={styles.subtitle}>
            Test your knowledge of free-market principles and decentralized logistics
          </p>
          <div className={`${styles.attemptsInfo} ${attemptsRemaining === 1 ? styles.attemptsWarning : ""}`}>
            Attempts Remaining: {attemptsRemaining}/3
          </div>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>

        {currentQuestion && (
          <div className={styles.questionCard}>
            <div className={styles.questionNumber}>
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </div>
            <div className={styles.questionText}>{currentQuestion.question}</div>

            <div className={styles.answersGrid}>
              {currentQuestion.answers.map((answer, index) => {
                const isSelected = userAnswers[currentQuestion.id] === index;
                
                return (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(index)}
                    className={`${styles.answerOption} ${isSelected ? styles.selected : ""}`}
                  >
                    <div className={styles.answerLabel}>
                      <div className={styles.answerLetter}>
                        {String.fromCharCode(65 + index)}
                      </div>
                      <div className={styles.answerText}>{answer.text}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.navigationButtons}>
          <button
            onClick={handlePrevious}
            disabled={currentQuestionIndex === 0}
            className={`${styles.button} ${styles.buttonSecondary}`}
          >
            ← Previous
          </button>

          {currentQuestionIndex < totalQuestions - 1 ? (
            <button
              onClick={handleNext}
              disabled={userAnswers[currentQuestion?.id || ""] === undefined}
              className={`${styles.button} ${styles.buttonPrimary}`}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting || Object.keys(userAnswers).length < totalQuestions}
              className={`${styles.button} ${styles.buttonPrimary}`}
            >
              {submitting ? (
                <>
                  <div className={styles.loadingSpinner} />
                  Submitting...
                </>
              ) : (
                "Submit Quiz"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
