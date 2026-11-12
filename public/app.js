const form = document.querySelector('#session-form');
const sourceInput = document.querySelector('#source');
const modeInput = document.querySelector('#mode');
const status = document.querySelector('#status');
const session = document.querySelector('#session');
const questions = document.querySelector('#questions');

async function api(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const source = sourceInput.value.trim();
  const start = document.querySelector('#start');
  start.disabled = true;
  status.textContent = 'Preparing your session…';
  session.hidden = true;
  try {
    const result = await api('/api/session', { source, mode: modeInput.value });
    document.querySelector('#overview-label').textContent = modeInput.value === 'summary' ? 'Summary' : 'Explanation';
    document.querySelector('#overview').textContent = result.overview;
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
          feedback.replaceChildren(level, message, quote);
        } catch (error) { feedback.textContent = error.message; }
        finally { button.disabled = false; }
      });
      questions.append(card);
    }
    session.hidden = false;
    status.textContent = 'Session ready.';
  } catch (error) { status.textContent = error.message; }
  finally { start.disabled = false; }
});
