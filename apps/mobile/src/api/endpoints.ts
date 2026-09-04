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
  MemberCreateRequest,
  MemberCreateResult,
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

/**
 * Change the signed-in user's password.
 *
 * The server revokes every other refresh token on success, so the caller must
 * tell the person their other devices are now signed out — a password change is
 * usually a response to a suspected compromise, and silently leaving other
 * sessions alive would defeat it. Minimum length is 10, set server-side.
 */
export const changePassword = (currentPassword: string, newPassword: string, token: string) =>
  request<{ message: string }>('/auth/password', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
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

export const myToday = (token: string) => request<TrainerToday>('/attendance/me/today', { token });

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

export const myIncentive = (token: string) => request<IncentiveResult>('/incentives/me', { token });

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

export const registerMember = (body: MemberCreateRequest, token: string) =>
  request<MemberCreateResult>('/members', { method: 'POST', body, token });

/* ------------------------------------------------------------------- system */

export const health = () => request<{ status: string; server_time: string }>('/health');

/* ----------------------------------------------- the SLAM programme (V1.5) */

import type {
  ActivityEntry,
  AppAlert,
  AppSetting,
  AskAnswer,
  AskSuggestions,
  Assessment,
  AttendanceCorrection,
  BodyCompositionHistory,
  BranchPerformanceResponse,
  BroadcastRequest,
  BroadcastResult,
  CardioSession,
  ClassRosterEntry,
  CorrectionKind,
  Feeling,
  FollowUpTask,
  GroupClass,
  Journey,
  JourneyDay,
  MarketingDashboard,
  MemberActivity,
  MemberCheckIn,
  MemberHome,
  MemberIntake,
  MemberIntakeIn,
  MemberIntelligence,
  NeedsAttention,
  OccupancyForecast,
  OwnerDailyBrief,
  ProgressionRecommendation,
  PlanItemUpsert,
  PTOffer,
  PTPackage,
  PTSession,
  PtConversion,
  PTSplitView,
  RsvpAnswer,
  ScheduleItem,
  StrengthTrend,
  TrainerAttentionQueue,
  TrainerBrief,
  WeeklySummary,
  TrainerClient,
  TrainerClientDetail,
  TrainerPerformance,
  WorkoutItem,
  WorkoutPlan,
  WorkoutSession,
  WorkoutSet,
  WorkoutSetHistory,
  WorkoutSetInput,
  WorkoutSetLogged,
  WorkoutSplit,
} from './types';

/* ------------------------------------------------------------ member home */

export const memberHome = (token: string) => request<MemberHome>('/members/me/home', { token });

/** Today's "how are you feeling" answer. A same-day resubmit updates it. */
export const submitCheckIn = (feeling: Feeling, token: string) =>
  request<MemberCheckIn>('/members/me/checkin', { method: 'POST', body: { feeling }, token });

export const memberActivity = (token: string, limit = 40, offset = 0) =>
  request<ActivityEntry[]>(`/members/me/activity?limit=${limit}&offset=${offset}`, { token });

/**
 * One member's full operational picture — the same builder the trainer
 * desk's client-detail screen uses, opened up to any staff member allowed to
 * read this member (owner, branch manager, or the branch's trainers).
 */
export const getMember = (memberId: number, token: string) =>
  request<TrainerClientDetail>(`/members/${memberId}`, { token });

export const memberActivityStats = (memberId: number, token: string, weeks = 8) =>
  request<MemberActivity>(`/performance/members/${memberId}/activity?weeks=${weeks}`, { token });

/* ---------------------------------------------------------------- journey */

export const myStrengthTrend = (token: string) =>
  request<StrengthTrend>('/journeys/me/progress/strength', { token });

export const memberStrengthTrend = (memberId: number, token: string) =>
  request<StrengthTrend>(`/journeys/members/${memberId}/progress/strength`, { token });

export const myBodyComposition = (token: string) =>
  request<BodyCompositionHistory>('/journeys/me/progress/body-composition', { token });

export const memberBodyComposition = (memberId: number, token: string) =>
  request<BodyCompositionHistory>(`/journeys/members/${memberId}/progress/body-composition`, {
    token,
  });

/* ------------------------------------------------------------ intelligence */

export const myIntelligence = (token: string) =>
  request<MemberIntelligence>('/intelligence/me', { token });

export const memberIntelligence = (memberId: number, token: string) =>
  request<MemberIntelligence>(`/intelligence/members/${memberId}`, { token });

export const memberTrainerBrief = (memberId: number, token: string) =>
  request<TrainerBrief>(`/intelligence/members/${memberId}/brief`, { token });

export const trainerAttention = (token: string) =>
  request<TrainerAttentionQueue>('/intelligence/trainer/attention', { token });

export const ownerDailyBrief = (token: string, branchId?: number) =>
  request<OwnerDailyBrief>(
    `/intelligence/owner/daily-brief${branchId ? `?branch_id=${branchId}` : ''}`,
    { token },
  );

export const myExerciseRecommendation = (exercise: string, token: string, targetReps?: string) =>
  request<ProgressionRecommendation>(
    `/intelligence/me/exercises/${encodeURIComponent(exercise)}/recommendation${
      targetReps ? `?target_reps=${encodeURIComponent(targetReps)}` : ''
    }`,
    { token },
  );

export const askGymFlow = (
  question: string,
  token: string,
  memberId?: number,
) =>
  request<AskAnswer>('/intelligence/ask', {
    method: 'POST',
    body: memberId ? { question, member_id: memberId } : { question },
    token,
  });

export const askSuggestions = (token: string, memberId?: number) =>
  request<AskSuggestions>(
    `/intelligence/ask/suggestions${memberId ? `?member_id=${memberId}` : ''}`,
    { token },
  );

export const myWeeklySummary = (token: string, weekEnding?: string) =>
  request<WeeklySummary>(
    `/intelligence/me/weekly${weekEnding ? `?week_ending=${weekEnding}` : ''}`,
    { token },
  );

export const ownerWeeklySummary = (token: string, branchId?: number) =>
  request<WeeklySummary>(
    `/intelligence/owner/weekly${branchId ? `?branch_id=${branchId}` : ''}`,
    { token },
  );

export const memberExerciseRecommendation = (
  memberId: number,
  exercise: string,
  token: string,
  opts?: { targetReps?: string; beforeSessionId?: number },
) => {
  const params = new URLSearchParams();
  if (opts?.targetReps) params.set('target_reps', opts.targetReps);
  if (opts?.beforeSessionId) params.set('before_session_id', String(opts.beforeSessionId));
  const qs = params.toString();
  return request<ProgressionRecommendation>(
    `/intelligence/members/${memberId}/exercises/${encodeURIComponent(exercise)}/recommendation${
      qs ? `?${qs}` : ''
    }`,
    { token },
  );
};

export const myJourney = (token: string) => request<Journey | null>('/journeys/me', { token });

export const myJourneyDays = (token: string) =>
  request<JourneyDay[]>('/journeys/me/days', { token });

export const myAssessment = (token: string) =>
  request<Assessment | null>('/journeys/me/assessment', { token });

export const myIntake = (token: string) =>
  request<MemberIntake | null>('/members/me/intake', { token });

export const updateMyIntake = (payload: MemberIntakeIn, token: string) =>
  request<MemberIntake>('/members/me/intake', { method: 'PUT', body: payload, token });

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

export const memberPlan = (memberId: number, token: string) =>
  request<WorkoutPlan | null>(`/journeys/members/${memberId}/plan`, { token });

export const replacePlanSplit = (
  memberId: number,
  split: WorkoutSplit,
  items: PlanItemUpsert[],
  token: string,
) =>
  request<WorkoutPlan>(`/journeys/members/${memberId}/plan/${split}`, {
    method: 'PUT',
    body: items,
    token,
  });

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

export const setWorkoutItem = (sessionId: number, itemId: number, done: boolean, token: string) =>
  request<WorkoutItem>(`/journeys/workouts/${sessionId}/items/${itemId}`, {
    method: 'PATCH',
    body: { done },
    token,
  });

/* ----------------------------------------------------------- logged sets */

const setsPath = (sessionId: number, itemId: number) =>
  `/journeys/workouts/${sessionId}/items/${itemId}/sets`;

export const workoutSets = (sessionId: number, itemId: number, token: string) =>
  request<WorkoutSet[]>(setsPath(sessionId, itemId), { token });

/** Answers with the stored set *and* whatever it beat, in one round trip. */
export const logWorkoutSet = (
  sessionId: number,
  itemId: number,
  body: WorkoutSetInput,
  token: string,
) => request<WorkoutSetLogged>(setsPath(sessionId, itemId), { method: 'POST', body, token });

export const updateWorkoutSet = (
  sessionId: number,
  itemId: number,
  setId: number,
  body: Partial<WorkoutSetInput>,
  token: string,
) =>
  request<WorkoutSet>(`${setsPath(sessionId, itemId)}/${setId}`, {
    method: 'PATCH',
    body,
    token,
  });

export const deleteWorkoutSet = (sessionId: number, itemId: number, setId: number, token: string) =>
  request<{ message: string }>(`${setsPath(sessionId, itemId)}/${setId}`, {
    method: 'DELETE',
    token,
  });

/**
 * Past sessions of this lift, most recent first, plus the member's records for
 * it. Always a body — `sessions: []` is the answer for a lift never logged.
 */
export const exerciseHistory = (sessionId: number, itemId: number, token: string) =>
  request<WorkoutSetHistory>(`/journeys/workouts/${sessionId}/items/${itemId}/history`, {
    token,
  });

/** This member's whole history with one lift, by name — Progress's detailed
 * per-exercise view, reached without an open session to hang off. */
export const myExerciseHistory = (exercise: string, token: string) =>
  request<WorkoutSetHistory>(
    `/journeys/me/exercises/${encodeURIComponent(exercise)}/history`,
    { token },
  );

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

/** Evaluate and raise the caller's own contextual nudges (member / trainer).
 * Idempotent and cooldown-guarded — safe to call whenever the alert feed opens. */
export const sweepNudges = (token: string) =>
  request<{ raised: number; keys: string[] }>('/intelligence/nudges/sweep', {
    method: 'POST',
    token,
  });

export const unreadAlertCount = (token: string) =>
  request<{ count: number }>('/alerts/unread-count', { token });

export const acknowledgeAlert = (alertId: number, dismiss: boolean, token: string) =>
  request<AppAlert>(`/alerts/${alertId}/ack`, { method: 'POST', body: { dismiss }, token });

/** Sent as one alert per recipient — it lands in the inbox each of them already has. */
export const sendBroadcast = (body: BroadcastRequest, token: string) =>
  request<BroadcastResult>('/alerts/broadcast', { method: 'POST', body, token });

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
  request<MarketingDashboard>(`/marketing/dashboard${branchId ? `?branch_id=${branchId}` : ''}`, {
    token,
  });

export const marketingSources = (token: string) =>
  request<import('./types').MarketingSource[]>('/marketing/sources', { token });

/** Who a source actually brought in — the drill-down under one funnel row. */
export const sourceMembers = (sourceKey: string, token: string, branchId?: number) =>
  request<TrainerClient[]>(
    `/marketing/sources/${sourceKey}/members${branchId ? `?branch_id=${branchId}` : ''}`,
    { token },
  );

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

/**
 * Move a General Training member onto PT.
 *
 * `confirm` is required by the server and is not ceremony: this changes which
 * programme is authoritative for a member, so a stray tap must not be able to
 * do it. Send it only after the trainer has answered the confirmation.
 */
export const convertMemberToPt = (
  memberId: number,
  body: { sessions_total: number; confirm: true; note?: string },
  token: string,
) => request<PtConversion>(`/pt/members/${memberId}/convert`, { method: 'POST', body, token });

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

export const newMembers = (token: string, days = 90, branchId?: number) =>
  request<import('./types').NewMembers>(
    `/reports/new-members?days=${days}${branchId ? `&branch_id=${branchId}` : ''}`,
    { token },
  );

/* ---------------------------------------------------------------- payments */

export const revenueSummary = (token: string, days = 30, branchId?: number) =>
  request<import('./types').RevenueSummary>(
    `/payments/summary?days=${days}${branchId ? `&branch_id=${branchId}` : ''}`,
    { token },
  );

export const listPayments = (
  token: string,
  filters: {
    status?: import('./types').PaymentStatus;
    kind?: import('./types').PaymentKind;
    memberId?: number;
    branchId?: number;
  } = {},
) => {
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.kind) query.set('kind', filters.kind);
  if (filters.memberId) query.set('member_id', String(filters.memberId));
  if (filters.branchId) query.set('branch_id', String(filters.branchId));
  const suffix = query.toString();
  return request<import('./types').Payment[]>(`/payments${suffix ? `?${suffix}` : ''}`, { token });
};

