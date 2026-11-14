const status = document.querySelector('#status');
const spacesList = document.querySelector('#spaces');
const spaceSection = document.querySelector('#space');
let currentSpace = null;
let selectedDocumentId = null;
let activeMode = 'quiz';
let selectedRunId = null;
let selectedDeckId = null;

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
    button.setAttribute('aria-current', currentSpace?.id === space.id ? 'true' : 'false');
    const title = document.createElement('strong');
    title.textContent = space.title;
    const meta = document.createElement('span');
    meta.textContent = `${space.documentCount} ${space.documentCount === 1 ? 'document' : 'documents'}`;
    button.append(title, meta);
    button.addEventListener('click', () => openSpace(space.id)
      .then(() => setLibraryOpen(!currentSpace.documents.length)).catch((error) => message(error)));
    spacesList.append(button);
  }
}

function renderDocuments() {
  const list = document.querySelector('#documents');
  list.replaceChildren();
  if (!currentSpace.documents.some((item) => item.id === selectedDocumentId)) {
    selectedDocumentId = currentSpace.documents[0]?.id ?? null;
  }
  if (!currentSpace.documents.length) {
    list.textContent = 'No documents yet. Add one to begin studying.';
    document.querySelector('#active-document-name').textContent = 'Add your first document';
    document.querySelector('#document-meta').textContent = 'Choose a .txt or .md file from the library.';
    document.querySelector('#document-preview').hidden = true;
    renderGenerationActions();
    return;
  }
  for (const source of currentSpace.documents) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `document-button${source.id === selectedDocumentId ? ' selected' : ''}`;
    button.setAttribute('aria-current', source.id === selectedDocumentId ? 'true' : 'false');
    button.textContent = source.name;
    button.addEventListener('click', () => {
      selectedDocumentId = source.id;
      renderDocuments();
      renderRuns();
      renderDecks();
      setLibraryOpen(false);
    });
    list.append(button);
  }
  const source = currentSpace.documents.find((item) => item.id === selectedDocumentId);
  document.querySelector('#active-document-name').textContent = source.name;
  document.querySelector('#document-meta').textContent = `${source.text.length.toLocaleString()} characters · added ${new Date(source.createdAt).toLocaleDateString()}`;
  document.querySelector('#preview-text').textContent = source.text;
  document.querySelector('#document-preview').hidden = false;
  renderGenerationActions();
}

function setLibraryOpen(open) {
  const drawer = document.querySelector('#library-sidebar');
  if (open && !drawer.open) drawer.showModal();
  if (!open && drawer.open) drawer.close();
  document.querySelector('#library-toggle').setAttribute('aria-expanded', String(drawer.open));
}

function renderMode() {
  document.querySelector('#quiz-pane').hidden = activeMode !== 'quiz';
  document.querySelector('#cards-pane').hidden = activeMode !== 'cards';
  document.querySelector('#mode-quiz').setAttribute('aria-pressed', String(activeMode === 'quiz'));
  document.querySelector('#mode-cards').setAttribute('aria-pressed', String(activeMode === 'cards'));
}

function renderGenerationActions() {
  const documentId = selectedDocumentId;
  for (const button of document.querySelectorAll('#run-form button')) button.disabled = !documentId;
  const hasQuiz = currentSpace.runs.some((run) => run.documentId === documentId && run.type === 'quiz');
  const hasDeck = (currentSpace.decks ?? []).some((deck) => deck.documentId === documentId);
  document.querySelector('#start').hidden = hasQuiz && hasDeck;
  document.querySelector('#start').textContent = hasQuiz ? 'Generate flashcards' : hasDeck ? 'Generate quiz' : 'Generate quiz and flashcards';
  document.querySelector('#quiz-only').textContent = hasQuiz ? 'New quiz' : 'Generate quiz';
  document.querySelector('#cards-only').textContent = hasDeck ? 'New deck' : 'Generate flashcards';
}

