const form = document.querySelector('#session-form');
const sourceInput = document.querySelector('#source');
const modeInput = document.querySelector('#mode');
const status = document.querySelector('#status');
const session = document.querySelector('#session');
const questions = document.querySelector('#questions');
const sessionRequest = document.querySelector('#session-request');

function requestDetails({ apiRequest, usage, estimatedCostUsd }) {
  const details = document.createElement('details');
  details.className = 'api-request';
  const summary = document.createElement('summary');
  const cost = estimatedCostUsd == null ? 'cost unavailable' : `est. $${estimatedCostUsd.toFixed(6)}`;
  summary.textContent = `View API request · ${cost}`;
  const usageLine = document.createElement('p');
  usageLine.className = 'usage';
  usageLine.textContent = usage
    ? `${usage.input_tokens} input tokens (${usage.input_tokens_details?.cached_tokens ?? 0} cached) · ${usage.output_tokens} output tokens · ${usage.total_tokens} total`
    : 'Token usage was not returned by the API.';
  const pricing = document.createElement('p');
  pricing.className = 'pricing';
  if (estimatedCostUsd == null) {
    pricing.textContent = 'A price is unavailable for this model or response.';
  } else {
    pricing.append('Estimated using standard gpt-4o-mini rates: $0.15/M input, $0.075/M cached input, $0.60/M output. ');
    const link = document.createElement('a');
    link.href = 'https://developers.openai.com/api/docs/pricing';
    link.textContent = 'Current pricing';
    pricing.append(link);
  }
  const note = document.createElement('p');
  note.textContent = 'This is the JSON body sent to OpenAI. The API key is sent separately in a header and is not shown here.';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy JSON';
  const content = JSON.stringify(apiRequest, null, 2);
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(content);
      copy.textContent = 'Copied';
    } catch { copy.textContent = 'Copy failed — select the text below'; }
  });
  const code = document.createElement('pre');
  code.textContent = content;
  details.append(summary, usageLine, pricing, note, copy, code);
  return details;
}

async function api(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Request failed.');
    error.details = result;
    throw error;
  }
  return result;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const source = sourceInput.value.trim();
  const start = document.querySelector('#start');
  start.disabled = true;
  status.textContent = 'Preparing your session…';
  session.hidden = true;
  sessionRequest.replaceChildren();
  try {
    const result = await api('/api/session', { source, mode: modeInput.value });
    document.querySelector('#overview-label').textContent = modeInput.value === 'summary' ? 'Summary' : 'Explanation';
    document.querySelector('#overview').textContent = result.overview;
    sessionRequest.append(requestDetails(result));
    questions.replaceChildren();
    for (const [index, question] of result.questions.entries()) {
      const card = document.createElement('form');
      card.className = 'question';
      const heading = document.createElement('h3');
      heading.textContent = `${index + 1}. ${question.text}`;
      const label = document.createElement('label');
      label.textContent = 'Your answer';
      const answer = document.createElement('textarea');
      answer.rows = 3;
      answer.maxLength = 2000;
      answer.required = true;
      label.append(answer);
      const button = document.createElement('button');
      button.textContent = 'Check answer';
      const feedback = document.createElement('div');
      feedback.className = 'feedback';
      feedback.setAttribute('aria-live', 'polite');
      card.append(heading, label, button, feedback);
      card.addEventListener('submit', async (event) => {
        event.preventDefault();
        button.disabled = true;
        feedback.textContent = 'Checking answer…';
        try {
          const result = await api('/api/answer', { source, question: question.text, sourceQuote: question.sourceQuote, answer: answer.value });
          const level = document.createElement('strong');
          level.textContent = result.level;
          const message = document.createElement('p');
          message.textContent = result.feedback;
          const quote = document.createElement('blockquote');
          quote.textContent = result.sourceQuote;
          feedback.replaceChildren(level, message, quote, requestDetails(result));
        } catch (error) {
          feedback.replaceChildren(document.createTextNode(error.message));
          if (error.details?.apiRequest) feedback.append(requestDetails(error.details));
        }
        finally { button.disabled = false; }
      });
      questions.append(card);
    }
    session.hidden = false;
    status.textContent = 'Session ready.';
  } catch (error) {
    status.textContent = error.message;
    if (error.details?.apiRequest) sessionRequest.append(requestDetails(error.details));
  }
  finally { start.disabled = false; }
});