export const myPayments = (token: string) =>
  request<import('./types').Payment[]>('/payments/me', { token });

/* --------------------------------------------------------------- live gym */

export const whoIsInside = (token: string, branchId?: number) =>
  request<import('./types').WhoIsInside>(
    `/attendance/inside${branchId ? `?branch_id=${branchId}` : ''}`,
    { token },
  );

/* --------------------------------------------------- workout templates & programs */

export const workoutTemplates = (token: string, branchId?: number) =>
  request<import('./types').WorkoutTemplate[]>(
    `/workout-templates${branchId ? `?branch_id=${branchId}` : ''}`,
    { token },
  );

export const workoutTemplate = (templateId: number, token: string) =>
  request<import('./types').WorkoutTemplate>(`/workout-templates/${templateId}`, { token });

export const memberWorkoutProgram = (memberId: number, token: string) =>
  request<import('./types').MemberWorkoutProgram | null>(
    `/members/${memberId}/program`,
    { token },
  );

/** Which programme day "start workout" would use right now, without
 * actually starting anything — the Workout screen's preview card. */
export const memberProgramToday = (memberId: number, token: string) =>
  request<import('./types').MemberWorkoutProgramDay | null>(
    `/members/${memberId}/program/today`,
    { token },
  );

export const applyWorkoutTemplate = (memberId: number, templateId: number, token: string) =>
  request<import('./types').MemberWorkoutProgram>(`/members/${memberId}/program/apply-template`, {
    method: 'POST',
    body: { template_id: templateId },
    token,
  });