function renderDecks() {
  const list = document.querySelector('#decks');
  const picker = document.querySelector('#deck-picker');
  const pickerWrap = document.querySelector('#deck-picker-wrap');
  list.replaceChildren();
  picker.replaceChildren();
  const decks = (currentSpace.decks ?? []).filter((deck) => deck.documentId === selectedDocumentId);
  pickerWrap.hidden = decks.length < 2;
  if (!decks.length) {
    list.textContent = selectedDocumentId
      ? 'No flashcards for this document yet. Generate a deck above to start reviewing.'
      : 'Add a document from the library to make flashcards.';
    return;
  }
  const reversed = [...decks].reverse();
  if (!decks.some((deck) => deck.id === selectedDeckId)) selectedDeckId = reversed[0].id;
  for (const [index, deck] of reversed.entries()) {
    const option = document.createElement('option');
    option.value = deck.id;
    option.textContent = `Deck ${decks.length - index} · ${new Date(deck.createdAt).toLocaleString()}`;
    picker.append(option);
  }
  picker.value = selectedDeckId;
  for (const deck of decks.filter((item) => item.id === selectedDeckId)) {
    const article = document.createElement('article');
    article.className = 'panel run';
    const source = currentSpace.documents.find((item) => item.id === deck.documentId);
    const title = document.createElement('h3');
    title.textContent = `${source?.name || 'Document'} · ${new Date(deck.createdAt).toLocaleString()}`;
    const details = document.createElement('details');
    details.className = 'card-editor';
    const editSummary = document.createElement('summary');
    editSummary.textContent = `Edit ${deck.cards.length} cards and check sources`;
    details.append(editSummary);
    for (const card of deck.cards) {
      const form = document.createElement('form');
      form.className = 'card-edit-form';
      const frontLabel = document.createElement('label');
      frontLabel.textContent = `Card ${card.id} · Question`;
      const front = document.createElement('textarea');
      front.value = card.front;
      front.maxLength = 500;
      front.required = true;
      frontLabel.append(front);
      const backLabel = document.createElement('label');
      backLabel.textContent = 'Answer';
      const back = document.createElement('textarea');
      back.value = card.back;
      back.maxLength = 2000;
      back.required = true;
      backLabel.append(back);
      const quote = document.createElement('blockquote');
      quote.textContent = card.sourceQuote;
      const save = document.createElement('button');
      save.textContent = 'Save card';
      const feedback = document.createElement('span');
      feedback.className = 'edit-feedback';
      form.append(frontLabel, backLabel, quote, save, feedback);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        save.disabled = true;
        try {
          await api(`/api/spaces/${currentSpace.id}/decks/${deck.id}/cards/${card.id}`,
            { front: front.value, back: back.value });
          feedback.textContent = 'Saved';
          card.front = front.value.trim();
          card.back = back.value.trim();
          if (card.id === nextId) {
            const visibleCard = article.querySelector('.flashcard-review');
            visibleCard.querySelector('h4').textContent = card.front;
            visibleCard.querySelector('.card-answer').textContent = card.back;
          }
        } catch (error) { message(error, feedback); }
        finally { save.disabled = false; }
      });
      details.append(form);
    }
    article.append(title, requestDetails(deck), details);
    const roundReviews = deck.reviews.filter((review) => review.round === deck.currentRound);
    const nextId = deck.reviewCardIds.find((id) => !roundReviews.some((review) => review.cardId === id));
    const progress = document.createElement('p');
    progress.className = 'quiz-progress';
    progress.textContent = `Review round ${deck.currentRound} · ${roundReviews.length} of ${deck.reviewCardIds.length} rated`;
    article.append(progress);
    if (nextId !== undefined) {
      const card = deck.cards.find((item) => item.id === nextId);
      const review = document.createElement('section');
      review.className = 'flashcard-review';
      const front = document.createElement('h4');
      front.textContent = card.front;
      const reveal = document.createElement('button');
      reveal.type = 'button';
      reveal.textContent = 'Reveal answer';
      const answer = document.createElement('div');
      answer.hidden = true;
      const back = document.createElement('p');
      back.className = 'card-answer';
      back.textContent = card.back;
      const quote = document.createElement('blockquote');
      quote.textContent = card.sourceQuote;
      const buttons = document.createElement('div');
      buttons.className = 'generation-actions';
      for (const rating of ['again', 'good']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = rating === 'again' ? 'Again' : 'Good';
        button.addEventListener('click', async () => {
          buttons.querySelectorAll('button').forEach((item) => { item.disabled = true; });
          try {
            await api(`/api/spaces/${currentSpace.id}/decks/${deck.id}/cards/${card.id}/reviews`, { rating });
            await openSpace(currentSpace.id);
            status.textContent = `Rated ${rating}.`;
          } catch (error) { message(error); buttons.querySelectorAll('button').forEach((item) => { item.disabled = false; }); }
        });
        buttons.append(button);
      }
      answer.append(back, quote, buttons);
      reveal.addEventListener('click', () => { answer.hidden = false; reveal.hidden = true; });
      review.append(front, reveal, answer);
      article.append(review);
    } else {
      const againCount = roundReviews.filter((review) => review.rating === 'again').length;
      const summary = document.createElement('p');
      summary.textContent = `${roundReviews.length - againCount} Good · ${againCount} Again`;
      article.append(summary);
      for (const [scope, label] of [['again', 'Review Again cards'], ['all', 'Study all cards again']]) {
        if (scope === 'again' && !againCount) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = scope === 'all' ? 'secondary' : '';
        button.textContent = label;
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await api(`/api/spaces/${currentSpace.id}/decks/${deck.id}/review`, { scope });
            await openSpace(currentSpace.id);
          } catch (error) { message(error); button.disabled = false; }
        });
        article.append(button, document.createTextNode(' '));
      }
    }
    if (deck.currentRound > 1) {
      const history = document.createElement('details');
      history.className = 'quiz-history';
      const summary = document.createElement('summary');
      summary.textContent = 'Previous reviews';
      history.append(summary);
      for (const review of deck.reviews.filter((item) => item.round < deck.currentRound)) {
        const line = document.createElement('p');
        line.textContent = `Round ${review.round} · Card ${review.cardId}: ${review.rating === 'again' ? 'Again' : 'Good'}`;
        history.append(line);
      }
      article.append(history);
    }
    list.append(article);
  }
}

