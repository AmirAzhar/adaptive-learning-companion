'use client';

import { useEffect, useRef, useState } from 'react';
import type { Space, SpaceSummary } from './types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaces: SpaceSummary[];
  space: Space | null;
  selectedDocumentId: string | null;
  onSpace: (id: string) => void;
  onDocument: (id: string) => void;
  onCreateSpace: (title: string) => Promise<void>;
  onAddDocument: (file: File) => Promise<void>;
};

export default function Library({ open, onOpenChange, spaces, space, selectedDocumentId, onSpace, onDocument, onCreateSpace, onAddDocument }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [spaceName, setSpaceName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const spaceDetails = useRef<HTMLDetailsElement>(null);
  const documentDetails = useRef<HTMLDetailsElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

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
  function backdrop(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) onOpenChange(false);
  }

  return <dialog id="library-sidebar" ref={dialogRef} className="library-drawer" aria-labelledby="library-title" onClose={() => onOpenChange(false)} onClick={backdrop}>
    <div className="drawer-header">
      <div><p className="eyebrow">Study library</p><h2 id="library-title">Spaces &amp; documents</h2></div>
      <button id="library-close" type="button" aria-label="Close library" autoFocus onClick={() => onOpenChange(false)}>
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 4l12 12M16 4L4 16"/></svg>
      </button>
    </div>
    <section className="sidebar-section" aria-labelledby="spaces-title">
      <div className="sidebar-heading"><h2 id="spaces-title">Spaces</h2>
        <details className="add-space" ref={spaceDetails}><summary aria-label="New space"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2v12M2 8h12"/></svg></summary>
          <form id="space-form" onSubmit={createSpace}><label htmlFor="space-title">Space name</label>
            <input id="space-title" maxLength={80} required placeholder="e.g. Database Systems" value={spaceName} onChange={event => setSpaceName(event.target.value)} />
            <button type="submit" disabled={busy}>Create space</button></form>
        </details>
      </div>
      <div id="spaces">{spaces.length ? spaces.map(item => <button key={item.id} type="button" className={`space-button${space?.id === item.id ? ' selected' : ''}`} aria-current={space?.id === item.id} onClick={() => onSpace(item.id)}>
        <strong>{item.title}</strong><span>{item.documentCount} {item.documentCount === 1 ? 'document' : 'documents'}</span>
      </button>) : 'Create your first study space to begin.'}</div>
    </section>
    {space && <section id="sidebar-documents" className="sidebar-section" aria-labelledby="documents-title">
      <div className="sidebar-heading"><h2 id="documents-title">Documents</h2>
        <details className="add-document" ref={documentDetails}><summary aria-label="Add document"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2v12M2 8h12"/></svg></summary>
          <form id="document-form" onSubmit={addDocument}><label htmlFor="document-file">Add a .txt or .md file (120–20,000 characters)</label>
            <input id="document-file" ref={fileInput} type="file" accept=".txt,.md,text/plain,text/markdown" required onChange={event => setFile(event.target.files?.[0] ?? null)} />
            <button type="submit" disabled={busy}>Save document</button></form>
        </details>
      </div>
      <nav id="documents" aria-label="Documents in this space">{space.documents.length ? space.documents.map(source => <button key={source.id} type="button" className={`document-button${source.id === selectedDocumentId ? ' selected' : ''}`} aria-current={source.id === selectedDocumentId} onClick={() => onDocument(source.id)}>{source.name}</button>) : 'No documents yet. Add one to begin studying.'}</nav>
    </section>}
    <p className="sidebar-note">Your documents and study history stay on this computer.</p>
  </dialog>;
}
