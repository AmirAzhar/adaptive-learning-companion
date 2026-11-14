'use client';

import { useState } from 'react';
import RequestDetails from './request-details';
import type { AppError, Deck, Flashcard, Space } from './types';

type Action = (path: string, data: unknown, success: string) => Promise<void>;
type Props = { space: Space; selectedDocumentId: string | null; selectedDeckId: string | null; onSelect: (id: string) => void; onAction: Action };

function CardEdit({ card, deck, spaceId, onAction }: { card: Flashcard; deck: Deck; spaceId: string; onAction: Action }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setFeedback('');
    try {
      await onAction(`/api/spaces/${spaceId}/decks/${deck.id}/cards/${card.id}`, { front, back }, 'Card saved.');
      setFeedback('Saved');
    } catch (cause) { setFeedback((cause as AppError).message); }
    finally { setBusy(false); }
  }
  return <form className="card-edit-form" onSubmit={save}>
    <label>Card {card.id} · Question<textarea value={front} onChange={event => setFront(event.target.value)} maxLength={500} required /></label>
    <label>Answer<textarea value={back} onChange={event => setBack(event.target.value)} maxLength={2000} required /></label>
    <blockquote>{card.sourceQuote}</blockquote><button type="submit" disabled={busy}>Save card</button><span className="edit-feedback">{feedback}</span>
  </form>;
}

function ReviewCard({ deck, card, spaceId, onAction }: { deck: Deck; card: Flashcard; spaceId: string; onAction: Action }) {
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function rate(rating: 'again' | 'good') {
    setBusy(true);
    try { await onAction(`/api/spaces/${spaceId}/decks/${deck.id}/cards/${card.id}/reviews`, { rating }, `Rated ${rating}.`); }
    catch { /* The parent shows the API error in the page status. */ }
    finally { setBusy(false); }
  }
  return <section className="flashcard-review"><h4>{card.front}</h4>
    {!revealed ? <button type="button" onClick={() => setRevealed(true)}>Reveal answer</button> : <div>
      <p className="card-answer">{card.back}</p><blockquote>{card.sourceQuote}</blockquote>
      <div className="generation-actions"><button type="button" disabled={busy} onClick={() => rate('again')}>Again</button><button type="button" disabled={busy} onClick={() => rate('good')}>Good</button></div>
    </div>}
  </section>;
}

function DeckView({ deck, space, onAction }: { deck: Deck; space: Space; onAction: Action }) {
  const [busy, setBusy] = useState(false);
  const source = space.documents.find(item => item.id === deck.documentId);
  const roundReviews = deck.reviews.filter(review => review.round === deck.currentRound);
  const nextId = deck.reviewCardIds.find(id => !roundReviews.some(review => review.cardId === id));
  const card = deck.cards.find(item => item.id === nextId);
  const againCount = roundReviews.filter(review => review.rating === 'again').length;
  async function review(scope: 'again' | 'all') {
    setBusy(true);
    try { await onAction(`/api/spaces/${space.id}/decks/${deck.id}/review`, { scope }, 'Review round ready.'); }
    catch { /* The parent shows the API error in the page status. */ }
    finally { setBusy(false); }
  }
  return <article className="panel run">
    <h3>{source?.name || 'Document'} · {new Date(deck.createdAt).toLocaleString()}</h3>
    <RequestDetails result={deck} />
    <details className="card-editor"><summary>Edit {deck.cards.length} cards and check sources</summary>
      {deck.cards.map(card => <CardEdit key={card.id} card={card} deck={deck} spaceId={space.id} onAction={onAction} />)}
    </details>
    <p className="quiz-progress">Review round {deck.currentRound} · {roundReviews.length} of {deck.reviewCardIds.length} rated</p>
    {card ? <ReviewCard key={`${deck.currentRound}-${card.id}`} deck={deck} card={card} spaceId={space.id} onAction={onAction} /> : <>
      <p>{roundReviews.length - againCount} Good · {againCount} Again</p>
      {againCount > 0 && <button type="button" disabled={busy} onClick={() => review('again')}>Review Again cards</button>}{' '}
      <button type="button" className="secondary" disabled={busy} onClick={() => review('all')}>Study all cards again</button>
    </>}
    {deck.currentRound > 1 && <details className="quiz-history"><summary>Previous reviews</summary>
      {deck.reviews.filter(item => item.round < deck.currentRound).map((item, index) => <p key={index}>Round {item.round} · Card {item.cardId}: {item.rating === 'again' ? 'Again' : 'Good'}</p>)}
    </details>}
  </article>;
}

export default function FlashcardView({ space, selectedDocumentId, selectedDeckId, onSelect, onAction }: Props) {
  const decks = (space.decks ?? []).filter(deck => deck.documentId === selectedDocumentId);
  const reversed = [...decks].reverse();
  const chosen = decks.find(deck => deck.id === selectedDeckId) ?? reversed[0];
  return <section id="cards-pane" className="study-pane" aria-label="Flashcard practice">
    <div className="study-pane-heading"><div><h3>Flashcards</h3><p>Think of your answer before you reveal it, then choose Again or Good.</p></div>
      {decks.length > 1 && <div id="deck-picker-wrap" className="history-picker"><label htmlFor="deck-picker">Saved deck</label>
        <select id="deck-picker" value={chosen.id} onChange={event => onSelect(event.target.value)}>{reversed.map((deck, index) => <option key={deck.id} value={deck.id}>Deck {decks.length - index} · {new Date(deck.createdAt).toLocaleString()}</option>)}</select>
      </div>}
    </div>
    <div id="decks">{chosen ? <DeckView key={chosen.id} deck={chosen} space={space} onAction={onAction} /> : selectedDocumentId ? 'No flashcards for this document yet. Generate a deck above to start reviewing.' : 'Add a document from the library to make flashcards.'}</div>
  </section>;
}