export const createCustomProgram = (memberId: number, name: string, token: string) =>
  request<import('./types').MemberWorkoutProgram>(`/members/${memberId}/program/custom`, {
    method: 'POST',
    body: { name },
    token,
  });

export const addProgramDay = (
  memberId: number,
  payload: import('./types').AddProgramDayInput,
  token: string,
) =>
  request<import('./types').MemberWorkoutProgramDay>(`/members/${memberId}/program/days`, {
    method: 'POST',
    body: payload,
    token,
  });

export const renameProgramDay = (
  memberId: number,
  dayId: number,
  payload: import('./types').RenameProgramDayInput,
  token: string,
) =>
  request<import('./types').MemberWorkoutProgramDay>(
    `/members/${memberId}/program/days/${dayId}`,
    { method: 'PUT', body: payload, token },
  );

export const reorderProgramDays = (memberId: number, dayIds: number[], token: string) =>
  request<import('./types').MemberWorkoutProgramDay[]>(
    `/members/${memberId}/program/days/reorder`,
    { method: 'PUT', body: { day_ids: dayIds }, token },
  );

export const deleteProgramDay = (memberId: number, dayId: number, token: string) =>
  request<void>(`/members/${memberId}/program/days/${dayId}`, { method: 'DELETE', token });

export const addProgramExercise = (
  memberId: number,
  dayId: number,
  payload: import('./types').AddProgramExerciseInput,
  token: string,
) =>
  request<import('./types').MemberWorkoutProgramDay>(
    `/members/${memberId}/program/days/${dayId}/exercises`,
    { method: 'POST', body: payload, token },
  );