function renderRuns() {
  const list = document.querySelector('#runs');
  const picker = document.querySelector('#quiz-picker');
  const pickerWrap = document.querySelector('#quiz-picker-wrap');
  list.replaceChildren();
  picker.replaceChildren();
  const runs = currentSpace.runs.filter((run) => run.documentId === selectedDocumentId);
  pickerWrap.hidden = runs.length < 2;
  if (!runs.length) {
    list.textContent = selectedDocumentId
      ? 'No quiz for this document yet. Generate one above to start practicing.'
      : 'Add a document from the library to make a quiz.';
    return;
  }
  const reversed = [...runs].reverse();
  if (!runs.some((run) => run.id === selectedRunId)) selectedRunId = reversed[0].id;
  for (const [index, run] of reversed.entries()) {
    const option = document.createElement('option');
    option.value = run.id;
    option.textContent = `${run.type === 'quiz' ? 'Quiz' : 'Open-ended'} ${runs.length - index} · ${new Date(run.createdAt).toLocaleString()}`;
    picker.append(option);
  }
  picker.value = selectedRunId;
  const spaceId = currentSpace.id;
  for (const run of runs.filter((item) => item.id === selectedRunId)) {
    const roundNumber = run.currentRound ?? 1;
    const roundIds = run.practiceQuestionIds ?? run.questions.map((question) => question.id);
    const roundAttempts = run.attempts.filter((attempt) => (attempt.round ?? 1) === roundNumber);
    const article = document.createElement('article');
    article.className = 'panel run';
    const runHeader = document.createElement('div');
    runHeader.className = 'run-header';
    const heading = document.createElement('h3');
    const source = currentSpace.documents.find((item) => item.id === run.documentId);
    heading.textContent = `${source?.name || 'Document'} · ${new Date(run.createdAt).toLocaleString()}`;
    const badge = document.createElement('span');
    badge.className = 'run-badge';
    badge.textContent = run.type === 'quiz' ? `Quiz · round ${roundNumber}` : 'Open-ended · 3 questions';
    runHeader.append(heading, badge);
    const label = document.createElement('strong');
    label.className = 'overview-label';
    label.textContent = 'Main ideas';
    const overview = document.createElement('p');
    overview.className = 'run-overview';
    overview.textContent = run.overview;
    article.append(runHeader, label, overview, requestDetails(run));
    if (run.type === 'quiz') {
      const progress = document.createElement('p');
      progress.className = 'quiz-progress';
      progress.textContent = `${roundIds.filter((id) => roundAttempts.some((attempt) => attempt.questionId === id)).length} of ${roundIds.length} questions answered in this round`;
      article.append(progress);
    }
    const nextQuestionId = run.type === 'quiz'
      ? roundIds.find((id) => !roundAttempts.some((attempt) => attempt.questionId === id)) : undefined;
    const latestAnsweredId = roundAttempts.at(-1)?.questionId;
    const answeredQuestions = document.createElement('details');
    answeredQuestions.className = 'quiz-history answered-questions';
    const answeredSummary = document.createElement('summary');
    answeredSummary.textContent = 'Earlier answers';
    answeredQuestions.append(answeredSummary);
    for (const question of run.questions) {
      if (run.type === 'quiz') {
        if (!roundIds.includes(question.id)) continue;
        const attempt = [...roundAttempts].reverse().find((item) => item.questionId === question.id);
        const card = document.createElement('form');
        card.className = 'question';
        const title = document.createElement('h4');
        title.textContent = `${question.id}. ${question.text}`;
        const options = document.createElement('fieldset');
        const legend = document.createElement('legend');
        legend.textContent = 'Choose one answer';
        options.append(legend);
        question.options.forEach((option, index) => {
          const label = document.createElement('label');
          label.className = 'quiz-option';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = `answer-${run.id}-${question.id}`;
          radio.value = String(index);
          radio.required = !attempt;
          radio.disabled = Boolean(attempt);
          radio.checked = attempt?.optionIndex === index;
          label.append(radio, ` ${option}`);
          options.append(label);
        });
        card.append(title, options);
        if (attempt) {
          const result = document.createElement('div');
          result.className = `feedback ${attempt.correct ? 'is-correct' : 'is-incorrect'}`;
          const verdict = document.createElement('strong');
          verdict.textContent = attempt.correct ? 'Correct' : 'Incorrect';
          const selected = document.createElement('p');
          selected.textContent = `You chose: ${question.options[attempt.optionIndex]}`;
          const correct = document.createElement('p');
          correct.textContent = `Correct answer: ${question.options[question.correctIndex]}`;
          const explanation = document.createElement('p');
          explanation.textContent = question.explanation;
          const quote = document.createElement('blockquote');
          quote.textContent = question.sourceQuote;
          result.append(verdict, selected, correct, explanation, quote);
          card.append(result);
        } else {
          const button = document.createElement('button');
          button.textContent = 'Check answer';
          const feedbackStatus = document.createElement('div');
          feedbackStatus.setAttribute('aria-live', 'polite');
          card.append(button, feedbackStatus);
          card.addEventListener('submit', async (event) => {
            event.preventDefault();
            button.disabled = true;
            feedbackStatus.textContent = 'Checking answer…';
            try {
              const selected = card.querySelector('input[type="radio"]:checked');
              await api(`/api/spaces/${spaceId}/runs/${run.id}/answers`,
                { questionId: question.id, optionIndex: Number(selected.value) });
              await openSpace(spaceId);
              status.textContent = 'Quiz answer saved.';
            } catch (error) { message(error, feedbackStatus); }
            finally { button.disabled = false; }
          });
        }
        if (attempt && question.id === latestAnsweredId) article.append(card);
        else if (attempt) answeredQuestions.append(card);
        else if (question.id === nextQuestionId) article.append(card);
        continue;
      }
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
    if (run.type === 'quiz' && roundAttempts.length > 1) article.append(answeredQuestions);
    if (run.type === 'quiz' && roundIds.every((id) => roundAttempts.some((attempt) => attempt.questionId === id))) {
      const missed = roundIds.filter((id) => ![...roundAttempts].reverse().find((attempt) => attempt.questionId === id).correct);
      const result = document.createElement('div');
      result.className = 'round-result';
      const summary = document.createElement('strong');
      summary.textContent = missed.length
        ? `${roundIds.length - missed.length} of ${roundIds.length} correct · ${missed.length} to practice`
        : 'All questions correct in this round';
      result.append(summary);
      if (missed.length) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Practice missed questions';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await api(`/api/spaces/${spaceId}/runs/${run.id}/practice`, {});
            await openSpace(spaceId);
            status.textContent = 'Practice round ready.';
          } catch (error) { message(error); button.disabled = false; }
        });
        result.append(button);
      }
      article.append(result);
    }
    if (run.type === 'quiz' && roundNumber > 1) {
      const history = document.createElement('details');
      history.className = 'quiz-history';
      const summary = document.createElement('summary');
      summary.textContent = 'Previous rounds';
      history.append(summary);
      for (const attempt of run.attempts.filter((item) => (item.round ?? 1) < roundNumber)) {
        const line = document.createElement('p');
        line.textContent = `Round ${attempt.round ?? 1} · Question ${attempt.questionId}: ${attempt.correct ? 'Correct' : 'Incorrect'}`;
        history.append(line);
      }
      article.append(history);
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
  document.querySelector('#sidebar-documents').hidden = false;
  spaceSection.hidden = false;
  renderDocuments();
  renderRuns();
  renderDecks();
  renderMode();
  await refreshSpaces();
}

