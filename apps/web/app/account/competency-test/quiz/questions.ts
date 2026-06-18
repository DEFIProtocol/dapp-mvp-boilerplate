// Supply Chain Competency Test Questions
// Based on free-market principles and decentralized logistics

export interface QuizAnswer {
  text: string;
  isCorrect: boolean;
  explanation: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  answers: QuizAnswer[];
}

export const COMPETENCY_QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    question: "Which currency/system do global commodities predominantly price and settle on, creating a centralized financial dependency?",
    answers: [
      {
        text: "The US Dollar and Eurodollar markets",
        isCorrect: true,
        explanation: "Correct — drives global offshore liquidity and settlement"
      },
      {
        text: "Sovereign Euro-bonds",
        isCorrect: false,
        explanation: "Close — heavily traded collateral, but not the primary commodity settlement unit"
      },
      {
        text: "The IMF Special Drawing Rights (SDR)",
        isCorrect: false,
        explanation: "Close — an international reserve asset, but not an active settlement market"
      },
      {
        text: "The Gold Standard Barter System",
        isCorrect: false,
        explanation: "Distractor — historically dead since 1971"
      }
    ]
  },
  {
    id: "q2",
    question: "What occurs to independent oil producers when a government coordinates a massive, artificial release of crude oil from its strategic reserves?",
    answers: [
      {
        text: "It temporarily suppresses market prices, crushing the profit margins of small producers who cannot absorb short-term losses",
        isCorrect: true,
        explanation: "Correct — centralized interventions distort natural price discovery and penalize non-state-backed operators"
      },
      {
        text: "It permanently increases the global subterranean reserves available to independent drillers",
        isCorrect: false,
        explanation: "Close — it moves oil from storage to market, but creates no new supply"
      },
      {
        text: "It immediately forces massive state-backed monopolies like Russia and Saudi Arabia into bankruptcy",
        isCorrect: false,
        explanation: "Close — sovereign giants can weather artificial price drops; independents cannot"
      },
      {
        text: "It outlaws the use of fossil fuels globally within twenty-four hours",
        isCorrect: false,
        explanation: "Distractor — not grounded in regulatory reality"
      }
    ]
  },
  {
    id: "q3",
    question: "Why are independent, small-scale commodity producers more vulnerable to centralized market interventions than sovereign, state-backed entities?",
    answers: [
      {
        text: "They lack sovereign debt-printing capacity and massive capital reserves to survive prolonged, artificially suppressed price cycles",
        isCorrect: true,
        explanation: "Correct — they rely entirely on real free-market cash flow"
      },
      {
        text: "They are legally forbidden from using shipping lanes or pipelines",
        isCorrect: false,
        explanation: "Close — they use the same infrastructure but have weaker negotiating leverage"
      },
      {
        text: "They only produce low-grade, unusable commodities",
        isCorrect: false,
        explanation: "Close — quality is identical; scale is the difference"
      },
      {
        text: "They operate exclusively on a gold-coin barter system",
        isCorrect: false,
        explanation: "Distractor — they use modern financial rails"
      }
    ]
  },
  {
    id: "q4",
    question: "What fundamental problem does blockchain settlement solve in multi-party global logistics?",
    answers: [
      {
        text: "It minimizes trust by using an immutable, shared ledger for timestamping and state verification",
        isCorrect: true,
        explanation: "Correct — replaces centralized gatekeepers with distributed proof"
      },
      {
        text: "It guarantees physical security of goods inside containers",
        isCorrect: false,
        explanation: "Close — secures data, not physical cargo"
      },
      {
        text: "It prints paper customs documentation at ports",
        isCorrect: false,
        explanation: "Close — digitizes documentation but doesn't print"
      },
      {
        text: "It increases the physical speed of ships",
        isCorrect: false,
        explanation: "Distractor — software cannot change physics"
      }
    ]
  },
  {
    id: "q5",
    question: "Why do decentralized networks reduce single-point-of-failure risk in global commodity trade?",
    answers: [
      {
        text: "They utilize distributed validation and redundancy across independent nodes",
        isCorrect: true,
        explanation: "Correct — the network stays up even if multiple nodes fail"
      },
      {
        text: "They rely on a single master cloud server",
        isCorrect: false,
        explanation: "Close — that is centralized architecture"
      },
      {
        text: "They enforce uniform global trade policies",
        isCorrect: false,
        explanation: "Close — they provide resilience, not legislation"
      },
      {
        text: "They require identical trade routes",
        isCorrect: false,
        explanation: "Distractor — that creates fragility"
      }
    ]
  },
  {
    id: "q6",
    question: "What is the economic role of derivatives and futures contracts in stabilizing commodity supply chains?",
    answers: [
      {
        text: "To hedge risks and transfer price volatility from producers to market speculators",
        isCorrect: true,
        explanation: "Correct — lets producers lock in predictable costs"
      },
      {
        text: "To manipulate the physical volume of commodities",
        isCorrect: false,
        explanation: "Close — affects financial exposure, not physical supply"
      },
      {
        text: "To eliminate physical delivery requirements",
        isCorrect: false,
        explanation: "Close — most settle in cash, but physical delivery defines pricing"
      },
      {
        text: "To outlaw leverage and short-selling",
        isCorrect: false,
        explanation: "Distractor — derivatives rely on leverage"
      }
    ]
  },
  {
    id: "q7",
    question: "How does structural currency debasement by an unbalanced government balance sheet warp a free market?",
    answers: [
      {
        text: "It distorts price discovery, making supply-chain forecasting unreliable",
        isCorrect: true,
        explanation: "Correct — the unit of account becomes unstable"
      },
      {
        text: "It freezes all prices equally",
        isCorrect: false,
        explanation: "Close — inflation is uneven due to the Cantillon Effect"
      },
      {
        text: "It increases purchasing power for savers",
        isCorrect: false,
        explanation: "Close — it destroys purchasing power"
      },
      {
        text: "It forces global trade back to seashell currency",
        isCorrect: false,
        explanation: "Distractor — absurd alternative"
      }
    ]
  },
  {
    id: "q8",
    question: "Why is a proof-of-uniqueness mechanism critical to the governance of a decentralized commodity network?",
    answers: [
      {
        text: "To provide Sybil resistance and prevent whales from dominating governance via multiple wallets",
        isCorrect: true,
        explanation: "Correct — ensures fair, democratic governance"
      },
      {
        text: "To hide governance vote history",
        isCorrect: false,
        explanation: "Close — identity privacy is separate from transparent results"
      },
      {
        text: "To ensure identical serial numbers on all shipped items",
        isCorrect: false,
        explanation: "Close — tracks actors, not cargo uniformity"
      },
      {
        text: "To allow a centralized admin to override decisions",
        isCorrect: false,
        explanation: "Distractor — opposite of decentralization"
      }
    ]
  },
  {
    id: "q9",
    question: "What occurs to a global supply chain when a centralized regulator enforces artificially capped price controls?",
    answers: [
      {
        text: "It breaks supply-demand balance, causing producer liquidations and artificial shortages",
        isCorrect: true,
        explanation: "Correct — caps kill incentives, creating black markets"
      },
      {
        text: "It permanently stabilizes the market",
        isCorrect: false,
        explanation: "Close — intended to protect consumers but starves supply"
      },
      {
        text: "It increases processing capacity",
        isCorrect: false,
        explanation: "Close — it reduces capital and capacity"
      },
      {
        text: "It causes commodities to teleport to shelves",
        isCorrect: false,
        explanation: "Distractor — ignores logistics entirely"
      }
    ]
  },
  {
    id: "q10",
    question: "How do centralized 'just-in-time' inventory models create severe fragilities in modern logistics?",
    answers: [
      {
        text: "They eliminate buffers and consolidate lanes, making delays catastrophic",
        isCorrect: true,
        explanation: "Correct — reduces costs but destroys resilience"
      },
      {
        text: "They force companies to store multi-year inventory",
        isCorrect: false,
        explanation: "Close — that is the opposite model"
      },
      {
        text: "They decouple manufacturing from demand",
        isCorrect: false,
        explanation: "Close — they couple them too tightly"
      },
      {
        text: "They increase supply chain redundancy",
        isCorrect: false,
        explanation: "Distractor — they eliminate redundancy"
      }
    ]
  }
];

