export function checkSource(source) {
  if (typeof source !== 'string' || source.trim().length < 120 || source.length > 6000) {
    throw new Error('Paste a passage between 120 and 6,000 characters.');
  }
  return source.trim();
}

export function checkQuote(source, quote) {
  if (typeof quote !== 'string' || quote.length < 12 || !source.replace(/\s+/g, ' ').includes(quote.replace(/\s+/g, ' '))) {
    throw new Error('The generated reference could not be found in the passage. Please retry.');
  }
  return quote;
}

export function checkSession(source, result) {
  if (typeof result?.overview !== 'string' || !result.overview.trim() || !Array.isArray(result.questions) || result.questions.length !== 3) {
    throw new Error('The study session response was incomplete. Please retry.');
  }
  return {
    overview: result.overview,
    questions: result.questions.map((q, index) => ({
      id: index + 1,
      text: typeof q.text === 'string' && q.text.trim() ? q.text : (() => { throw new Error('A question was missing.'); })(),
      sourceQuote: checkQuote(source, q.sourceQuote),
    })),
  };
}

export function checkFeedback(source, result) {
  if (!['supported', 'partly supported', 'needs work'].includes(result?.level) || typeof result.feedback !== 'string' || !result.feedback.trim()) {
    throw new Error('The feedback response was incomplete. Please retry.');
  }
  return { level: result.level, feedback: result.feedback, sourceQuote: checkQuote(source, result.sourceQuote) };
}
