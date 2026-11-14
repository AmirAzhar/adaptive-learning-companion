export type RequestInfo = {
  apiRequest?: unknown;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number; input_tokens_details?: { cached_tokens?: number } };
  estimatedCostUsd?: number | null;
};

export type AppError = Error & { details?: RequestInfo };
export type Notice = { text: string; details?: RequestInfo };
export type SpaceSummary = { id: string; title: string; documentCount: number };
export type StudyDocument = { id: string; name: string; text: string; createdAt: string };
export type QuizQuestion = { id: number; text: string; options: string[]; correctIndex: number; explanation: string; sourceQuote: string };
export type LegacyQuestion = { id: number; text: string };
export type QuizAttempt = { questionId: number; optionIndex: number; correct: boolean; round?: number };
export type LegacyAttempt = RequestInfo & { questionId: number; answer: string; level: string; feedback: string; sourceQuote: string };
export type QuizRun = RequestInfo & { id: string; documentId: string; type: 'quiz'; createdAt: string; overview: string; questions: QuizQuestion[]; attempts: QuizAttempt[]; currentRound?: number; practiceQuestionIds?: number[] };
export type LegacyRun = RequestInfo & { id: string; documentId: string; type?: string; createdAt: string; overview: string; questions: LegacyQuestion[]; attempts: LegacyAttempt[] };
export type StudyRun = QuizRun | LegacyRun;
export type Flashcard = { id: number; front: string; back: string; sourceQuote: string };
export type Review = { cardId: number; rating: 'again' | 'good'; round: number };
export type Deck = RequestInfo & { id: string; documentId: string; createdAt: string; cards: Flashcard[]; reviews: Review[]; currentRound: number; reviewCardIds: number[] };
export type Space = { id: string; title: string; documents: StudyDocument[]; runs: StudyRun[]; decks?: Deck[] };
