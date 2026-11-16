'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import type { Space, SpaceSummary, StudyDocument } from './types';
import SpaceActions from './space-actions';

type SpacesProps = { spaces: SpaceSummary[]; onSpace: (id: string) => void; onCreateSpace: (title: string) => Promise<void>;
  onRename: (id: string, title: string) => Promise<void>; onArchive: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>; onDelete: (id: string) => Promise<void> };

export function SpacesLibrary({ spaces, onSpace, onCreateSpace, onRename, onArchive, onRestore, onDelete }: SpacesProps) {
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const active = spaces.filter(item => !item.archivedAt);
  const archived = spaces.filter(item => item.archivedAt);
  const listed = showArchived ? archived : active;
  const shown = listed.filter(item => item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await onCreateSpace(title); setTitle(''); }
    catch { /* The parent displays the error. */ }
    finally { setBusy(false); }
  }
  return <section className="library-page" aria-labelledby="spaces-title">
    <div className="library-page-heading"><h1 id="spaces-title">Study spaces</h1><Button variant="contained" onClick={() => setCreating(!creating)} aria-expanded={creating} aria-controls="create-space-form">{creating ? 'Cancel' : 'New space'}</Button></div>
    {creating && <form id="create-space-form" onSubmit={create} className="library-create-form"><TextField autoFocus label="Space name" size="small" value={title} onChange={event => setTitle(event.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} required placeholder="e.g. Database Systems" /><Button type="submit" variant="contained" disabled={busy}>Create space</Button></form>}
    <div className="library-list-heading"><h2>{showArchived ? 'Archived spaces' : 'All spaces'} <span>({listed.length})</span></h2>{listed.length > 0 && <TextField label="Find a space" size="small" value={query} onChange={event => setQuery(event.target.value)} />}</div>
    <div className="library-list">{shown.map(item => <Paper key={item.id} variant="outlined" className="library-row space-list-row">{showArchived
      ? <div className="library-row-static"><span className="library-row-title">{item.title}</span><span className="library-row-meta">{item.documentCount} {item.documentCount === 1 ? 'document' : 'documents'}</span></div>
      : <button type="button" className="library-row-button" onClick={() => onSpace(item.id)}><span className="library-row-title">{item.title}</span><span className="library-row-meta">{item.documentCount} {item.documentCount === 1 ? 'document' : 'documents'}</span><span className="library-row-arrow" aria-hidden="true">→</span></button>}
      <SpaceActions space={{ ...item, runCount: item.runCount ?? 0, deckCount: item.deckCount ?? 0 }} onRename={onRename} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} /></Paper>)}
      {!shown.length && <p className="library-empty">{listed.length ? 'No spaces match your search.' : showArchived ? 'No archived spaces.' : 'No spaces yet. Create one to begin.'}</p>}</div>
    {(archived.length > 0 || showArchived) && <Button className="archived-toggle" variant="text" onClick={() => { setShowArchived(!showArchived); setQuery(''); }}>{showArchived ? '← Active spaces' : `Archived spaces (${archived.length})`}</Button>}
  </section>;
}

type SourcesProps = { space: Space; readOnly?: boolean; onAddDocument: (file: File) => Promise<void>;
  onChangeDocument: (id: string, change: 'remove' | 'restore' | 'delete') => Promise<void>; onClose: () => void };

