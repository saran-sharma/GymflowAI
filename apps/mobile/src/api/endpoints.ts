/** Typed calls onto the GymFlow API. One function per screen need. */

import { request } from './client';
import type {
  AttendanceDay,
  Branch,
  BranchQr,
  CaptureMethod,
  CheckResponse,
  Dashboard,
  IncentiveResult,
  Insight,
  LoginResponse,
  MemberMe,
  MemberVisit,
  Occupancy,
  TokenPair,
  Trainer,
  TrainerDetail,
  TrainerToday,
  User,
} from './types';

/* --------------------------------------------------------------------- auth */

export const login = (email: string, password: string, deviceName?: string) =>
  request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), password, device_name: deviceName },
  });

export const refresh = (refreshToken: string) =>
  request<TokenPair>('/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken } });

export const logout = (refreshToken: string, token: string) =>
  request<{ message: string }>('/auth/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken },
    token,
  });

export const me = (token: string) => request<User>('/auth/me', { token });

export const setPin = (currentPassword: string, pin: string, token: string) =>
  request<{ message: string }>('/auth/pin', {
    method: 'POST',
    body: { current_password: currentPassword, pin },
    token,
  });

export const registerPushToken = (pushToken: string, token: string) =>
  request<{ message: string }>('/auth/push-token', {
    method: 'POST',
    body: { push_token: pushToken },
    token,
  });

/* ----------------------------------------------------------------- branches */

export const listBranches = (token: string) => request<Branch[]>('/branches', { token });

export const branchQr = (branchId: number, token: string) =>
  request<BranchQr>(`/branches/${branchId}/checkin-qr`, { token });

export const allOccupancy = (token: string) =>
  request<Occupancy[]>('/branches/occupancy', { token });

/* ----------------------------------------------------------- trainer & shift */

export const listTrainers = (token: string, branchId?: number) =>
  request<Trainer[]>(`/trainers${branchId ? `?branch_id=${branchId}` : ''}`, { token });

export const trainerDetail = (trainerId: number, token: string) =>
  request<TrainerDetail>(`/trainers/${trainerId}`, { token });

export const trainerAttendance = (trainerId: number, token: string) =>
  request<AttendanceDay[]>(`/trainers/${trainerId}/attendance`, { token });

/* --------------------------------------------------------------- attendance */

export const myToday = (token: string) =>
  request<TrainerToday>('/attendance/me/today', { token });

export const myAttendanceHistory = (token: string) =>
  request<AttendanceDay[]>('/attendance/me/history', { token });

export interface CheckPayload {
  branchId: number;
  method: Extract<CaptureMethod, 'qr' | 'pin'>;
  qrToken?: string;
  pin?: string;
  deviceInfo?: string;
}

/**
 * Note what is *not* here: a timestamp. The server records the moment it
 * receives the request, so a phone with a wound-forward clock changes nothing.
 */
const checkBody = (payload: CheckPayload) => ({
  branch_id: payload.branchId,
  method: payload.method,
  qr_token: payload.qrToken ?? null,
  pin: payload.pin ?? null,
  device_info: payload.deviceInfo ?? null,
});

export const checkIn = (payload: CheckPayload, token: string) =>
  request<CheckResponse>('/attendance/check-in', {
    method: 'POST',
    body: checkBody(payload),
    token,
  });

export const checkOut = (payload: CheckPayload, token: string) =>
  request<CheckResponse>('/attendance/check-out', {
    method: 'POST',
    body: checkBody(payload),
    token,
  });

/* --------------------------------------------------------------- incentives */

export const myIncentive = (token: string) =>
  request<IncentiveResult>('/incentives/me', { token });

export const listIncentives = (token: string, branchId?: number) =>
  request<IncentiveResult[]>(`/incentives${branchId ? `?branch_id=${branchId}` : ''}`, { token });

/* ------------------------------------------------------------------ reports */

export const dashboard = (token: string, branchId?: number) =>
  request<Dashboard>(`/reports/dashboard${branchId ? `?branch_id=${branchId}` : ''}`, { token });

export const branchComparison = (token: string) =>
  request<Dashboard['branches']>('/reports/branches', { token });

export const insights = (token: string) => request<Insight[]>('/reports/insights', { token });

/* ------------------------------------------------------------------ members */

export const memberMe = (token: string) => request<MemberMe>('/members/me', { token });

export const memberVisits = (token: string) =>
  request<MemberVisit[]>('/members/me/visits', { token });

export const memberOccupancy = (token: string) =>
  request<Occupancy>('/members/me/occupancy', { token });

export const memberAttendance = (
  branchId: number,
  eventType: 'check_in' | 'check_out',
  method: 'qr' | 'pin',
  credential: { qrToken?: string; pin?: string },
  token: string,
) =>
  request<{ message: string }>('/members/me/attendance', {
    method: 'POST',
    body: {
      branch_id: branchId,
      event_type: eventType,
      method,
      qr_token: credential.qrToken ?? null,
      pin: credential.pin ?? null,
    },
    token,
  });

/* ------------------------------------------------------------------- system */

export const health = () => request<{ status: string; server_time: string }>('/health');
