'use client';

import { useState } from 'react';
import type { RequestInfo } from './types';

export default function RequestDetails({ result }: { result?: RequestInfo }) {
  const [copyLabel, setCopyLabel] = useState('Copy JSON');
  if (!result?.apiRequest) return null;
  const { apiRequest, usage, estimatedCostUsd } = result;
  const cost = estimatedCostUsd == null ? 'cost unavailable' : `est. $${estimatedCostUsd.toFixed(6)}`;
  const content = JSON.stringify(apiRequest, null, 2);
  async function copy() {
    try { await navigator.clipboard.writeText(content); setCopyLabel('Copied'); }
    catch { setCopyLabel('Copy failed — select the text below'); }
  }
  return <details className="api-request">
    <summary>View API request · {cost}</summary>
    <p className="usage">{usage
      ? `${usage.input_tokens} input tokens (${usage.input_tokens_details?.cached_tokens ?? 0} cached) · ${usage.output_tokens} output tokens · ${usage.total_tokens} total`
      : 'Token usage was not returned by the API.'}</p>
    <p className="pricing">{estimatedCostUsd == null
      ? 'A price is unavailable for this model or response.'
      : <>Estimated using standard gpt-4o-mini rates: $0.15/M input, $0.075/M cached input, $0.60/M output. <a href="https://developers.openai.com/api/docs/pricing">Current pricing</a></>}</p>
    <p>This is the JSON body sent to OpenAI. The API key is sent separately in a header and is not shown here.</p>
    <button type="button" onClick={copy}>{copyLabel}</button>
    <pre>{content}</pre>
  </details>;
}
