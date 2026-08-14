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

/* ----------------------------------------------- the SLAM programme (V1.5) */

import type {
  ActivityEntry,
  AppAlert,
  AppSetting,
  Assessment,
  AttendanceCorrection,
  BranchPerformanceResponse,
  CardioSession,
  ClassRosterEntry,
  CorrectionKind,
  FollowUpTask,
  GroupClass,
  Journey,
  JourneyDay,
  MarketingDashboard,
  MemberActivity,
  MemberHome,
  NeedsAttention,
  OccupancyForecast,
  PTOffer,
  PTPackage,
  PTSession,
  PTSplitView,
  RsvpAnswer,
  ScheduleItem,
  TrainerPerformance,
  WorkoutItem,
  WorkoutSession,
  WorkoutSplit,
} from './types';

/* ------------------------------------------------------------ member home */

export const memberHome = (token: string) => request<MemberHome>('/members/me/home', { token });

export const memberActivity = (token: string, limit = 40, offset = 0) =>
  request<ActivityEntry[]>(`/members/me/activity?limit=${limit}&offset=${offset}`, { token });

export const memberActivityStats = (memberId: number, token: string, weeks = 8) =>
  request<MemberActivity>(`/performance/members/${memberId}/activity?weeks=${weeks}`, { token });

/* ---------------------------------------------------------------- journey */

export const myJourney = (token: string) => request<Journey | null>('/journeys/me', { token });

export const myJourneyDays = (token: string) =>
  request<JourneyDay[]>('/journeys/me/days', { token });

export const myAssessment = (token: string) =>
  request<Assessment | null>('/journeys/me/assessment', { token });

export const myCardio = (token: string) =>
  request<CardioSession[]>('/journeys/me/cardio', { token });

export const memberJourney = (memberId: number, token: string) =>
  request<Journey | null>(`/journeys/members/${memberId}`, { token });

export const startJourney = (memberId: number, token: string, trainerId?: number) =>
  request<Journey>('/journeys', {
    method: 'POST',
    body: { member_id: memberId, trainer_id: trainerId ?? null },
    token,
  });

export const recordAssessment = (
  journeyId: number,
  body: { goal?: string; notes?: string; completed?: boolean },
  token: string,
) => request<Assessment>(`/journeys/${journeyId}/assessment`, { method: 'POST', body, token });

export const recordCardio = (
  journeyId: number,
  body: { day_number: number; duration_minutes: number; machine?: string },
  token: string,
) => request<CardioSession>(`/journeys/${journeyId}/cardio`, { method: 'POST', body, token });

export const journeysReadyForPt = (token: string) =>
  request<Journey[]>('/journeys?ready_for_pt=true', { token });

export const journeys = (token: string, branchId?: number) =>
  request<Journey[]>(`/journeys${branchId ? `?branch_id=${branchId}` : ''}`, { token });

/* --------------------------------------------------------------- workouts */

export const todayWorkout = (token: string) =>
  request<WorkoutSession | null>('/journeys/me/workout/today', { token });

export const startWorkout = (token: string, split?: WorkoutSplit) =>
  request<WorkoutSession>('/journeys/me/workout/start', {
    method: 'POST',
    body: { split: split ?? null },
    token,
  });

export const setWorkoutItem = (
  sessionId: number,
  itemId: number,
  done: boolean,
  token: string,
) =>
  request<WorkoutItem>(`/journeys/workouts/${sessionId}/items/${itemId}`, {
    method: 'PATCH',
    body: { done },
    token,
  });

export const completeWorkout = (sessionId: number, token: string) =>
  request<WorkoutSession>(`/journeys/workouts/${sessionId}/complete`, { method: 'POST', token });

/* --------------------------------------------------------------------- PT */

export const myPtPackage = (token: string) =>
  request<PTPackage | null>('/pt/me/package', { token });

export const myPtSessions = (token: string) => request<PTSession[]>('/pt/me/sessions', { token });

export const myNextPtSession = (token: string) =>
  request<PTSession | null>('/pt/me/next', { token });

export const ptOffer = (token: string) => request<PTOffer>('/pt/me/offer', { token });

export const ptOptions = (token: string) => request<number[]>('/pt/options', { token });

export const trainerPtToday = (token: string) =>
  request<PTSession[]>('/pt/trainer/today', { token });

export const ptSplitView = (sessionId: number, token: string) =>
  request<PTSplitView>(`/pt/sessions/${sessionId}`, { token });

export const ptRecordArrival = (sessionId: number, who: 'member' | 'trainer', token: string) =>
  request<PTSplitView>(`/pt/sessions/${sessionId}/arrival`, {
    method: 'POST',
    body: { who },
    token,
  });

export const ptCompleteSession = (sessionId: number, token: string, notes?: string) =>
  request<PTSession>(`/pt/sessions/${sessionId}/complete`, {
    method: 'POST',
    body: { notes: notes ?? null },
    token,
  });

export const ptCloseSession = (
  sessionId: number,
  outcome: 'cancelled' | 'no_show' | 'missed',
  token: string,
  notes?: string,
) =>
  request<PTSession>(`/pt/sessions/${sessionId}/close`, {
    method: 'POST',
    body: { outcome, notes: notes ?? null },
    token,
  });

export const ptPackages = (token: string, branchId?: number) =>
  request<PTPackage[]>(`/pt/packages${branchId ? `?branch_id=${branchId}` : ''}`, { token });

export const createPtPackage = (
  body: { member_id: number; sessions_total: number; trainer_id?: number },
  token: string,
) => request<PTPackage>('/pt/packages', { method: 'POST', body, token });

/* ---------------------------------------------------------- group classes */

