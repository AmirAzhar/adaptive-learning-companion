'use client';

import { useRef, useState } from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import CloseIcon from '@mui/icons-material/Close';
import type { Space, SpaceSummary } from './types';

type Props = {
  open: boolean;
  desktop: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onWidthCommit: (width: number) => void;
  onOpenChange: (open: boolean) => void;
  spaces: SpaceSummary[];
  space: Space | null;
  selectedDocumentId: string | null;
  onSpace: (id: string) => void;
  onDocument: (id: string) => void;
  onCreateSpace: (title: string) => Promise<void>;
  onAddDocument: (file: File) => Promise<void>;
};

const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 300;
const clampWidth = (width: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));

export default function Library({ open, desktop, width, onWidthChange, onWidthCommit, onOpenChange, spaces, space, selectedDocumentId, onSpace, onDocument, onCreateSpace, onAddDocument }: Props) {
  const [spaceName, setSpaceName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const spaceDetails = useRef<HTMLDetailsElement>(null);
  const documentDetails = useRef<HTMLDetailsElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    drag.current = { startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }
  function moveResize(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current) onWidthChange(clampWidth(drag.current.startWidth + event.clientX - drag.current.startX));
  }
  function endResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const next = clampWidth(drag.current.startWidth + event.clientX - drag.current.startX);
    drag.current = null;
    onWidthCommit(next);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }
  function resizeWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    const next = event.key === 'ArrowLeft' ? width - 10 : event.key === 'ArrowRight' ? width + 10 : event.key === 'Home' ? MIN_WIDTH : event.key === 'End' ? MAX_WIDTH : null;
    if (next === null) return;
    event.preventDefault();
    onWidthCommit(clampWidth(next));
  }

  async function createSpace(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await onCreateSpace(spaceName);
      setSpaceName(''); if (spaceDetails.current) spaceDetails.current.open = false;
    } catch {
      // The parent reports API and validation errors in the page status.
    } finally { setBusy(false); }
  }
  async function addDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      await onAddDocument(file);
      setFile(null); if (fileInput.current) fileInput.current.value = ''; if (documentDetails.current) documentDetails.current.open = false;
    } catch {
      // The parent reports API and validation errors in the page status.
    } finally { setBusy(false); }
  }

  return <Drawer id="library-sidebar" anchor="left" variant={desktop ? 'persistent' : 'temporary'} open={open} onClose={() => onOpenChange(false)} slotProps={{ paper: { className: `library-drawer${desktop ? ' library-drawer-desktop' : ''}`, 'aria-labelledby': 'library-title', style: { width: desktop ? width : undefined } } }}>
    <div className="drawer-header">
      <div><p className="eyebrow">Study library</p><h2 id="library-title">Spaces &amp; documents</h2></div>
      <IconButton id="library-close" aria-label="Close library" autoFocus={!desktop} onClick={() => { onOpenChange(false); if (desktop) document.getElementById('library-toggle')?.focus(); }}>{desktop ? <ChevronLeftIcon fontSize="small" /> : <CloseIcon fontSize="small" />}</IconButton>
    </div>
    <section className="sidebar-section" aria-labelledby="spaces-title">
      <div className="sidebar-heading"><h2 id="spaces-title">Spaces</h2>
        <details className="add-space" ref={spaceDetails}><summary aria-label="New space"><AddIcon fontSize="small" /></summary>
          <form id="space-form" onSubmit={createSpace}>
            <TextField id="space-title" label="Space name" size="small" fullWidth slotProps={{ htmlInput: { maxLength: 80 } }} required placeholder="e.g. Database Systems" value={spaceName} onChange={event => setSpaceName(event.target.value)} />
            <Button type="submit" disabled={busy}>Create space</Button>
          </form>
        </details>
      </div>
      <List id="spaces" disablePadding>{spaces.length ? spaces.map(item => <ListItem key={item.id} disablePadding><ListItemButton className="space-button" selected={space?.id === item.id} aria-current={space?.id === item.id} onClick={() => onSpace(item.id)}>
        <ListItemText primary={item.title} secondary={`${item.documentCount} ${item.documentCount === 1 ? 'document' : 'documents'}`} />
      </ListItemButton></ListItem>) : <ListItem><Box sx={{ py: 1, color: 'text.secondary', fontSize: '.88rem' }}>Create your first study space to begin.</Box></ListItem>}</List>
    </section>
    {space && <section id="sidebar-documents" className="sidebar-section" aria-labelledby="documents-title">
      <div className="sidebar-heading"><h2 id="documents-title">Documents</h2>
        <details className="add-document" ref={documentDetails}><summary aria-label="Add document"><AddIcon fontSize="small" /></summary>
          <form id="document-form" onSubmit={addDocument}>
            <label htmlFor="document-file">Add a .txt or .md file (120–20,000 characters)</label>
            <input id="document-file" ref={fileInput} type="file" accept=".txt,.md,text/plain,text/markdown" required onChange={event => setFile(event.target.files?.[0] ?? null)} />
            <Button type="submit" disabled={busy}>Save document</Button>
          </form>
        </details>
      </div>
      <List component="nav" id="documents" aria-label="Documents in this space" disablePadding>{space.documents.length ? space.documents.map(source => <ListItemButton key={source.id} className="document-button" selected={source.id === selectedDocumentId} aria-current={source.id === selectedDocumentId} onClick={() => onDocument(source.id)}><ListItemText primary={source.name} /></ListItemButton>) : <Box sx={{ px: 1.5, py: 1, color: 'text.secondary', fontSize: '.88rem' }}>No documents yet. Add one to begin studying.</Box>}</List>
    </section>}
    <p className="sidebar-note">Your documents and study history stay on this computer.</p>
    {desktop && <div className="library-resize-handle" role="separator" aria-label="Resize library" aria-orientation="vertical" aria-valuemin={MIN_WIDTH} aria-valuemax={MAX_WIDTH} aria-valuenow={width} tabIndex={0} onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onKeyDown={resizeWithKeyboard} onDoubleClick={() => onWidthCommit(DEFAULT_WIDTH)} />}
  </Drawer>;
}
