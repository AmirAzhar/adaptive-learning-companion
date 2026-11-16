'use client';

import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import RequestDetails from './request-details';
import type { Space } from './types';

export default function SummaryView({ space, busy, onGenerate }: { space: Space; busy: boolean; onGenerate: () => void }) {
  const active = space.documents.filter(document => !document.removedAt);
  const summary = space.summary;
  const current = Boolean(summary && summary.documentIds.length === active.length &&
    active.every((document, index) => summary.documentIds[index] === document.id));
  const tooLong = active.reduce((total, document) => total + document.text.length, 0) > 40000;
  return <section className="study-pane main-ideas" aria-label="Main ideas">
    <div className="study-pane-heading"><div><h3>Main ideas</h3><p>Review the key ideas across all active documents.</p></div>
      <div className="study-pane-actions"><IconButton className="study-refresh" type="button" aria-label={summary ? 'Refresh main ideas' : 'Generate main ideas'} title={summary ? 'Refresh main ideas from all active documents' : 'Generate main ideas from all active documents'} disabled={busy || Boolean(space.archivedAt) || !active.length || tooLong} onClick={onGenerate}><RefreshIcon /></IconButton></div>
    </div>
    <div className="summary-content">
      {!active.length && <p>Add a source document to create a summary.</p>}
      {tooLong && <p>The active sources exceed the 40,000-character summary limit. Choose which documents remain active before refreshing.</p>}
      {summary && <>
        {!current && <p className="source-coverage">This summary is from an earlier source selection. Refresh it to cover all current active documents.</p>}
        <p>{summary.overview}</p>
        {summary.sections.map(section => <div key={section.documentId} className="summary-source">
          <h4>{space.documents.find(document => document.id === section.documentId)?.name ?? 'Deleted source'}</h4>
          <ul>{section.ideas.map((idea, index) => <li key={index}>{idea.text}<details><summary>Source excerpt</summary><blockquote>{idea.sourceQuote}</blockquote></details></li>)}</ul>
        </div>)}
        <RequestDetails result={summary} />
      </>}
      {!summary && active.length > 0 && !tooLong && <p>Generate a summary of all active documents in this space.</p>}
    </div>
  </section>;
}
