const status = document.querySelector('#status');
const spacesList = document.querySelector('#spaces');
const spaceSection = document.querySelector('#space');
let currentSpace = null;

function requestDetails({ apiRequest, usage, estimatedCostUsd }) {
  if (!apiRequest) return document.createTextNode('');
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
    try { await navigator.clipboard.writeText(content); copy.textContent = 'Copied'; }
    catch { copy.textContent = 'Copy failed — select the text below'; }
  });
  const code = document.createElement('pre');
  code.textContent = content;
  details.append(summary, usageLine, pricing, note, copy, code);
  return details;
}

async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Request failed.');
    error.details = result;
    throw error;
  }
  return result;
}

function message(error, target = status) {
  target.replaceChildren(document.createTextNode(error.message));
  if (error.details?.apiRequest) target.append(requestDetails(error.details));
}

function renderSpaces(spaces) {
  spacesList.replaceChildren();
  if (!spaces.length) { spacesList.textContent = 'Create your first study space to begin.'; return; }
  for (const space of spaces) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `space-button${currentSpace?.id === space.id ? ' selected' : ''}`;
    button.textContent = `${space.title} · ${space.documentCount} ${space.documentCount === 1 ? 'document' : 'documents'} · ${space.runCount} ${space.runCount === 1 ? 'session' : 'sessions'}`;
    button.addEventListener('click', () => openSpace(space.id).catch((error) => message(error)));
    spacesList.append(button);
  }
}

function renderDocuments() {
  const list = document.querySelector('#documents');
  const select = document.querySelector('#run-document');
  list.replaceChildren();
  select.replaceChildren();
  document.querySelector('#document-preview').hidden = true;
  if (!currentSpace.documents.length) {
    list.textContent = 'No documents yet.';
    document.querySelector('#document-preview').hidden = true;
    return;
  }
  for (const source of currentSpace.documents) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'document-button';
    button.textContent = `Preview ${source.name}`;
    button.addEventListener('click', () => {
      document.querySelector('#preview-title').textContent = source.name;
      document.querySelector('#preview-text').textContent = source.text;
      document.querySelector('#document-preview').hidden = false;
    });
    list.append(button);
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = source.name;
    select.append(option);
  }
}

function renderRuns() {
  const list = document.querySelector('#runs');
  list.replaceChildren();
  if (!currentSpace.runs.length) { list.textContent = 'No study sessions yet.'; return; }
  const spaceId = currentSpace.id;
  for (const run of [...currentSpace.runs].reverse()) {
    const article = document.createElement('article');
    article.className = 'panel run';
    const heading = document.createElement('h3');
    const source = currentSpace.documents.find((item) => item.id === run.documentId);
    heading.textContent = `${source?.name || 'Document'} · ${new Date(run.createdAt).toLocaleString()}`;
    const label = document.createElement('strong');
    label.textContent = 'Main ideas';
    const overview = document.createElement('p');
    overview.textContent = run.overview;
    article.append(heading, label, overview, requestDetails(run));
    for (const question of run.questions) {
      const card = document.createElement('form');
      card.className = 'question';
      const title = document.createElement('h4');
      title.textContent = `${question.id}. ${question.text}`;
      const attempts = document.createElement('div');
      for (const attempt of run.attempts.filter((item) => item.questionId === question.id)) {
        const result = document.createElement('div');
        result.className = 'feedback';
        const answer = document.createElement('p');
        answer.textContent = `Your answer: ${attempt.answer}`;
        const level = document.createElement('strong');
        level.textContent = attempt.level;
        const feedback = document.createElement('p');
        feedback.textContent = attempt.feedback;
        const quote = document.createElement('blockquote');
        quote.textContent = attempt.sourceQuote;
        result.append(answer, level, feedback, quote, requestDetails(attempt));
        attempts.append(result);
      }
      const answerLabel = document.createElement('label');
      answerLabel.textContent = run.attempts.some((item) => item.questionId === question.id) ? 'Try again' : 'Your answer';
      const answerInput = document.createElement('textarea');
      answerInput.rows = 3;
      answerInput.maxLength = 2000;
      answerInput.required = true;
      answerLabel.append(answerInput);
      const button = document.createElement('button');
      button.textContent = 'Check answer';
      const feedbackStatus = document.createElement('div');
      feedbackStatus.setAttribute('aria-live', 'polite');
      card.append(title, attempts, answerLabel, button, feedbackStatus);
      card.addEventListener('submit', async (event) => {
        event.preventDefault();
        button.disabled = true;
        feedbackStatus.textContent = 'Checking answer…';
        try {
          await api(`/api/spaces/${spaceId}/runs/${run.id}/answers`, { questionId: question.id, answer: answerInput.value });
          await openSpace(spaceId);
          status.textContent = 'Answer saved.';
        } catch (error) { message(error, feedbackStatus); }
        finally { button.disabled = false; }
      });
      article.append(card);
    }
    list.append(article);
  }
}

async function refreshSpaces() {
  const { spaces } = await api('/api/spaces');
  renderSpaces(spaces);
  return spaces;
}

async function openSpace(id) {
  const { space } = await api(`/api/spaces/${id}`);
  currentSpace = space;
  location.hash = space.id;
  document.querySelector('#space-name').textContent = space.title;
  spaceSection.hidden = false;
  renderDocuments();
  renderRuns();
  await refreshSpaces();
}

document.querySelector('#space-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#space-title');
  try {
    const { space } = await api('/api/spaces', { title: input.value });
    input.value = '';
    await openSpace(space.id);
    status.textContent = 'Study space created.';
  } catch (error) { message(error); }
});

document.querySelector('#document-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#document-file');
  const file = input.files[0];
  if (!file) return;
  const spaceId = currentSpace.id;
  try {
    if (!/\.(txt|md)$/i.test(file.name)) throw new Error('Choose a .txt or .md document.');
    if (file.size > 80000) throw new Error('Choose a smaller text document (20,000 characters maximum).');
    const text = await file.text();
    if (text.trim().length < 120 || text.length > 20000) throw new Error('Use a document between 120 and 20,000 characters.');
    await api(`/api/spaces/${spaceId}/documents`, { name: file.name, text });
    input.value = '';
    await openSpace(spaceId);
    status.textContent = 'Document saved. Preview it before studying.';
  } catch (error) { message(error); }
});

document.querySelector('#run-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const start = document.querySelector('#start');
  start.disabled = true;
  status.textContent = 'Preparing your session…';
  const spaceId = currentSpace.id;
  try {
    await api(`/api/spaces/${spaceId}/runs`, {
      documentId: document.querySelector('#run-document').value,
    });
    await openSpace(spaceId);
    status.textContent = 'Study session saved.';
  } catch (error) { message(error); }
  finally { start.disabled = false; }
});

refreshSpaces().then(async (spaces) => {
  const chosen = spaces.find((space) => space.id === location.hash.slice(1)) || spaces[0];
  if (chosen) await openSpace(chosen.id);
}).catch((error) => message(error));
