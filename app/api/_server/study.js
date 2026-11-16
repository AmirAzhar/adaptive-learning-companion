export function checkSource(source) {
  if (typeof source !== 'string' || source.trim().length < 120 || source.length > 20000) {
    throw new Error('Use study material between 120 and 20,000 characters.');
  }
  return source.trim();
}

export function generationDocuments(space, input) {
  if (input.documentId && input.documentIds) throw new Error('Choose one source selection.');
  if (input.documentIds && (!Array.isArray(input.documentIds) || !input.documentIds.length ||
    input.documentIds.some((id) => typeof id !== 'string') || new Set(input.documentIds).size !== input.documentIds.length))
    throw new Error('Choose at least one distinct source document.');
  const documents = space.documents.filter((item) => !item.removedAt &&
    (input.documentId ? item.id === input.documentId : input.documentIds ? input.documentIds.includes(item.id) : true));
  if (!documents.length) throw new Error(input.documentId ? 'Document not found.' : 'Add a document before generating study material.');
  if (input.documentIds && documents.length !== input.documentIds.length) throw new Error('One or more selected documents were not found.');
  if (documents.reduce((total, document) => total + document.text.length, 0) > 40000)
    throw new Error('A study space can use up to 40,000 characters for generation.');
  return documents;
}

export function generationTargets(source) {
  const characters = typeof source === 'string' ? source.length : source.reduce((total, document) => total + document.text.length, 0);
  return { questions: Math.min(10, Math.max(1, Math.ceil(characters / 2500))),
    cards: Math.min(20, Math.max(1, Math.ceil(characters / 1250))) };
}

export function coveragePlan(documents, items, target) {
  if (documents.length < 2 || documents.length > target) return { kept: items, missing: [] };
  const covered = new Set(items.map((item) => item.documentId));
  const missing = documents.filter((document) => !covered.has(document.id));
  const kept = [...items];
  while (target - kept.length < missing.length) {
    const counts = new Map(documents.map((document) =>
      [document.id, kept.filter((item) => item.documentId === document.id).length]));
    const index = kept.findLastIndex((item) => counts.get(item.documentId) > 1);
    if (index < 0) break;
    kept.splice(index, 1);
  }
  return { kept, missing: missing.slice(0, target - kept.length) };
}

export function mergeCoverage(kept, added, field, target) {
  const seen = new Set(kept.map((item) => item[field].toLowerCase()));
  const combined = [...kept];
  for (const item of added) {
    const key = item[field].toLowerCase();
    if (combined.length === target || seen.has(key)) continue;
    combined.push(item);
    seen.add(key);
  }
  return combined.map((item, index) => ({ ...item, id: index + 1 }));
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

export function sourceBlocks(documents) {
  return documents.flatMap((document) => sourceChunks(document.text).map((text) => ({
    id: 0, documentId: document.id, documentName: document.name, text,
  }))).map((block, index) => ({ ...block, id: index + 1 }));
}

function citedSource(source, sourceId) {
  const documents = typeof source === 'string' ? [{ id: null, name: '', text: source }] : source;
  const block = sourceBlocks(documents)[sourceId - 1];
  if (!block) throw new Error('A generated source reference was invalid. Please retry.');
  return { documentId: block.documentId, sourceQuote: checkQuote(
    documents.find((document) => document.id === block.documentId).text, block.text) };
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

export function checkQuiz(source, result, maxQuestions = generationTargets(source).questions) {
  if (typeof result?.overview !== 'string' || !result.overview.trim()) {
    throw new Error('The quiz response was incomplete. Please retry.');
  }
  const chunks = typeof source === 'string' ? sourceChunks(source) : sourceBlocks(source);
  const questions = result.questions;
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > maxQuestions)
    throw new Error('The quiz had an invalid number of questions. Please retry.');
  const checked = questions.map((question, index) => {
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
        ...citedSource(source, question.sourceId) };
    });
  if (new Set(checked.map((question) => question.text.toLowerCase())).size !== checked.length)
    throw new Error('The quiz contained duplicate questions. Please retry.');
  return { overview: result.overview.trim(), questions: checked };
}

export function checkFlashcards(source, result, maxCards = generationTargets(source).cards) {
  const chunks = typeof source === 'string' ? sourceChunks(source) : sourceBlocks(source);
  if (!Array.isArray(result?.cards) || result.cards.length < 1 || result.cards.length > maxCards)
    throw new Error('The deck had an invalid number of cards. Please retry.');
  const cards = result.cards.map((card, index) => {
    if (typeof card?.front !== 'string' || !card.front.trim() || card.front.length > 500 ||
        typeof card.back !== 'string' || !card.back.trim() || card.back.length > 2000 ||
        !Number.isInteger(card.sourceId) || card.sourceId < 1 || card.sourceId > chunks.length) {
      throw new Error('A flashcard was incomplete. Please retry.');
    }
    return { id: index + 1, front: card.front.trim(), back: card.back.trim(),
      ...citedSource(source, card.sourceId) };
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
