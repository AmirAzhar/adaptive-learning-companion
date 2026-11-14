import type { AppError } from './types';

export async function api<T = unknown>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(path, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Request failed.') as AppError;
    error.details = result;
    throw error;
  }
  return result as T;
}