/**
 * Shuffles an array using Fisher-Yates algorithm
 * Returns both the shuffled array and the mapping of original indices
 */
export function shuffleAnswers(answers: QuizAnswer[]): {
  shuffled: QuizAnswer[];
  mapping: number[]; // mapping[newIndex] = originalIndex
} {
  const shuffled = [...answers];
  const mapping: number[] = [];
  
  // Create initial mapping
  for (let i = 0; i < shuffled.length; i++) {
    mapping[i] = i;
  }
  
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    [mapping[i], mapping[j]] = [mapping[j], mapping[i]];
  }
  
  return { shuffled, mapping };
}

/**
 * Generates a complete shuffle mapping for all questions
 * Returns: { q1: [2, 0, 3, 1], q2: [1, 3, 0, 2], ... }
 * Where mapping[questionId][selectedIndex] = originalAnswerIndex
 */
export function generateQuizShuffleMapping(): Record<string, number[]> {
  const mapping: Record<string, number[]> = {};
  
  COMPETENCY_QUESTIONS.forEach(question => {
    const { mapping: answerMapping } = shuffleAnswers(question.answers);
    mapping[question.id] = answerMapping;
  });
  
  return mapping;
}

/**
 * Gets the shuffled questions with their answers randomized
 */
export function getShuffledQuiz(): {
  questions: Array<{
    id: string;
    question: string;
    answers: Array<{ text: string; explanation: string }>;
  }>;
  mapping: Record<string, number[]>;
} {
  const mapping = generateQuizShuffleMapping();
  
  const questions = COMPETENCY_QUESTIONS.map(q => {
    const questionMapping = mapping[q.id];
    const shuffledAnswers = questionMapping.map(originalIndex => ({
      text: q.answers[originalIndex].text,
      explanation: q.answers[originalIndex].explanation,
    }));
    
    return {
      id: q.id,
      question: q.question,
      answers: shuffledAnswers,
    };
  });
  
  return { questions, mapping };
}
