'use client';

import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import ButtonGroup from '@mui/material/ButtonGroup';
import Drawer from '@mui/material/Drawer';
import { api } from './api';
import { SpacesLibrary, SourcesPanel } from './library';
import SpaceActions from './space-actions';
import QuizView from './quiz-view';
import FlashcardView from './flashcard-view';
import RequestDetails from './request-details';
import type { AppError, Notice, Space, SpaceSummary, StudyDocument } from './types';

type Mode = 'quiz' | 'cards';
type Kind = 'quiz' | 'flashcards';
type View = 'spaces' | 'study';

export default function StudyApp() {
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [space, setSpace] = useState<Space | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
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
          setSourcesOpen(Boolean(validDocument) || !found.space.documents.length);
          setView('study');
        } else { setSpace(null); setView('spaces'); }
      } catch (error) { if (active) report(error); }
    }
    loadLocation();
    window.addEventListener('hashchange', loadLocation);
    return () => { active = false; window.removeEventListener('hashchange', loadLocation); };
  }, []);

  async function selectSpace(id: string) {
    try {
      await openSpace(id);
      setSourcesOpen(false);
      setView('study');
      window.location.hash = id;
    } catch (error) { report(error); }
  }
  function showSpaces() {
    setSpace(null); setSourcesOpen(false); setView('spaces');
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  async function createSpace(title: string) {
    try {
      const result = await api<{ space: Space }>('/api/spaces', { title });
      await openSpace(result.space.id);
      setSourcesOpen(true); setView('study'); window.location.hash = result.space.id;
      setNotice(null);
    } catch (error) { report(error); throw error; }
  }
  async function renameSpace(id: string, title: string) {
    try {
      await api(`/api/spaces/${id}`, { title }, 'PATCH');
      if (space?.id === id) await openSpace(id);
      else await refreshSpaces();
      setNotice(null);
    } catch (error) { report(error); throw error; }
  }
  async function archiveSpace(id: string) {
    try {
      await api(`/api/spaces/${id}`, { archived: true }, 'PATCH');
      await refreshSpaces();
      if (space?.id === id) showSpaces();
      setNotice(null);
    } catch (error) { report(error); throw error; }
  }
  async function restoreSpace(id: string) {
    try {
      await api(`/api/spaces/${id}`, { archived: false }, 'PATCH');
      if (space?.id === id) await openSpace(id);
      else await refreshSpaces();
      setNotice(null);
    } catch (error) { report(error); throw error; }
  }
  async function deleteSpace(id: string) {
    try {
      await api(`/api/spaces/${id}`, undefined, 'DELETE');
      await refreshSpaces();
      if (space?.id === id) showSpaces();
      setNotice(null);
    } catch (error) { report(error); throw error; }
  }
  async function addDocument(file: File) {
    try {
      if (!space) return;
      if (!/\.(txt|md)$/i.test(file.name)) throw new Error('Choose a .txt or .md document.');
      if (file.size > 80000) throw new Error('Choose a smaller text document (20,000 characters maximum).');
      const text = await file.text();
      if (text.trim().length < 120 || text.length > 20000) throw new Error('Use a document between 120 and 20,000 characters.');
      await api<{ document: StudyDocument }>(`/api/spaces/${space.id}/documents`, { name: file.name, text });
      setSourcesOpen(true);
      await openSpace(space.id);
      setNotice(null);
    } catch (error) { report(error); throw error; }
  }
  async function action(path: string, data: unknown, _success: string) {
    try {
      await api(path, data);
      if (space) await openSpace(space.id);
      setNotice(null);
    } catch (error) { report(error); throw error; }
  }
  async function generate(kinds: Kind[]) {
    if (!space || space.archivedAt || !space.documents.length || busy || !kinds.length) return;
    const spaceId = space.id;
    setBusy(true); setFailures([]); setNotice(null);
    try {
      const results = await Promise.allSettled(kinds.map(kind => api(
        `/api/spaces/${spaceId}/${kind === 'quiz' ? 'runs' : 'decks'}`, {})));
      if (results.some((result, index) => result.status === 'fulfilled' && kinds[index] === 'quiz')) setSelectedRunId(null);
      if (results.some((result, index) => result.status === 'fulfilled' && kinds[index] === 'flashcards')) setSelectedDeckId(null);
      if (kinds.length === 1) setMode(kinds[0] === 'quiz' ? 'quiz' : 'cards');
      await openSpace(spaceId);
      const saved = kinds.filter((_, index) => results[index].status === 'fulfilled');
      const failed = kinds.flatMap((kind, index) => results[index].status === 'rejected' ? [{ kind, error: (results[index] as PromiseRejectedResult).reason as AppError }] : []);
      setFailures(failed);
      if (failed.length) setNotice({ text: `${saved.length ? `Saved ${saved.join(' and ')}. ` : ''}${failed.map(item => item.kind).join(' and ')} failed. Retry with its own button.` });
    } catch (error) { report(error); }
    finally { setBusy(false); }
  }
  const hasQuiz = space?.runs.some(run => run.type === 'quiz' && !run.documentId) ?? false;
  const hasDeck = space?.decks?.some(deck => !deck.documentId) ?? false;
  const canGenerate = Boolean(space?.documents.length && !space.archivedAt && space.documents.length <= 6 &&
    space.documents.reduce((total, document) => total + document.text.length, 0) <= 40000);
  const initialKinds: Kind[] = [!hasQuiz && 'quiz', !hasDeck && 'flashcards'].filter(Boolean) as Kind[];

  return <>
    <header className="site-header"><div className="site-header-inner">
      <span className="brand-mark" aria-hidden="true">✦</span><span className="site-title">Adaptive Learning Companion</span>
    </div></header>
    <main>
      <div className="main-column">
        <div id="status" role="status" aria-live="polite">{notice?.text && <p>{notice.text}</p>}{notice?.details && <RequestDetails result={notice.details} />}{failures.map((item, index) => <div key={index}><p>{item.kind}: {item.error.message}</p><RequestDetails result={item.error.details} /></div>)}</div>
        {view === 'spaces' && <SpacesLibrary spaces={spaces} onSpace={selectSpace} onCreateSpace={createSpace} onRename={renameSpace} onArchive={archiveSpace} onRestore={restoreSpace} onDelete={deleteSpace} />}
        {view === 'study' && space && <section id="space" aria-labelledby="active-document-name">
          <div className="study-navigation"><Button variant="text" onClick={showSpaces}>← All spaces</Button><Button variant="outlined" aria-expanded={sourcesOpen} aria-controls="sources-panel" onClick={() => setSourcesOpen(!sourcesOpen)}>Sources ({space.documents.length})</Button></div>
          <Paper className="workspace-header panel" variant="outlined">
            <div className="workspace-title-row"><div>
              <h1 id="active-document-name">{space.title}</h1>
              <p id="document-meta" className="document-summary">{space.archivedAt ? 'Archived · view only' : space.documents.length ? `${space.documents.length} source ${space.documents.length === 1 ? 'document' : 'documents'}` : 'Add a source document to start studying'}</p>
            </div><SpaceActions space={{ id: space.id, title: space.title, archivedAt: space.archivedAt, documentCount: space.documents.length, runCount: space.runs.length, deckCount: space.decks?.length ?? 0 }} onRename={renameSpace} onArchive={archiveSpace} onRestore={restoreSpace} onDelete={deleteSpace} /></div>
            <form id="run-form" className="generation-area" onSubmit={event => { event.preventDefault(); generate(initialKinds); }}>
              <p className="generation-note">{space.archivedAt ? 'Restore this space to generate new study material.' : 'Uses all current documents in this space. Each format makes a separate AI request. Limit: 6 documents and 40,000 characters total.'}{Boolean(space.documents.length) && !space.archivedAt && !canGenerate && ' This space exceeds the generation limit.'}</p>
              <div className="generation-actions">
                {initialKinds.length > 0 && <Button id="start" type="submit" disabled={!canGenerate || busy}>{hasQuiz ? 'Generate flashcards' : hasDeck ? 'Generate quiz' : 'Generate quiz and flashcards'}</Button>}
                <Button id="quiz-only" type="button" variant="outlined" disabled={!canGenerate || busy} onClick={() => generate(['quiz'])}>{hasQuiz ? 'New quiz' : 'Generate quiz'}</Button>
                <Button id="cards-only" type="button" variant="outlined" disabled={!canGenerate || busy} onClick={() => generate(['flashcards'])}>{hasDeck ? 'New deck' : 'Generate flashcards'}</Button>
              </div>
            </form>
          </Paper>
          <Drawer anchor="right" open={sourcesOpen} onClose={() => setSourcesOpen(false)} className="sources-drawer" slotProps={{ paper: { role: 'dialog', 'aria-labelledby': 'sources-title' } }}>
            <SourcesPanel key={space.id} space={space} readOnly={Boolean(space.archivedAt)} onAddDocument={addDocument} onClose={() => setSourcesOpen(false)} />
          </Drawer>
          <div className="mode-header">
            <ButtonGroup className="mode-switch" aria-label="Study mode"><Button id="mode-quiz" type="button" variant={mode === 'quiz' ? 'contained' : 'text'} aria-pressed={mode === 'quiz'} onClick={() => setMode('quiz')}>Quiz</Button><Button id="mode-cards" type="button" variant={mode === 'cards' ? 'contained' : 'text'} aria-pressed={mode === 'cards'} onClick={() => setMode('cards')}>Flashcards</Button></ButtonGroup>
          </div>
          {mode === 'quiz' ? <QuizView space={space} readOnly={Boolean(space.archivedAt)} selectedRunId={selectedRunId} onSelect={setSelectedRunId} onAction={action} />
            : <FlashcardView space={space} readOnly={Boolean(space.archivedAt)} selectedDeckId={selectedDeckId} onSelect={setSelectedDeckId} onAction={action} />}
        </section>}
        <footer>Generated material should be checked against its source.</footer>
      </div>
    </main>
  </>;
}
