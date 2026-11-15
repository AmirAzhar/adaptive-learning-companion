export function checkSource(source) {
  if (typeof source !== 'string' || source.trim().length < 120 || source.length > 20000) {
    throw new Error('Use study material between 120 and 20,000 characters.');
  }
  return source.trim();
}

export function checkQuote(source, quote) {
  if (typeof quote !== 'string' || quote.length < 12 || !source.replace(/\s+/g, ' ').includes(quote.replace(/\s+/g, ' '))) {
    throw new Error('The generated reference could not be found in the passage. Please retry.');
  }
  return quote;
}

export function sourceChunks(source) {
  let remaining = source.replace(/\s+/g, ' ').trim();
  const chunks = [];
  let lastSplitWithinWord = false;
  while (remaining.length > 420) {
    const sentenceEnd = Math.max(remaining.lastIndexOf('. ', 420), remaining.lastIndexOf('? ', 420), remaining.lastIndexOf('! ', 420));
    const spaceEnd = remaining.lastIndexOf(' ', 420);
    const cut = sentenceEnd >= 200 ? sentenceEnd + 1 : spaceEnd >= 200 ? spaceEnd : 420;
    chunks.push(remaining.slice(0, cut));
    lastSplitWithinWord = remaining[cut] !== ' ';
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length < 12 && chunks.length) chunks[chunks.length - 1] += `${lastSplitWithinWord ? '' : ' '}${remaining}`;
  else if (remaining) chunks.push(remaining);
  return chunks;
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

export function checkQuiz(source, result) {
  if (typeof result?.overview !== 'string' || !result.overview.trim()) {
    throw new Error('The quiz response was incomplete. Please retry.');
  }
  const chunks = sourceChunks(source);
  return {
    overview: result.overview.trim(),
    questions: ['question1', 'question2', 'question3'].map((key, index) => {
      const question = result[key];
      const options = ['optionA', 'optionB', 'optionC', 'optionD'].map((name) => question?.[name]);
      if (typeof question?.text !== 'string' || !question.text.trim() ||
          options.some((option) => typeof option !== 'string' || !option.trim()) ||
          new Set(options.map((option) => option.trim().toLowerCase())).size !== 4 ||
          !['A', 'B', 'C', 'D'].includes(question.correctOption) ||
          typeof question.explanation !== 'string' || !question.explanation.trim() ||
          !Number.isInteger(question.sourceId) || question.sourceId < 1 || question.sourceId > chunks.length) {
        throw new Error('A quiz question was incomplete or ambiguous. Please retry.');
      }
      return { id: index + 1, text: question.text.trim(), options: options.map((option) => option.trim()),
        correctIndex: 'ABCD'.indexOf(question.correctOption), explanation: question.explanation.trim(),
        sourceQuote: checkQuote(source, chunks[question.sourceId - 1]) };
    }),
  };
}

export function checkFlashcards(source, result) {
  const chunks = sourceChunks(source);
  const cards = ['card1', 'card2', 'card3', 'card4', 'card5'].map((key, index) => {
    const card = result?.[key];
    if (typeof card?.front !== 'string' || !card.front.trim() || card.front.length > 500 ||
        typeof card.back !== 'string' || !card.back.trim() || card.back.length > 2000 ||
        !Number.isInteger(card.sourceId) || card.sourceId < 1 || card.sourceId > chunks.length) {
      throw new Error('A flashcard was incomplete. Please retry.');
    }
    return { id: index + 1, front: card.front.trim(), back: card.back.trim(),
      sourceQuote: checkQuote(source, chunks[card.sourceId - 1]) };
  });
  if (new Set(cards.map((card) => card.front.toLowerCase())).size !== cards.length)
    throw new Error('The flashcards contained duplicate questions. Please retry.');
  return { cards };
}

export function checkFeedback(source, result) {
  if (!['supported', 'partly supported', 'needs work'].includes(result?.level) || typeof result.feedback !== 'string' || !result.feedback.trim()) {
    throw new Error('The feedback response was incomplete. Please retry.');
  }
  return { level: result.level, feedback: result.feedback, sourceQuote: checkQuote(source, result.sourceQuote) };
}