document.querySelector('#space-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#space-title');
  try {
    const { space } = await api('/api/spaces', { title: input.value });
    input.value = '';
    document.querySelector('.add-space').open = false;
    await openSpace(space.id);
    setLibraryOpen(true);
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
    const { document: added } = await api(`/api/spaces/${spaceId}/documents`, { name: file.name, text });
    input.value = '';
    document.querySelector('.add-document').open = false;
    selectedDocumentId = added.id;
    await openSpace(spaceId);
    setLibraryOpen(false);
    status.textContent = 'Document saved. Generate study materials when you are ready.';
  } catch (error) { message(error); }
});

async function generateMaterials(kinds) {
  const spaceId = currentSpace.id;
  const documentId = selectedDocumentId;
  const buttons = document.querySelectorAll('#run-form .generation-actions button');
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = `Generating ${kinds.join(' and ')}…`;
  try {
    const results = await Promise.allSettled(kinds.map((kind) => api(
      `/api/spaces/${spaceId}/${kind === 'quiz' ? 'runs' : 'decks'}`, { documentId })));
    if (results.some((result, index) => result.status === 'fulfilled' && kinds[index] === 'quiz')) selectedRunId = null;
    if (results.some((result, index) => result.status === 'fulfilled' && kinds[index] === 'flashcards')) selectedDeckId = null;
    if (kinds.length === 1 && kinds[0] === 'flashcards') activeMode = 'cards';
    if (kinds.length === 1 && kinds[0] === 'quiz') activeMode = 'quiz';
    await openSpace(spaceId);
    const saved = kinds.filter((_, index) => results[index].status === 'fulfilled');
    const failed = kinds.filter((_, index) => results[index].status === 'rejected');
    status.replaceChildren(document.createTextNode(saved.length ? `Saved ${saved.join(' and ')}. ` : ''));
    if (failed.length) {
      status.append(document.createTextNode(`${failed.join(' and ')} failed. Retry with its own button.`));
      results.forEach((result, index) => {
        if (result.status !== 'rejected') return;
        const line = document.createElement('p');
        line.textContent = `${kinds[index]}: ${result.reason.message}`;
        if (result.reason.details?.apiRequest) line.append(requestDetails(result.reason.details));
        status.append(line);
      });
    }
  } catch (error) { message(error); }
  finally { buttons.forEach((button) => { button.disabled = false; }); }
}

