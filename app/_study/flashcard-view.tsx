'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
    <TextField label={`Card ${card.id} · Question`} multiline fullWidth required value={front} onChange={event => setFront(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
    <TextField label="Answer" multiline fullWidth required value={back} onChange={event => setBack(event.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
    <blockquote>{card.sourceQuote}</blockquote><Button type="submit" disabled={busy}>Save card</Button><span className="edit-feedback">{feedback}</span>
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
  return <Paper component="section" className="flashcard-review" variant="outlined"><h4>{card.front}</h4>
    {!revealed ? <Button type="button" onClick={() => setRevealed(true)}>Reveal answer</Button> : <div>
      <p className="card-answer">{card.back}</p><blockquote>{card.sourceQuote}</blockquote>
      <div className="generation-actions"><Button type="button" variant="outlined" disabled={busy} onClick={() => rate('again')}>Again</Button><Button type="button" disabled={busy} onClick={() => rate('good')}>Good</Button></div>
    </div>}
  </Paper>;
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
  return <Paper component="article" className="panel run" elevation={0}>
    <h3>{source?.name || 'Document'} · {new Date(deck.createdAt).toLocaleString()}</h3>
    <RequestDetails result={deck} />
    <Accordion className="card-editor" disableGutters elevation={0}><AccordionSummary expandIcon={<ExpandMoreIcon />}>Edit {deck.cards.length} cards and check sources</AccordionSummary><AccordionDetails>
      {deck.cards.map(card => <CardEdit key={card.id} card={card} deck={deck} spaceId={space.id} onAction={onAction} />)}
    </AccordionDetails></Accordion>
    <p className="quiz-progress">Review round {deck.currentRound} · {roundReviews.length} of {deck.reviewCardIds.length} rated</p>
    {card ? <ReviewCard key={`${deck.currentRound}-${card.id}`} deck={deck} card={card} spaceId={space.id} onAction={onAction} /> : <>
      <p>{roundReviews.length - againCount} Good · {againCount} Again</p>
      {againCount > 0 && <Button type="button" disabled={busy} onClick={() => review('again')}>Review Again cards</Button>}{' '}
      <Button type="button" variant="outlined" disabled={busy} onClick={() => review('all')}>Study all cards again</Button>
    </>}
    {deck.currentRound > 1 && <Accordion className="quiz-history" disableGutters elevation={0}><AccordionSummary expandIcon={<ExpandMoreIcon />}>Previous reviews</AccordionSummary><AccordionDetails>
      {deck.reviews.filter(item => item.round < deck.currentRound).map((item, index) => <p key={index}>Round {item.round} · Card {item.cardId}: {item.rating === 'again' ? 'Again' : 'Good'}</p>)}
    </AccordionDetails></Accordion>}
  </Paper>;
}

export default function FlashcardView({ space, selectedDocumentId, selectedDeckId, onSelect, onAction }: Props) {
  const decks = (space.decks ?? []).filter(deck => deck.documentId === selectedDocumentId);
  const reversed = [...decks].reverse();
  const chosen = decks.find(deck => deck.id === selectedDeckId) ?? reversed[0];
  return <section id="cards-pane" className="study-pane" aria-label="Flashcard practice">
    <div className="study-pane-heading"><div><h3>Flashcards</h3><p>Think of your answer before you reveal it, then choose Again or Good.</p></div>
      {decks.length > 1 && <div id="deck-picker-wrap" className="history-picker">
        <TextField id="deck-picker" label="Saved deck" select fullWidth size="small" slotProps={{ select: { native: true } }} value={chosen.id} onChange={event => onSelect(event.target.value)}>{reversed.map((deck, index) => <option key={deck.id} value={deck.id}>Deck {decks.length - index} · {new Date(deck.createdAt).toLocaleString()}</option>)}</TextField>
      </div>}
    </div>
    <div id="decks">{chosen ? <DeckView key={chosen.id} deck={chosen} space={space} onAction={onAction} /> : selectedDocumentId ? 'No flashcards for this document yet. Generate a deck above to start reviewing.' : 'Add a document from the library to make flashcards.'}</div>
  </section>;
}