export function SourcesPanel({ space, readOnly, onAddDocument, onChangeDocument, onClose }: SourcesProps) {
  const [query, setQuery] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [deleting, setDeleting] = useState<StudyDocument | null>(null);
  const active = space.documents.filter(item => !item.removedAt);
  const removed = space.documents.filter(item => item.removedAt);
  const shown = active.filter(item => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const characters = active.reduce((total, document) => total + document.text.length, 0);
  const tooManyCharacters = characters > 40000;
  const affectedRuns = deleting ? space.runs.filter(run => run.documentId === deleting.id || ('documentIds' in run && run.documentIds?.includes(deleting.id))).length : 0;
  const affectedDecks = deleting ? (space.decks ?? []).filter(deck => deck.documentId === deleting.id || deck.documentIds?.includes(deleting.id)).length : 0;
  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const form = event.currentTarget;
    setBusy(true);
    try { await onAddDocument(file); setFile(null); form.reset(); }
    catch { /* The parent displays the error. */ }
    finally { setBusy(false); }
  }
  async function change(documentId: string, action: 'remove' | 'restore' | 'delete') {
    setBusy(true);
    try { await onChangeDocument(documentId, action); if (action === 'delete') setDeleting(null); }
    catch { /* The parent displays the error. */ }
    finally { setBusy(false); }
  }
  return <section id="sources-panel" className="sources-panel" aria-labelledby="sources-title">
    <div className="sources-heading"><h2 id="sources-title">Sources</h2><IconButton aria-label="Close sources" onClick={onClose}><CloseIcon /></IconButton></div>
    <p className="sources-description">Documents used when generating new quizzes and flashcards.</p>
    <p className="sources-usage">{active.length} active {active.length === 1 ? 'document' : 'documents'} · {characters.toLocaleString()} / 40,000 characters</p>
    {active.length > 3 && !tooManyCharacters && <p className="sources-coverage">A short quiz or deck may not cover every document.</p>}
    {tooManyCharacters && <Alert severity="error" className="sources-limit" role="alert">All active sources exceed the 40,000-character limit. {readOnly ? 'Restore this space before generating again.' : 'Remove a source to generate new study material.'}</Alert>}
    {!readOnly && <Button className="sources-add" variant="outlined" onClick={() => setAdding(!adding)} aria-expanded={adding} aria-controls="add-document-form">{adding ? 'Cancel' : 'Add document'}</Button>}
    {adding && <form id="add-document-form" onSubmit={add} className="library-create-form"><div className="file-field"><label htmlFor="document-file">.txt or .md, 120–20,000 characters</label><input id="document-file" type="file" accept=".txt,.md,text/plain,text/markdown" required onChange={event => setFile(event.target.files?.[0] ?? null)} /></div><Button type="submit" variant="contained" disabled={!file || busy}>Save document</Button></form>}
    {active.length > 1 && <TextField label="Find a document" size="small" value={query} onChange={event => setQuery(event.target.value)} />}
    <div className="library-list">{shown.map(document => <Paper key={document.id} variant="outlined" className="source-row"><span className="source-row-details"><span className="library-row-title">{document.name}</span><span className="library-row-meta">{document.text.length.toLocaleString()} characters</span></span>{!readOnly && <Button size="small" onClick={() => change(document.id, 'remove')} disabled={busy}>Remove</Button>}</Paper>)}
      {!shown.length && <p className="library-empty">{active.length ? 'No documents match your search.' : 'Add a document to generate new study material.'}</p>}</div>
    {removed.length > 0 && <div className="removed-sources"><Button variant="text" aria-expanded={showRemoved} onClick={() => setShowRemoved(!showRemoved)}>{showRemoved ? 'Hide' : 'Show'} removed sources ({removed.length})</Button>
      {showRemoved && <><p className="sources-description">Kept for existing quizzes and flashcards. Restore to use in new generation.</p><div className="library-list">{removed.map(document => <Paper key={document.id} variant="outlined" className="source-row"><span className="source-row-details"><span className="library-row-title">{document.name}</span><span className="library-row-meta">{document.text.length.toLocaleString()} characters</span></span>{!readOnly && <div className="source-row-actions"><Button size="small" onClick={() => change(document.id, 'restore')} disabled={busy}>Restore</Button><Button size="small" color="error" onClick={() => setDeleting(document)} disabled={busy}>Delete</Button></div>}</Paper>)}</div></>}
    </div>}
    <Dialog open={Boolean(deleting)} onClose={busy ? undefined : () => setDeleting(null)} aria-labelledby="delete-source-title">
      <DialogTitle id="delete-source-title">Permanently delete {deleting?.name}?</DialogTitle>
      <DialogContent><p>The source text will be erased.{affectedRuns || affectedDecks ? ` This also deletes ${affectedRuns} ${affectedRuns === 1 ? 'quiz' : 'quizzes'} and ${affectedDecks} ${affectedDecks === 1 ? 'deck' : 'decks'} made from it.` : ''}</p></DialogContent>
      <DialogActions><Button onClick={() => setDeleting(null)} disabled={busy}>Cancel</Button><Button color="error" variant="contained" onClick={() => deleting && change(deleting.id, 'delete')} disabled={busy}>Delete permanently</Button></DialogActions>
    </Dialog>
  </section>;
}
