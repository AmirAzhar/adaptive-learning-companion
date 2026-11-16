'use client';

import { useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Button from '@mui/material/Button';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { RequestInfo } from './types';

export default function RequestDetails({ result }: { result?: RequestInfo }) {
  const [copyLabel, setCopyLabel] = useState('Copy JSON');
  if (!result?.apiRequest) return null;
  const calls = result.apiCalls?.length ? result.apiCalls : [result];
  const totalCost = calls.every(call => call.estimatedCostUsd != null)
    ? calls.reduce((total, call) => total + (call.estimatedCostUsd ?? 0), 0) : null;
  const cost = totalCost == null ? 'cost unavailable' : `est. $${totalCost.toFixed(6)}`;
  const content = JSON.stringify(calls.length === 1 ? calls[0].apiRequest : calls.map(call => call.apiRequest), null, 2);
  async function copy() {
    try { await navigator.clipboard.writeText(content); setCopyLabel('Copied'); }
    catch { setCopyLabel('Copy failed — select the text below'); }
  }
  return <Accordion className="api-request" disableGutters elevation={0}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>View {calls.length === 1 ? 'API request' : `${calls.length} API requests`} · {cost}</AccordionSummary>
    <AccordionDetails>
    <p className="pricing">{totalCost == null
      ? 'A price is unavailable for this model or response.'
      : <>Estimated using standard gpt-4o-mini rates: $0.15/M input, $0.075/M cached input, $0.60/M output. <a href="https://developers.openai.com/api/docs/pricing">Current pricing</a></>}</p>
    <p>{calls.length === 1 ? 'This is the JSON body' : 'These are the JSON bodies'} sent to OpenAI. The API key is sent separately in a header and is not shown here.</p>
    <Button type="button" onClick={copy}>{copyLabel}</Button>
    {calls.map((call, index) => <div key={index}>{calls.length > 1 && <h4>Request {index + 1}</h4>}
      <p className="usage">{call.usage
        ? `${call.usage.input_tokens} input tokens (${call.usage.input_tokens_details?.cached_tokens ?? 0} cached) · ${call.usage.output_tokens} output tokens · ${call.usage.total_tokens} total`
        : 'Token usage was not returned by the API.'}</p>
      <pre>{JSON.stringify(call.apiRequest, null, 2)}</pre></div>)}
    </AccordionDetails>
  </Accordion>;
}
