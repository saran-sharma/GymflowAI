/**
 * The API client is the app's only route to GymFlow, so its failure handling
 * is what every screen's error state depends on.
 */

import { ApiError, OFFLINE_CODE, request } from '../src/api/client';
import * as api from '../src/api/endpoints';

const mockFetch = global.fetch as jest.Mock;

function respond(status: number, body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('request', () => {
  it('returns the parsed body on success', async () => {
    respond(200, { status: 'ok' });
    await expect(request('/health')).resolves.toEqual({ status: 'ok' });
  });

  it('sends the bearer token when one is supplied', async () => {
    respond(200, {});
    await request('/auth/me', { token: 'abc123' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer abc123');
  });

  it('does not send an Authorization header when there is no token', async () => {
    respond(200, {});
    await request('/health');

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('turns a structured error body into an ApiError with its code', async () => {
    respond(409, { detail: { code: 'already_checked_in', message: 'You are already checked in.' } });

    await expect(request('/attendance/check-in', { method: 'POST' })).rejects.toMatchObject({
      status: 409,
      code: 'already_checked_in',
      message: 'You are already checked in.',
    });
  });

  it('handles a plain-string detail', async () => {
    respond(403, { detail: 'Not permitted' });
    await expect(request('/reports/dashboard')).rejects.toMatchObject({
      status: 403,
      message: 'Not permitted',
    });
  });

  it('reports a network failure as offline, and says nothing was recorded', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

    let error: ApiError | null = null;
    try {
      await request('/attendance/check-in', { method: 'POST' });
    } catch (caught) {
      error = caught as ApiError;
    }

    expect(error).toBeInstanceOf(ApiError);
    expect(error?.code).toBe(OFFLINE_CODE);
    expect(error?.message).toContain('Nothing was recorded');
  });

  it('marks 5xx and offline as retryable, and 4xx as not', async () => {
    expect(new ApiError(0, OFFLINE_CODE, '').isRetryable).toBe(true);
    expect(new ApiError(503, 'x', '').isRetryable).toBe(true);
    expect(new ApiError(429, 'rate_limited', '').isRetryable).toBe(true);
    expect(new ApiError(409, 'already_checked_in', '').isRetryable).toBe(false);
    expect(new ApiError(401, 'x', '').isAuthError).toBe(true);
  });

  it('survives a body that is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => '<html>Bad Gateway</html>',
    });
    await expect(request('/health')).rejects.toMatchObject({ status: 502 });
  });
});

describe('check-in payloads', () => {
  it('never sends a client timestamp', async () => {
    respond(200, {});
    await api.checkIn(
      { branchId: 4, method: 'pin', pin: '135790', deviceInfo: 'test' },
      'token',
    );

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(Object.keys(body).sort()).toEqual([
      'branch_id',
      'device_info',
      'method',
      'pin',
      'qr_token',
    ]);
    // The server decides when a check-in happened. Anything time-shaped here
    // would be a way for a phone's clock to influence attendance.
    for (const key of Object.keys(body)) {
      expect(key).not.toMatch(/time|_at|date|stamp/i);
    }
  });

  it('sends the scanned QR token verbatim', async () => {
    respond(200, {});
    await api.checkOut({ branchId: 4, method: 'qr', qrToken: 'GFQ1.4.999.abcdef' }, 'token');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/attendance/check-out');
    expect(JSON.parse(init.body).qr_token).toBe('GFQ1.4.999.abcdef');
  });

  it('lower-cases and trims the email on login', async () => {
    respond(200, {});
    await api.login('  Owner@SLAM.demo ', 'password123');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).email).toBe('owner@slam.demo');
  });
});