export const updateProgramExercise = (
  memberId: number,
  dayId: number,
  exerciseId: number,
  payload: import('./types').UpdateProgramExerciseInput,
  token: string,
) =>
  request<import('./types').MemberWorkoutProgramDay>(
    `/members/${memberId}/program/days/${dayId}/exercises/${exerciseId}`,
    { method: 'PUT', body: payload, token },
  );

export const reorderProgramExercises = (
  memberId: number,
  dayId: number,
  exerciseIds: number[],
  token: string,
) =>
  request<import('./types').MemberWorkoutProgramDay>(
    `/members/${memberId}/program/days/${dayId}/exercises/reorder`,
    { method: 'PUT', body: { exercise_ids: exerciseIds }, token },
  );

export const removeProgramExercise = (
  memberId: number,
  dayId: number,
  exerciseId: number,
  token: string,
) =>
  request<void>(`/members/${memberId}/program/days/${dayId}/exercises/${exerciseId}`, {
    method: 'DELETE',
    token,
  });

/* ------------------------------------------- trainer feedback & testimonials */

import { requestForm } from './client';
import type {
  MemberReview,
  ModerationReview,
  ProgressPhoto,
  ProgressPhotoUpdateInput,
  ProgressPhotoUploadInput,
  ProgressShareInput,
  ProgressSharePayload,
  RatingSummary,
  ReviewCreateInput,
  ReviewPrompt,
  TrainerReviewStatus,
  TrainerSummaryRow,
  TrainerTestimonials,
} from './types';

