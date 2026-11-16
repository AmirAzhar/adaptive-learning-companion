import { randomUUID } from 'node:crypto';
import { checkFlashcards, coveragePlan, generationDocuments, generationTargets, mergeCoverage } from '../study.js';
import { generateFlashcards } from '../model.js';
import { findSpace, readSpaces, updateSpaces } from '../store.js';
import { body, json, modelResult } from '../http.js';

function requireActive(space) {
  if (space.archivedAt) throw new Error('Restore this study space before making changes.');
  return space;
}

export async function handleFlashcards(request) {
  const pathname = new URL(request.url).pathname;
  const deckRoute = /^\/api\/spaces\/([a-f0-9-]+)\/decks$/.exec(pathname);
  if (request.method === 'POST' && deckRoute) {
    const input = await body(request);
    const space = requireActive(findSpace(await readSpaces(), deckRoute[1]));
    const documents = generationDocuments(space, input);
    const source = input.documentId ? documents[0].text : documents;
    const generated = await generateFlashcards(source);
    return await modelResult(generated, (output) => checkFlashcards(source, output), async (result) => {
      const target = generationTargets(source).cards;
      const { kept, missing } = coveragePlan(documents, result.cards, target);
      if (missing.length) {
        try {
          const extra = await generateFlashcards(missing, { target: missing.length });
          result.apiCalls = [
            { apiRequest: result.apiRequest, usage: result.usage, estimatedCostUsd: result.estimatedCostUsd },
            { apiRequest: extra.requestBody, usage: extra.usage, estimatedCostUsd: extra.estimatedCostUsd },
          ];
          const checked = checkFlashcards(missing, extra.output, missing.length);
          const merged = mergeCoverage(kept, checked.cards, 'front', target);
          if (new Set(merged.map((item) => item.documentId)).size > new Set(result.cards.map((item) => item.documentId)).size)
            result.cards = merged;
        } catch { /* Keep the valid first result and show its actual source coverage. */ }
      }
      const deck = { id: randomUUID(), ...(input.documentId ? { documentId: input.documentId } : { documentIds: documents.map((document) => document.id) }), createdAt: new Date().toISOString(),
        ...result, reviews: [], currentRound: 1, reviewCardIds: result.cards.map((card) => card.id) };
      await updateSpaces((spaces) => {
        const current = requireActive(findSpace(spaces, deckRoute[1]));
        (current.decks ??= []).push(deck);
        current.updatedAt = deck.createdAt;
      });
      result.id = deck.id;
    });
  }
  const cardEditRoute = /^\/api\/spaces\/([a-f0-9-]+)\/decks\/([a-f0-9-]+)\/cards\/([1-9]|1[0-9]|20)$/.exec(pathname);
  if (request.method === 'POST' && cardEditRoute) {
    const input = await body(request);
    const front = typeof input.front === 'string' ? input.front.trim() : '';
    const back = typeof input.back === 'string' ? input.back.trim() : '';
    if (!front || front.length > 500 || !back || back.length > 2000)
      throw new Error('Write a question under 500 characters and an answer under 2,000 characters.');
    await updateSpaces((spaces) => {
      const space = requireActive(findSpace(spaces, cardEditRoute[1]));
      const deck = (space.decks ?? []).find((item) => item.id === cardEditRoute[2]);
      const card = deck?.cards.find((item) => item.id === Number(cardEditRoute[3]));
      if (!card) throw new Error('Flashcard not found.');
      if (deck.cards.some((item) => item.id !== card.id && item.front.toLowerCase() === front.toLowerCase()))
        throw new Error('A flashcard already has that question.');
      card.front = front;
      card.back = back;
      space.updatedAt = new Date().toISOString();
    });
    return json(200, { saved: true });
  }
  const cardReviewRoute = /^\/api\/spaces\/([a-f0-9-]+)\/decks\/([a-f0-9-]+)\/cards\/([1-9]|1[0-9]|20)\/reviews$/.exec(pathname);
  if (request.method === 'POST' && cardReviewRoute) {
    const input = await body(request);
    if (!['again', 'good'].includes(input.rating)) throw new Error('Choose Again or Good.');
    let review;
    await updateSpaces((spaces) => {
      const space = requireActive(findSpace(spaces, cardReviewRoute[1]));
      const deck = (space.decks ?? []).find((item) => item.id === cardReviewRoute[2]);
      const cardId = Number(cardReviewRoute[3]);
      if (!deck || !deck.reviewCardIds.includes(cardId)) throw new Error('Flashcard not found in this review round.');
      if (deck.reviews.some((item) => item.round === deck.currentRound && item.cardId === cardId))
        throw new Error('This flashcard is complete in the current round.');
      review = { id: randomUUID(), cardId, rating: input.rating,
        round: deck.currentRound, createdAt: new Date().toISOString() };
      deck.reviews.push(review);
      space.updatedAt = review.createdAt;
    });
    return json(200, review);
  }
  const reviewRoundRoute = /^\/api\/spaces\/([a-f0-9-]+)\/decks\/([a-f0-9-]+)\/review$/.exec(pathname);
  if (request.method === 'POST' && reviewRoundRoute) {
    const input = await body(request);
    if (!['again', 'all'].includes(input.scope)) throw new Error('Choose cards to review.');
    let result;
    await updateSpaces((spaces) => {
      const space = requireActive(findSpace(spaces, reviewRoundRoute[1]));
      const deck = (space.decks ?? []).find((item) => item.id === reviewRoundRoute[2]);
      if (!deck) throw new Error('Flashcard deck not found.');
      const current = deck.reviewCardIds.map((cardId) =>
        deck.reviews.find((item) => item.round === deck.currentRound && item.cardId === cardId));
      if (current.some((item) => !item)) throw new Error('Finish this review round first.');
      const cardIds = input.scope === 'all' ? deck.cards.map((card) => card.id) :
        current.filter((item) => item.rating === 'again').map((item) => item.cardId);
      if (!cardIds.length) throw new Error('There are no Again cards to review.');
      deck.currentRound++;
      deck.reviewCardIds = cardIds;
      space.updatedAt = new Date().toISOString();
      result = { currentRound: deck.currentRound, cardIds };
    });
    return json(200, result);
  }
  return null;
}