document.querySelector('#library-toggle').addEventListener('click', () => {
  setLibraryOpen(!document.querySelector('#library-sidebar').open);
});
document.querySelector('#library-close').addEventListener('click', () => setLibraryOpen(false));
document.querySelector('#library-sidebar').addEventListener('close', () => {
  document.querySelector('#library-toggle').setAttribute('aria-expanded', 'false');
});
document.querySelector('#library-sidebar').addEventListener('click', (event) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  if (event.target === event.currentTarget &&
      (event.clientX < bounds.left || event.clientX > bounds.right ||
       event.clientY < bounds.top || event.clientY > bounds.bottom)) setLibraryOpen(false);
});
document.querySelector('#mode-quiz').addEventListener('click', () => { activeMode = 'quiz'; renderMode(); });
document.querySelector('#mode-cards').addEventListener('click', () => { activeMode = 'cards'; renderMode(); });
document.querySelector('#quiz-picker').addEventListener('change', (event) => { selectedRunId = event.target.value; renderRuns(); });
document.querySelector('#deck-picker').addEventListener('change', (event) => { selectedDeckId = event.target.value; renderDecks(); });
document.querySelector('#run-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const documentId = selectedDocumentId;
  const kinds = [];
  if (!currentSpace.runs.some((run) => run.documentId === documentId && run.type === 'quiz')) kinds.push('quiz');
  if (!(currentSpace.decks ?? []).some((deck) => deck.documentId === documentId)) kinds.push('flashcards');
  if (kinds.length) await generateMaterials(kinds);
});
document.querySelector('#quiz-only').addEventListener('click', () => generateMaterials(['quiz']));
document.querySelector('#cards-only').addEventListener('click', () => generateMaterials(['flashcards']));

refreshSpaces().then(async (spaces) => {
  const chosen = spaces.find((space) => space.id === location.hash.slice(1)) || spaces[0];
  if (chosen) {
    await openSpace(chosen.id);
    setLibraryOpen(!currentSpace.documents.length);
  } else setLibraryOpen(true);
}).catch((error) => message(error));
