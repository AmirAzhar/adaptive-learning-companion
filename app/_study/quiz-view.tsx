'use client';

import { useState } from 'react';
import RequestDetails from './request-details';
import type { LegacyAttempt, LegacyQuestion, LegacyRun, QuizAttempt, QuizQuestion, QuizRun, Space, StudyRun } from './types';

type Action = (path: string, data: unknown, success: string) => Promise<void>;
type Props = { space: Space; selectedDocumentId: string | null; selectedRunId: string | null; onSelect: (id: string) => void; onAction: Action };

function QuizQuestionForm({ question, attempt, run, spaceId, onAction }: { question: QuizQuestion; attempt?: QuizAttempt; run: QuizRun; spaceId: string; onAction: Action }) {
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (choice === '') return;
    setBusy(true); setError('');
    try { await onAction(`/api/spaces/${spaceId}/runs/${run.id}/answers`, { questionId: question.id, optionIndex: Number(choice) }, 'Quiz answer saved.'); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <form className="question" onSubmit={submit}>
    <h4>{question.id}. {question.text}</h4>
    <fieldset><legend>Choose one answer</legend>{question.options.map((option, index) => <label className="quiz-option" key={index}>
      <input type="radio" name={`answer-${run.id}-${question.id}`} value={index} required={!attempt} disabled={Boolean(attempt) || busy} checked={attempt ? attempt.optionIndex === index : choice === String(index)} onChange={event => setChoice(event.target.value)} /> {option}
    </label>)}</fieldset>
    {attempt ? <div className={`feedback ${attempt.correct ? 'is-correct' : 'is-incorrect'}`}>
      <strong>{attempt.correct ? 'Correct' : 'Incorrect'}</strong>
      <p>You chose: {question.options[attempt.optionIndex]}</p>
      <p>Correct answer: {question.options[question.correctIndex]}</p>
      <p>{question.explanation}</p><blockquote>{question.sourceQuote}</blockquote>
    </div> : <><button type="submit" disabled={busy}>Check answer</button><div aria-live="polite">{busy ? 'Checking answer…' : error}</div></>}
  </form>;
}

function LegacyQuestionForm({ question, attempts, run, spaceId, onAction }: { question: LegacyQuestion; attempts: LegacyAttempt[]; run: LegacyRun; spaceId: string; onAction: Action }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onAction(`/api/spaces/${spaceId}/runs/${run.id}/answers`, { questionId: question.id, answer }, 'Answer saved.'); setAnswer(''); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <form className="question" onSubmit={submit}>
    <h4>{question.id}. {question.text}</h4>
    {attempts.map((attempt, index) => <div className="feedback" key={index}>
      <p>Your answer: {attempt.answer}</p><strong>{attempt.level}</strong><p>{attempt.feedback}</p><blockquote>{attempt.sourceQuote}</blockquote><RequestDetails result={attempt} />
    </div>)}
    <label>{attempts.length ? 'Try again' : 'Your answer'}<textarea rows={3} maxLength={2000} required value={answer} onChange={event => setAnswer(event.target.value)} /></label>
    <button type="submit" disabled={busy}>Check answer</button><div aria-live="polite">{busy ? 'Checking answer…' : error}</div>
  </form>;
}

function Run({ run, space, onAction }: { run: StudyRun; space: Space; onAction: Action }) {
  const [busy, setBusy] = useState(false);
  const quiz = run.type === 'quiz' ? run as QuizRun : null;
  const legacy = quiz ? null : run as LegacyRun;
  const round = quiz?.currentRound ?? 1;
  const ids = quiz ? quiz.practiceQuestionIds ?? quiz.questions.map(question => question.id) : [];
  const roundAttempts = quiz ? quiz.attempts.filter(attempt => (attempt.round ?? 1) === round) : [];
  const nextId = quiz ? ids.find(id => !roundAttempts.some(attempt => attempt.questionId === id)) : undefined;
  const latestId = roundAttempts.at(-1)?.questionId;
  const source = space.documents.find(item => item.id === run.documentId);
  const answered = quiz ? quiz.questions.filter(question => ids.includes(question.id) && roundAttempts.some(attempt => attempt.questionId === question.id && question.id !== latestId)) : [];
  const visible = quiz ? quiz.questions.filter(question => ids.includes(question.id) && (question.id === latestId || question.id === nextId)) : [];
  const complete = Boolean(quiz) && ids.every(id => roundAttempts.some(attempt => attempt.questionId === id));
  const missed = quiz && complete ? ids.filter(id => ![...roundAttempts].reverse().find(attempt => attempt.questionId === id)?.correct) : [];

  async function practice() {
    setBusy(true);
    try { await onAction(`/api/spaces/${space.id}/runs/${run.id}/practice`, {}, 'Practice round ready.'); }
    catch { /* The parent shows the API error in the page status. */ }
    finally { setBusy(false); }
  }

  return <article className="panel run">
    <div className="run-header"><h3>{source?.name || 'Document'} · {new Date(run.createdAt).toLocaleString()}</h3><span className="run-badge">{run.type === 'quiz' ? `Quiz · round ${round}` : 'Open-ended · 3 questions'}</span></div>
    <strong className="overview-label">Main ideas</strong><p className="run-overview">{run.overview}</p><RequestDetails result={run} />
    {quiz ? <>
      <p className="quiz-progress">{ids.filter(id => roundAttempts.some(attempt => attempt.questionId === id)).length} of {ids.length} questions answered in this round</p>
      {visible.map(question => <QuizQuestionForm key={`${run.id}-${round}-${question.id}`} question={question} attempt={roundAttempts.find(attempt => attempt.questionId === question.id)} run={quiz} spaceId={space.id} onAction={onAction} />)}
      {roundAttempts.length > 1 && <details className="quiz-history answered-questions"><summary>Earlier answers</summary>
        {answered.map(question => <QuizQuestionForm key={question.id} question={question} attempt={roundAttempts.find(attempt => attempt.questionId === question.id)} run={quiz} spaceId={space.id} onAction={onAction} />)}
      </details>}
      {complete && <div className="round-result"><strong>{missed.length ? `${ids.length - missed.length} of ${ids.length} correct · ${missed.length} to practice` : 'All questions correct in this round'}</strong>
        {missed.length > 0 && <button type="button" disabled={busy} onClick={practice}>Practice missed questions</button>}</div>}
      {round > 1 && <details className="quiz-history"><summary>Previous rounds</summary>
        {quiz.attempts.filter(attempt => (attempt.round ?? 1) < round).map((attempt, index) => <p key={index}>Round {attempt.round ?? 1} · Question {attempt.questionId}: {attempt.correct ? 'Correct' : 'Incorrect'}</p>)}
      </details>}
    </> : legacy?.questions.map(question => <LegacyQuestionForm key={question.id} question={question} attempts={legacy.attempts.filter(attempt => attempt.questionId === question.id)} run={legacy} spaceId={space.id} onAction={onAction} />)}
  </article>;
}

export default function QuizView({ space, selectedDocumentId, selectedRunId, onSelect, onAction }: Props) {
  const runs = space.runs.filter(run => run.documentId === selectedDocumentId);
  const reversed = [...runs].reverse();
  const chosen = runs.find(run => run.id === selectedRunId) ?? reversed[0];
  return <section id="quiz-pane" className="study-pane" aria-label="Quiz practice">
    <div className="study-pane-heading"><div><h3>Quiz</h3><p>Choose an answer, then check the explanation and source.</p></div>
      {runs.length > 1 && <div id="quiz-picker-wrap" className="history-picker"><label htmlFor="quiz-picker">Saved quiz</label>
        <select id="quiz-picker" value={chosen.id} onChange={event => onSelect(event.target.value)}>{reversed.map((run, index) => <option key={run.id} value={run.id}>{run.type === 'quiz' ? 'Quiz' : 'Open-ended'} {runs.length - index} · {new Date(run.createdAt).toLocaleString()}</option>)}</select>
      </div>}
    </div>
    <div id="runs">{chosen ? <Run key={chosen.id} run={chosen} space={space} onAction={onAction} /> : selectedDocumentId ? 'No quiz for this document yet. Generate one above to start practicing.' : 'Add a document from the library to make a quiz.'}</div>
  </section>;
}
