'use client';

import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import ButtonGroup from '@mui/material/ButtonGroup';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { api } from './api';
import { SpacesLibrary, DocumentsLibrary } from './library';
import QuizView from './quiz-view';
import FlashcardView from './flashcard-view';
import RequestDetails from './request-details';
import type { AppError, Notice, Space, SpaceSummary, StudyDocument } from './types';

type Mode = 'quiz' | 'cards';
type Kind = 'quiz' | 'flashcards';
type View = 'spaces' | 'documents' | 'study';

export default function StudyApp() {
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [space, setSpace] = useState<Space | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('quiz');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [failures, setFailures] = useState<{ kind: Kind; error: AppError }[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('spaces');

  function report(error: unknown) {
    const cause = error as AppError;
    setNotice({ text: cause.message || 'Something went wrong.', details: cause.details });
  }
  async function refreshSpaces() {
    const result = await api<{ spaces: SpaceSummary[] }>('/api/spaces');
    setSpaces(result.spaces);
    return result.spaces;
  }
  function applySpace(next: Space) {
    setSpace(next);
    setSelectedDocumentId(previous => next.documents.some(item => item.id === previous) ? previous : null);
  }
  async function openSpace(id: string) {
    const result = await api<{ space: Space }>(`/api/spaces/${id}`);
    const next = result.space;
    applySpace(next);
    await refreshSpaces();
    return next;
  }

  useEffect(() => {
    let active = true;
    async function loadLocation() {
      try {
        const result = await api<{ spaces: SpaceSummary[] }>('/api/spaces');
        if (!active) return;
        setSpaces(result.spaces);
        const [spaceId, documentId] = decodeURIComponent(window.location.hash.slice(1)).split('/');
        const chosen = result.spaces.find(item => item.id === spaceId);
        if (chosen) {
          const found = await api<{ space: Space }>(`/api/spaces/${chosen.id}`);
          if (!active) return;
          applySpace(found.space);
          const validDocument = found.space.documents.find(item => item.id === documentId);
          setSelectedDocumentId(validDocument?.id ?? null);
          setView(validDocument ? 'study' : 'documents');
        } else { setSpace(null); setSelectedDocumentId(null); setView('spaces'); }
      } catch (error) { if (active) report(error); }
    }
    loadLocation();
    window.addEventListener('hashchange', loadLocation);
    return () => { active = false; window.removeEventListener('hashchange', loadLocation); };
  }, []);

  async function selectSpace(id: string) {
    try {
      await openSpace(id);
      setSelectedDocumentId(null);
      setView('documents');
      window.location.hash = id;
    } catch (error) { report(error); }
  }
  function selectDocument(id: string) {
    setSelectedDocumentId(id);
    setSelectedRunId(null); setSelectedDeckId(null);
    setView('study');
    if (space) window.location.hash = `${space.id}/${id}`;
  }
  function showSpaces() {
    setSpace(null); setSelectedDocumentId(null); setView('spaces');
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  function showDocuments() {
    if (!space) return;
    setSelectedDocumentId(null); setView('documents'); window.location.hash = space.id;
  }
  async function createSpace(title: string) {
    try {
      const result = await api<{ space: Space }>('/api/spaces', { title });
      await openSpace(result.space.id);
      setSelectedDocumentId(null); setView('documents'); window.location.hash = result.space.id;
      setNotice({ text: 'Study space created.' });
    } catch (error) { report(error); throw error; }
  }
  async function addDocument(file: File) {
    try {
      if (!space) return;
      if (!/\.(txt|md)$/i.test(file.name)) throw new Error('Choose a .txt or .md document.');
      if (file.size > 80000) throw new Error('Choose a smaller text document (20,000 characters maximum).');
      const text = await file.text();
      if (text.trim().length < 120 || text.length > 20000) throw new Error('Use a document between 120 and 20,000 characters.');
      const result = await api<{ document: StudyDocument }>(`/api/spaces/${space.id}/documents`, { name: file.name, text });
      setSelectedDocumentId(result.document.id);
      await openSpace(space.id);
      setView('study'); window.location.hash = `${space.id}/${result.document.id}`;
      setNotice({ text: 'Document saved. Generate study materials when you are ready.' });
    } catch (error) { report(error); throw error; }
  }
  async function action(path: string, data: unknown, success: string) {
    try {
      await api(path, data);
      if (space) await openSpace(space.id);
      setNotice({ text: success });
    } catch (error) { report(error); throw error; }
  }
  async function generate(kinds: Kind[]) {
    if (!space || !selectedDocumentId || busy || !kinds.length) return;
    const spaceId = space.id;
    setBusy(true); setFailures([]); setNotice({ text: `Generating ${kinds.join(' and ')}…` });
    try {
      const results = await Promise.allSettled(kinds.map(kind => api(
        `/api/spaces/${spaceId}/${kind === 'quiz' ? 'runs' : 'decks'}`, { documentId: selectedDocumentId })));
      if (results.some((result, index) => result.status === 'fulfilled' && kinds[index] === 'quiz')) setSelectedRunId(null);
      if (results.some((result, index) => result.status === 'fulfilled' && kinds[index] === 'flashcards')) setSelectedDeckId(null);
      if (kinds.length === 1) setMode(kinds[0] === 'quiz' ? 'quiz' : 'cards');
      await openSpace(spaceId);
      const saved = kinds.filter((_, index) => results[index].status === 'fulfilled');
      const failed = kinds.flatMap((kind, index) => results[index].status === 'rejected' ? [{ kind, error: (results[index] as PromiseRejectedResult).reason as AppError }] : []);
      setFailures(failed);
      setNotice({ text: `${saved.length ? `Saved ${saved.join(' and ')}. ` : ''}${failed.length ? `${failed.map(item => item.kind).join(' and ')} failed. Retry with its own button.` : ''}` });
    } catch (error) { report(error); }
    finally { setBusy(false); }
  }
  const source = space?.documents.find(item => item.id === selectedDocumentId);
  const hasQuiz = space?.runs.some(run => run.documentId === selectedDocumentId && run.type === 'quiz') ?? false;
  const hasDeck = space?.decks?.some(deck => deck.documentId === selectedDocumentId) ?? false;
  const initialKinds: Kind[] = [!hasQuiz && 'quiz', !hasDeck && 'flashcards'].filter(Boolean) as Kind[];

  return <>
    <header className="site-header"><div className="site-header-inner">
      <span className="brand-mark" aria-hidden="true">✦</span><span className="site-title">Adaptive Learning Companion</span>
    </div></header>
    <main>
      <div className="main-column">
        <div id="status" role="status" aria-live="polite">{notice?.text && <Alert severity={failures.length ? 'warning' : 'info'}>{notice.text}</Alert>}{notice?.details && <RequestDetails result={notice.details} />}{failures.map((item, index) => <div key={index}><Alert severity="error">{item.kind}: {item.error.message}</Alert><RequestDetails result={item.error.details} /></div>)}</div>
        {view === 'spaces' && <SpacesLibrary spaces={spaces} onSpace={selectSpace} onCreateSpace={createSpace} />}
        {view === 'documents' && space && <DocumentsLibrary key={space.id} space={space} onBack={showSpaces} onDocument={selectDocument} onAddDocument={addDocument} />}
        {view === 'study' && space && source && <section id="space" aria-labelledby="active-document-name">
          <div className="study-navigation"><Button variant="text" onClick={showDocuments}>← {space.title} documents</Button><label htmlFor="document-switch"><span className="visually-hidden">Switch document</span><select id="document-switch" value={source.id} onChange={event => selectDocument(event.target.value)}>{space.documents.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
          <Paper className="workspace-header panel" variant="outlined">
            <div className="workspace-title-row"><div>
              <h1 id="active-document-name">{source.name}</h1>
              <p id="document-meta" className="document-summary">{source.text.length.toLocaleString()} characters · added {new Date(source.createdAt).toLocaleDateString()}</p>
            </div></div>
            {source && <Accordion id="document-preview" disableGutters elevation={0}><AccordionSummary expandIcon={<ExpandMoreIcon />}>Read source text</AccordionSummary><AccordionDetails><pre id="preview-text">{source.text}</pre></AccordionDetails></Accordion>}
            <form id="run-form" className="generation-area" onSubmit={event => { event.preventDefault(); generate(initialKinds); }}>
              <p className="generation-note">Each format makes a separate AI request.</p>
              <div className="generation-actions">
                {initialKinds.length > 0 && <Button id="start" type="submit" disabled={!source || busy}>{hasQuiz ? 'Generate flashcards' : hasDeck ? 'Generate quiz' : 'Generate quiz and flashcards'}</Button>}
                <Button id="quiz-only" type="button" variant="outlined" disabled={!source || busy} onClick={() => generate(['quiz'])}>{hasQuiz ? 'New quiz' : 'Generate quiz'}</Button>
                <Button id="cards-only" type="button" variant="outlined" disabled={!source || busy} onClick={() => generate(['flashcards'])}>{hasDeck ? 'New deck' : 'Generate flashcards'}</Button>
              </div>
            </form>
          </Paper>
          <div className="mode-header">
            <ButtonGroup className="mode-switch" aria-label="Study mode"><Button id="mode-quiz" type="button" variant={mode === 'quiz' ? 'contained' : 'text'} aria-pressed={mode === 'quiz'} onClick={() => setMode('quiz')}>Quiz</Button><Button id="mode-cards" type="button" variant={mode === 'cards' ? 'contained' : 'text'} aria-pressed={mode === 'cards'} onClick={() => setMode('cards')}>Flashcards</Button></ButtonGroup>
          </div>
          {mode === 'quiz' ? <QuizView space={space} selectedDocumentId={selectedDocumentId} selectedRunId={selectedRunId} onSelect={setSelectedRunId} onAction={action} />
            : <FlashcardView space={space} selectedDocumentId={selectedDocumentId} selectedDeckId={selectedDeckId} onSelect={setSelectedDeckId} onAction={action} />}
        </section>}
        <footer>Generated material should be checked against its source.</footer>
      </div>
    </main>
  </>;
}
