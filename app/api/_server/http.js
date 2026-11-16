export function json(status, value) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function body(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Invalid request.');
  const decoder = new TextDecoder();
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    if (raw.length > 80000) {
      await reader.cancel();
      throw new Error('Request is too large.');
    }
  }
  raw += decoder.decode();
  if (raw.length > 80000) throw new Error('Request is too large.');
  try { return JSON.parse(raw); } catch { throw new Error('Invalid request.'); }
}

export async function modelResult(generated, validate, save = async () => {}) {
  const { output, requestBody, usage, estimatedCostUsd } = generated;
  const details = { apiRequest: requestBody, usage, estimatedCostUsd };
  let checked;
  try { checked = validate(output); }
  catch (error) { return json(422, { error: error.message, ...details }); }
  const result = { ...checked, ...details };
  const saved = await save(result);
  if (saved instanceof Response) return saved;
  return json(200, result);
}
