'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import type { Space, SpaceSummary, StudyDocument } from './types';

type SpacesProps = { spaces: SpaceSummary[]; onSpace: (id: string) => void; onCreateSpace: (title: string) => Promise<void> };

export function SpacesLibrary({ spaces, onSpace, onCreateSpace }: SpacesProps) {
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const shown = spaces.filter(item => item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await onCreateSpace(title); setTitle(''); }
    catch { /* The parent displays the error. */ }
    finally { setBusy(false); }
  }
  return <section className="library-page" aria-labelledby="spaces-title">
    <div className="library-page-heading"><h1 id="spaces-title">Study spaces</h1><Button variant="contained" onClick={() => setCreating(!creating)} aria-expanded={creating} aria-controls="create-space-form">{creating ? 'Cancel' : 'New space'}</Button></div>
    {creating && <form id="create-space-form" onSubmit={create} className="library-create-form"><TextField autoFocus label="Space name" size="small" value={title} onChange={event => setTitle(event.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} required placeholder="e.g. Database Systems" /><Button type="submit" variant="contained" disabled={busy}>Create space</Button></form>}
    <div className="library-list-heading"><h2>All spaces <span>({spaces.length})</span></h2>{spaces.length > 0 && <TextField label="Find a space" size="small" value={query} onChange={event => setQuery(event.target.value)} />}</div>
    <div className="library-list">{shown.map(item => <Paper key={item.id} variant="outlined" className="library-row"><button type="button" className="library-row-button" onClick={() => onSpace(item.id)}><span className="library-row-title">{item.title}</span><span className="library-row-meta">{item.documentCount} {item.documentCount === 1 ? 'document' : 'documents'}</span><span className="library-row-arrow" aria-hidden="true">→</span></button></Paper>)}
      {!shown.length && <p className="library-empty">{spaces.length ? 'No spaces match your search.' : 'No spaces yet. Create one to begin.'}</p>}</div>
  </section>;
}

type DocumentsProps = { space: Space; onBack: () => void; onDocument: (id: string) => void; onAddDocument: (file: File) => Promise<void> };

export function DocumentsLibrary({ space, onBack, onDocument, onAddDocument }: DocumentsProps) {
  const [query, setQuery] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const shown = space.documents.filter(item => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const form = event.currentTarget;
    setBusy(true);
    try { await onAddDocument(file); setFile(null); form.reset(); }
    catch { /* The parent displays the error. */ }
    finally { setBusy(false); }
  }
  function studyStatus(document: StudyDocument) {
    const quizzes = space.runs.filter(run => run.documentId === document.id).length;
    const decks = space.decks?.filter(deck => deck.documentId === document.id).length ?? 0;
    return `${quizzes} ${quizzes === 1 ? 'quiz' : 'quizzes'} · ${decks} ${decks === 1 ? 'deck' : 'decks'}`;
  }
  return <section className="library-page" aria-labelledby="documents-title">
    <Button className="back-link" variant="text" onClick={onBack}>← All spaces</Button>
    <div className="library-page-heading"><h1 id="documents-title">{space.title}</h1><Button variant="contained" onClick={() => setAdding(!adding)} aria-expanded={adding} aria-controls="add-document-form">{adding ? 'Cancel' : 'Add document'}</Button></div>
    {adding && <form id="add-document-form" onSubmit={add} className="library-create-form"><div className="file-field"><label htmlFor="document-file">.txt or .md, 120–20,000 characters</label><input id="document-file" type="file" accept=".txt,.md,text/plain,text/markdown" required onChange={event => setFile(event.target.files?.[0] ?? null)} /></div><Button type="submit" variant="contained" disabled={!file || busy}>Save document</Button></form>}
    <div className="library-list-heading"><h2>Documents <span>({space.documents.length})</span></h2>{space.documents.length > 0 && <TextField label="Find a document" size="small" value={query} onChange={event => setQuery(event.target.value)} />}</div>
    <div className="library-list">{shown.map(document => <Paper key={document.id} variant="outlined" className="library-row"><button type="button" className="library-row-button" onClick={() => onDocument(document.id)}><span className="library-row-title">{document.name}</span><span className="library-row-meta">{studyStatus(document)}</span><span className="library-row-arrow" aria-hidden="true">→</span></button></Paper>)}
      {!shown.length && <p className="library-empty">{space.documents.length ? 'No documents match your search.' : 'No documents yet. Add one to begin studying.'}</p>}</div>
  </section>;
}
