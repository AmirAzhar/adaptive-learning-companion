export function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
  return true;
}

export async function body(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 80000) throw new Error('Request is too large.');
  }
  try { return JSON.parse(raw); } catch { throw new Error('Invalid request.'); }
}

export async function modelResult(response, generated, validate, save = async () => {}) {
  const { output, requestBody, usage, estimatedCostUsd } = generated;
  const details = { apiRequest: requestBody, usage, estimatedCostUsd };
  let checked;
  try { checked = validate(output); }
  catch (error) { return json(response, 422, { error: error.message, ...details }); }
  const result = { ...checked, ...details };
  await save(result);
  return json(response, 200, result);
}