export const listClasses = (token: string, branchId?: number) =>
  request<GroupClass[]>(`/classes${branchId ? `?branch_id=${branchId}` : ''}`, { token });

export const classDetail = (classId: number, token: string) =>
  request<GroupClass>(`/classes/${classId}`, { token });

export const rsvpClass = (classId: number, response: RsvpAnswer, token: string) =>
  request<GroupClass>(`/classes/${classId}/rsvp`, { method: 'POST', body: { response }, token });

export const classRoster = (classId: number, token: string) =>
  request<ClassRosterEntry[]>(`/classes/${classId}/roster`, { token });

export const createClass = (
  body: {
    branch_id: number;
    name: string;
    starts_at: string;
    trainer_id?: number;
    capacity?: number;
    description?: string;
    announcement?: string;
  },
  token: string,
) => request<GroupClass>('/classes', { method: 'POST', body, token });

export const recordClassAttendance = (
  classId: number,
  memberIds: number[],
  attended: boolean,
  token: string,
) =>
  request<{ message: string }>(`/classes/${classId}/attendance`, {
    method: 'POST',
    body: { member_ids: memberIds, attended },
    token,
  });

/* ------------------------------------------------------- trainer schedule */

export const myScheduleToday = (token: string) =>
  request<ScheduleItem[]>('/sessions/me/today', { token });

export const completeSupportSession = (sessionId: number, token: string) =>
  request<WorkoutSession>(`/sessions/support/${sessionId}/complete`, { method: 'POST', token });

/* ------------------------------------------------------------------ alerts */

export const listAlerts = (token: string) => request<AppAlert[]>('/alerts', { token });

export const unreadAlertCount = (token: string) =>
  request<{ count: number }>('/alerts/unread-count', { token });

export const acknowledgeAlert = (alertId: number, dismiss: boolean, token: string) =>
  request<AppAlert>(`/alerts/${alertId}/ack`, { method: 'POST', body: { dismiss }, token });

export const listTasks = (token: string) => request<FollowUpTask[]>('/tasks', { token });

export const completeTask = (taskId: number, token: string) =>
  request<FollowUpTask>(`/tasks/${taskId}/complete`, { method: 'POST', token });

/* ------------------------------------------------------------ corrections */

export const requestCorrection = (
  body: {
    attendance_id: number;
    correction_type: CorrectionKind;
    reason: string;
    requested_check_in_at?: string | null;
    requested_check_out_at?: string | null;
  },
  token: string,
) => request<AttendanceCorrection>('/attendance/corrections', { method: 'POST', body, token });

export const listCorrections = (token: string) =>
  request<AttendanceCorrection[]>('/attendance/corrections', { token });

export const reviewCorrection = (
  correctionId: number,
  approve: boolean,
  token: string,
  note?: string,
) =>
  request<AttendanceCorrection>(`/attendance/corrections/${correctionId}/review`, {
    method: 'POST',
    body: { approve, note: note ?? null },
    token,
  });

/* ------------------------------------------------------- owner operations */

export const needsAttention = (token: string) =>
  request<NeedsAttention>('/reports/needs-attention', { token });

export const branchPerformance = (token: string, period: 'today' | 'week' | 'month' = 'week') =>
  request<BranchPerformanceResponse>(`/performance/branches?period=${period}`, { token });

export const trainerPerformance = (trainerId: number, token: string) =>
  request<TrainerPerformance>(`/performance/trainers/${trainerId}`, { token });

export const occupancyForecast = (branchId: number, token: string) =>
  request<OccupancyForecast>(`/performance/occupancy/${branchId}/forecast`, { token });

export const marketingDashboard = (token: string, branchId?: number) =>
  request<MarketingDashboard>(
    `/marketing/dashboard${branchId ? `?branch_id=${branchId}` : ''}`,
    { token },
  );

export const marketingSources = (token: string) =>
  request<import('./types').MarketingSource[]>('/marketing/sources', { token });

export const runAutomations = (token: string) =>
  request<{ ran_at: string; branches: unknown[] }>('/settings/automations/run', {
    method: 'POST',
    token,
  });

export const listSettings = (token: string) => request<AppSetting[]>('/settings', { token });

export const updateSetting = (key: string, value: unknown, token: string) =>
  request<AppSetting>(`/settings/${key}`, {
    method: 'PUT',
    body: { value, branch_id: null },
    token,
  });

/* ------------------------------------------------------ the trainer's desk */

export const myClients = (token: string) =>
  request<import('./types').TrainerClient[]>('/trainers/me/clients', { token });

export const myClientDetail = (memberId: number, token: string) =>
  request<import('./types').TrainerClientDetail>(`/trainers/me/clients/${memberId}`, { token });

export const myAvailability = (token: string, days = 14) =>
  request<import('./types').AvailabilitySlot[]>(`/trainers/me/availability?days=${days}`, {
    token,
  });

export const publishAvailability = (
  slotDate: string,
  slots: import('./types').AvailabilitySlotInput[],
  token: string,
) =>
  request<import('./types').AvailabilitySlot[]>('/trainers/me/availability', {
    method: 'POST',
    body: { slot_date: slotDate, slots },
    token,
  });

export const removeAvailability = (slotId: number, token: string) =>
  request<{ message: string }>(`/trainers/me/availability/${slotId}`, {
    method: 'DELETE',
    token,
  });

/* ------------------------------------------------------------- owner desk */

export const renewalsDue = (token: string, days = 30, branchId?: number) =>
  request<import('./types').Renewals>(
    `/reports/renewals?days=${days}${branchId ? `&branch_id=${branchId}` : ''}`,
    { token },
  );