export const reviewPrompt = (
  params: { workoutSessionId?: number; ptSessionId?: number },
  token: string,
) => {
  const q = new URLSearchParams();
  if (params.workoutSessionId != null) q.set('workout_session_id', String(params.workoutSessionId));
  if (params.ptSessionId != null) q.set('pt_session_id', String(params.ptSessionId));
  return request<ReviewPrompt>(`/feedback/reviews/prompt?${q.toString()}`, { token });
};

export const submitTrainerReview = (payload: ReviewCreateInput, token: string) =>
  request<MemberReview>('/feedback/reviews', { method: 'POST', body: payload, token });

export const myTrainerReviews = (token: string) =>
  request<MemberReview[]>('/feedback/reviews/me', { token });

export const setReviewConsent = (reviewId: number, consent: boolean, token: string) =>
  request<MemberReview>(`/feedback/reviews/${reviewId}/consent`, {
    method: 'PATCH',
    body: { display_name_consent: consent },
    token,
  });

export const retractReview = (reviewId: number, token: string) =>
  request<{ message: string }>(`/feedback/reviews/${reviewId}`, { method: 'DELETE', token });

export const reportReview = (reviewId: number, reason: string | null, token: string) =>
  request<{ message: string }>(`/feedback/reviews/${reviewId}/report`, {
    method: 'POST',
    body: { reason },
    token,
  });

export const moderationQueue = (
  token: string,
  filter?: { status?: TrainerReviewStatus; reported?: boolean },
) => {
  const q = new URLSearchParams();
  if (filter?.status) q.set('status', filter.status);
  if (filter?.reported) q.set('reported', 'true');
  const query = q.toString();
  return request<ModerationReview[]>(`/feedback/reviews${query ? `?${query}` : ''}`, { token });
};

export const moderateReview = (
  reviewId: number,
  action: 'approve' | 'reject' | 'remove' | 'reinstate' | 'note',
  token: string,
  note?: string,
) =>
  request<ModerationReview>(`/feedback/reviews/${reviewId}/moderate`, {
    method: 'POST',
    body: { action, note },
    token,
  });

export const ownerTrainerSummaries = (token: string) =>
  request<TrainerSummaryRow[]>('/feedback/trainer-summaries', { token });

export const myRatingSummary = (token: string) =>
  request<RatingSummary>('/feedback/me/rating-summary', { token });

export const trainerTestimonials = (trainerId: number, token: string) =>
  request<TrainerTestimonials>(`/feedback/trainers/${trainerId}/testimonials`, { token });

/* ------------------------------------------------------------ progress photos */

export const myProgressPhotos = (token: string, angle?: 'front' | 'side' | 'back') =>
  request<ProgressPhoto[]>(`/members/me/progress-photos${angle ? `?angle=${angle}` : ''}`, {
    token,
  });

export const memberProgressPhotos = (memberId: number, token: string) =>
  request<ProgressPhoto[]>(`/members/${memberId}/progress-photos`, { token });

export const uploadProgressPhoto = (input: ProgressPhotoUploadInput, token: string) => {
  const form = new FormData();
  form.append('file', {
    // React Native's FormData file shape.
    uri: input.uri,
    name: input.file_name ?? `progress-${input.angle}.jpg`,
    type: input.mime_type ?? 'image/jpeg',
  } as unknown as Blob);
  form.append('angle', input.angle);
  form.append('taken_on', input.taken_on);
  if (input.note != null && input.note !== '') form.append('note', input.note);
  return requestForm<ProgressPhoto>('/members/me/progress-photos', form, { token });
};

export const updateProgressPhoto = (
  photoId: number,
  payload: ProgressPhotoUpdateInput,
  token: string,
) =>
  request<ProgressPhoto>(`/progress-photos/${photoId}`, {
    method: 'PATCH',
    body: payload,
    token,
  });

export const deleteProgressPhoto = (photoId: number, token: string) =>
  request<{ message: string }>(`/progress-photos/${photoId}`, { method: 'DELETE', token });

export const shareProgress = (payload: ProgressShareInput, token: string) =>
  request<ProgressSharePayload>('/members/me/progress-photos/share', {
    method: 'POST',
    body: payload,
    token,
  });
