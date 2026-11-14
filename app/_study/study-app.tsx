'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import Library from './library';
import QuizView from './quiz-view';
import FlashcardView from './flashcard-view';
import RequestDetails from './request-details';
import type { AppError, Notice, Space, SpaceSummary, StudyDocument } from './types';

type Mode = 'quiz' | 'cards';
type Kind = 'quiz' | 'flashcards';

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
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    window.location.hash = next.id;
    setSelectedDocumentId(previous => next.documents.some(item => item.id === previous) ? previous : next.documents[0]?.id ?? null);
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
    async function load() {
      try {
        const result = await api<{ spaces: SpaceSummary[] }>('/api/spaces');
        if (!active) return;
        setSpaces(result.spaces);
        const chosen = result.spaces.find(item => item.id === window.location.hash.slice(1)) ?? result.spaces[0];
        if (chosen) {
          const found = await api<{ space: Space }>(`/api/spaces/${chosen.id}`);
          if (!active) return;
          applySpace(found.space);
          if (!found.space.documents.length) setDrawerOpen(true);
        } else setDrawerOpen(true);
      } catch (error) { if (active) report(error); }
    }
    load();
    return () => { active = false; };
  }, []);

  async function selectSpace(id: string) {
    try {
      const next = await openSpace(id);
      setDrawerOpen(!next.documents.length);
    } catch (error) { report(error); }
  }
  function selectDocument(id: string) {
    setSelectedDocumentId(id);
    setDrawerOpen(false);
  }
  async function createSpace(title: string) {
    try {
      const result = await api<{ space: Space }>('/api/spaces', { title });
      await openSpace(result.space.id);
      setDrawerOpen(true);
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
      setDrawerOpen(false);
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
      <span className="brand-mark" aria-hidden="true">✦</span><div><p className="eyebrow">Adaptive Learning Companion</p><p className="site-title">Study spaces</p></div>
      <p className="site-tagline">Turn notes into practice worth returning to.</p>
      <button id="library-toggle" type="button" aria-controls="library-sidebar" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(!drawerOpen)}><svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 5h14M3 10h14M3 15h14"/></svg>Library</button>
    </div></header>
    <main>
      <Library open={drawerOpen} onOpenChange={setDrawerOpen} spaces={spaces} space={space} selectedDocumentId={selectedDocumentId} onSpace={selectSpace} onDocument={selectDocument} onCreateSpace={createSpace} onAddDocument={addDocument} />
      <div className="main-column">
        <div id="status" role="status" aria-live="polite">{notice?.text}{notice?.details && <RequestDetails result={notice.details} />}{failures.map((item, index) => <div key={index}><p>{item.kind}: {item.error.message}</p><RequestDetails result={item.error.details} /></div>)}</div>
        {space && <section id="space" aria-labelledby="active-document-name">
          <div className="workspace-header panel">
            <p id="space-name" className="workspace-breadcrumb">{space.title}</p>
            <div className="workspace-title-row"><div><span className="eyebrow">Current document</span>
              <h1 id="active-document-name">{source?.name ?? (space.documents.length ? 'Choose a document' : 'Add your first document')}</h1>
              <p id="document-meta" className="document-summary">{source ? `${source.text.length.toLocaleString()} characters · added ${new Date(source.createdAt).toLocaleDateString()}` : 'Choose a .txt or .md file from the library.'}</p>
            </div><div className="workspace-accent" aria-hidden="true">✦</div></div>
            {source && <details id="document-preview"><summary>Read source text</summary><pre id="preview-text">{source.text}</pre></details>}
            <form id="run-form" className="generation-area" onSubmit={event => { event.preventDefault(); generate(initialKinds); }}>
              <p className="generation-note">Generate study material from this document. Each format makes a separate OpenAI request.</p>
              <div className="generation-actions">
                {initialKinds.length > 0 && <button id="start" type="submit" disabled={!source || busy}>{hasQuiz ? 'Generate flashcards' : hasDeck ? 'Generate quiz' : 'Generate quiz and flashcards'}</button>}
                <button id="quiz-only" type="button" className="secondary" disabled={!source || busy} onClick={() => generate(['quiz'])}>{hasQuiz ? 'New quiz' : 'Generate quiz'}</button>
                <button id="cards-only" type="button" className="secondary" disabled={!source || busy} onClick={() => generate(['flashcards'])}>{hasDeck ? 'New deck' : 'Generate flashcards'}</button>
              </div>
            </form>
          </div>
          <div className="mode-header"><div><span className="eyebrow">Practice</span><h2>Study this document</h2></div>
            <div className="mode-switch" aria-label="Study mode"><button id="mode-quiz" type="button" aria-pressed={mode === 'quiz'} onClick={() => setMode('quiz')}>Quiz</button><button id="mode-cards" type="button" aria-pressed={mode === 'cards'} onClick={() => setMode('cards')}>Flashcards</button></div>
          </div>
          {mode === 'quiz' ? <QuizView space={space} selectedDocumentId={selectedDocumentId} selectedRunId={selectedRunId} onSelect={setSelectedRunId} onAction={action} />
            : <FlashcardView space={space} selectedDocumentId={selectedDocumentId} selectedDeckId={selectedDeckId} onSelect={setSelectedDeckId} onAction={action} />}
        </section>}
        <footer>Generated material should be checked against its source.</footer>
      </div>
    </main>
  </>;
}
