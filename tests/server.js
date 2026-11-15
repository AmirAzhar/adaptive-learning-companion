import http from 'node:http';
import { handleRequest } from '../app/api/_server/index.js';

export const server = http.createServer(async (incoming, outgoing) => {
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const request = new Request(`http://127.0.0.1${incoming.url}`, {
    method: incoming.method,
    headers: incoming.headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
  const response = await handleRequest(request);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});
