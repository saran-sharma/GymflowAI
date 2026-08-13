/**
 * The only path from the app to GymFlow.
 *
 * The app never talks to PostgreSQL, never signs its own tokens, and never
 * sends a timestamp for an attendance event — the server decides when things
 * happened. This module also normalises every failure into an `ApiError` so
 * screens can show a real message instead of "Network request failed".
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: { field: string; error: string }[];

  constructor(status: number, code: string, message: string, fields?: { field: string; error: string }[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  /** True when retrying the same request might actually work. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
}

export const OFFLINE_CODE = 'offline';

export const UNCONFIGURED_CODE = 'api_not_configured';

/**
 * Where the API lives.
 *
 * `EXPO_PUBLIC_API_URL` wins everywhere. The guesses below only apply while
 * developing: an Android emulator needs 10.0.2.2 to reach the host machine's
 * localhost, which is the single most common reason a fresh checkout looks
 * like a broken backend.
 *
 * A *release* build gets no guesses. An installed APK that quietly points at
 * an emulator loopback address would look like a server outage to whoever is
 * holding the phone, so an unconfigured release build reports that plainly
 * instead — see the `UNCONFIGURED_CODE` branch in `request`.
 */
export function resolveBaseUrl(): string {
  const configured =
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (configured) return configured.replace(/\/+$/, '');

  if (!__DEV__) return '';

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8000`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:8000';
  return 'http://localhost:8000';
}

/** True when this build knows which server to talk to. */
export function isApiConfigured(): boolean {
  return resolveBaseUrl().length > 0;
}

export const API_PREFIX = '/api/v1';

const DEFAULT_TIMEOUT_MS = 15000;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface ErrorBody {
  detail?: string | { code?: string; message?: string; fields?: { field: string; error: string }[] };
}

function toApiError(status: number, body: unknown): ApiError {
  const detail = (body as ErrorBody)?.detail;

  if (typeof detail === 'string') {
    return new ApiError(status, `http_${status}`, detail);
  }
  if (detail && typeof detail === 'object') {
    return new ApiError(
      status,
      detail.code ?? `http_${status}`,
      detail.message ?? 'Something went wrong.',
      detail.fields,
    );
  }
  return new ApiError(status, `http_${status}`, `Request failed (${status}).`);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;

  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    // A build that was never told where the API is. Saying that plainly beats
    // a connection error the person holding the phone cannot act on.
    throw new ApiError(
      0,
      UNCONFIGURED_CODE,
      'This build has no GymFlow server configured. It was built without EXPO_PUBLIC_API_URL.',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${API_PREFIX}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    // A failed fetch is indistinguishable from "no network" at this layer, and
    // both mean the same thing to the user: nothing was recorded.
    const aborted = (error as Error)?.name === 'AbortError';
    throw new ApiError(
      0,
      OFFLINE_CODE,
      aborted
        ? 'The server took too long to respond. Check your connection and try again.'
        : 'No connection to GymFlow. Nothing was recorded.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) throw toApiError(response.status, payload);
  return payload as T;
}
