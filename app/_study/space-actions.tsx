'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import MoreVertIcon from '@mui/icons-material/MoreVert';

export type ManagedSpace = { id: string; title: string; archivedAt?: string | null; documentCount: number; runCount: number; deckCount: number };
type Props = { space: ManagedSpace; onRename: (id: string, title: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>; onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void> };

export default function SpaceActions({ space, onRename, onArchive, onRestore, onDelete }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [title, setTitle] = useState(space.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const count = (number: number, singular: string, plural: string) => `${number} ${number === 1 ? singular : plural}`;

  async function changeArchive() {
    setAnchor(null); setBusy(true); setError('');
    try { await (space.archivedAt ? onRestore(space.id) : onArchive(space.id)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function confirm(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (dialog === 'rename') await onRename(space.id, title.trim());
      if (dialog === 'delete') await onDelete(space.id);
      setDialog(null);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  function openDialog(kind: 'rename' | 'delete') {
    setAnchor(null); setError(''); setTitle(space.title); setDialog(kind);
  }

  return <>
    <IconButton aria-label={`More actions for ${space.title}`} onClick={event => setAnchor(event.currentTarget)} disabled={busy} size="small"><MoreVertIcon /></IconButton>
    <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
      <MenuItem onClick={() => openDialog('rename')}>Rename</MenuItem>
      <MenuItem onClick={changeArchive}>{space.archivedAt ? 'Restore' : 'Archive'}</MenuItem>
      <Divider />
      <MenuItem onClick={() => openDialog('delete')} sx={{ color: 'error.main' }}>Delete</MenuItem>
    </Menu>
    <Dialog open={Boolean(dialog)} onClose={() => !busy && setDialog(null)} fullWidth maxWidth="xs" aria-labelledby="space-action-title">
      {dialog && <form onSubmit={confirm}>
        <DialogTitle id="space-action-title">{dialog === 'rename' ? 'Rename study space' : 'Delete study space?'}</DialogTitle>
        <DialogContent>
          {dialog === 'rename' ? <TextField autoFocus label="Space name" fullWidth margin="dense" value={title} onChange={event => setTitle(event.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} required />
            : <p>Delete <strong>{space.title}</strong> and its {count(space.documentCount, 'document', 'documents')}, {count(space.runCount, 'quiz', 'quizzes')}, and {count(space.deckCount, 'deck', 'decks')}? This cannot be undone.</p>}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={() => setDialog(null)} disabled={busy}>Cancel</Button><Button type="submit" color={dialog === 'delete' ? 'error' : 'primary'} variant="contained" disabled={busy || (dialog === 'rename' && !title.trim())}>{dialog === 'rename' ? 'Save name' : 'Delete space'}</Button></DialogActions>
      </form>}
    </Dialog>
  </>;
}
