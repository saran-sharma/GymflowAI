/** Response shapes from the GymFlow API. Mirrors backend/app/schemas/common.py. */

export type Role = 'super_admin' | 'owner' | 'branch_manager' | 'trainer' | 'member';

export type CaptureMethod = 'qr' | 'pin' | 'fingerprint' | 'rfid' | 'face' | 'manual';

export type AttendanceStatus =
  | 'scheduled'
  | 'on_time'
  | 'late'
  | 'early_exit'
  | 'late_and_early_exit'
  | 'absent'
  | 'missing_checkout'
  | 'completed';

export type IncentiveStatus = 'eligible' | 'not_eligible' | 'needs_review';

export interface BranchBrief {
  id: number;
  code: string;
  name: string;
  city: string | null;
  timezone: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  branch_id: number | null;
  branch: BranchBrief | null;
  has_pin: boolean;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface LoginResponse {
  user: User;
  tokens: TokenPair;
}

export interface Branch extends BranchBrief {
  address: string | null;
  capacity: number;
  is_active: boolean;
}

export interface BranchQr {
  branch_id: number;
  branch_code: string;
  token: string;
  rotates_in_seconds: number;
  window_seconds: number;
  server_time: string;
}

export interface Occupancy {
  branch_id: number;
  branch_name: string;
  inside: number;
  capacity: number;
  occupancy_pct: number;
  crowd_level: string;
  entries_today: number;
  exits_today: number;
  as_of: string;
}

export interface Trainer {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  employee_code: string;
  designation: string | null;
  specialty: string | null;
  branch_id: number;
  branch_name: string;
  is_active: boolean;
}

export interface TrainerToday {
  trainer: Trainer;
  work_date: string;
  server_time: string;
  has_shift: boolean;
  shift_start: string | null;
  shift_end: string | null;
  shift_label: string | null;
  grace_minutes: number;
  status: AttendanceStatus;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number;
  early_exit_minutes: number;
  can_check_in: boolean;
  can_check_out: boolean;
  methods_enabled: CaptureMethod[];
}

export interface AttendanceDay {
  id: number;
  trainer_id: number;
  branch_id: number;
  work_date: string;
  status: AttendanceStatus;
  scheduled_start: string | null;
  scheduled_end: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_method: CaptureMethod | null;
  check_out_method: CaptureMethod | null;
  late_minutes: number;
  early_exit_minutes: number;
  worked_minutes: number;
  grace_minutes: number;
}

export interface IncentiveCheck {
  key: string;
  label: string;
  passed: boolean;
  near_miss: boolean;
  actual: number;
  threshold: number;
}

export interface TrainerDetail {
  trainer: Trainer;
  current_status: AttendanceStatus;
  today: AttendanceDay | null;
  shift_label: string | null;
  month_punctuality_pct: number;
  month_attendance_pct: number;
  late_count: number;
  early_exit_count: number;
  absent_count: number;
  missing_checkout_count: number;
  completed_shifts: number;
  scheduled_shifts: number;
  incentive_status: IncentiveStatus;
  incentive_checks: IncentiveCheck[];
  incentive_disclaimer: string;
}

export interface CheckResponse {
  message: string;
  server_time: string;
  branch_id: number;
  branch_name: string;
  status: AttendanceStatus;
  shift_start: string | null;
  shift_end: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number;
  early_exit_minutes: number;
  worked_minutes: number;
}

export interface IncentiveResult {
  trainer_id: number;
  trainer_name: string;
  branch_id: number;
  branch_name: string;
  period_start: string;
  period_end: string;
  punctuality_pct: number;
  attendance_pct: number;
  late_count: number;
  early_exit_count: number;
  absent_count: number;
  missing_checkout_count: number;
  completed_shifts: number;
  scheduled_shifts: number;
  score: number;
  status: IncentiveStatus;
  checks: IncentiveCheck[];
  disclaimer: string;
}

export interface BranchSummary {
  branch_id: number;
  branch_code: string;
  branch_name: string;
  scheduled: number;
  present: number;
  on_time: number;
  late: number;
  absent: number;
  early_exit: number;
  missing_checkout: number;
  punctuality_pct: number;
  member_count: number;
  occupancy: Occupancy | null;
}

export interface Dashboard {
  work_date: string;
  server_time: string;
  total_trainers: number;
  total_members: number;
  scheduled: number;
  present: number;
  late: number;
  absent: number;
  early_exit: number;
  missing_checkout: number;
  punctuality_pct: number;
  branches: BranchSummary[];
}

export interface Membership {
  id: number;
  plan_name: string;
  status: 'active' | 'expired' | 'frozen' | 'cancelled';
  starts_on: string;
  ends_on: string;
  pt_sessions_total: number;
  pt_sessions_used: number;
}

export interface MemberMe {
  member_id: number;
  member_code: string;
  full_name: string;
  branch: BranchBrief;
  joined_on: string | null;
  membership: Membership | null;
  days_remaining: number | null;
  assigned_trainer: Trainer | null;
  visits_this_month: number;
  is_inside: boolean;
}

export interface MemberVisit {
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  minutes: number | null;
}

export interface Insight {
  key: string;
  title: string;
  detail: string;
  severity: 'critical' | 'warning' | 'info';
  data: Record<string, unknown>;
}

/* ------------------------------------------------- the SLAM programme (V1.5) */

export type WorkoutSplit = 'assessment' | 'cardio' | 'push' | 'pull' | 'legs' | 'rest';
export type JourneyPhase = 'not_started' | 'assessment' | 'training' | 'complete';
export type JourneyState = 'active' | 'completed' | 'paused' | 'cancelled';
export type SessionState =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'missed'
  | 'no_show';
export type PackageState = 'active' | 'completed' | 'expired' | 'cancelled';
export type RsvpAnswer = 'pending' | 'yes' | 'no';
export type ItemState = 'pending' | 'completed' | 'skipped';
export type DayState = 'pending' | 'in_progress' | 'completed' | 'missed';
export type AssessmentState = 'not_started' | 'in_progress' | 'completed';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertState = 'open' | 'acknowledged' | 'resolved' | 'dismissed';
export type CorrectionKind =
  | 'missing_checkout'
  | 'late_reason'
  | 'early_exit_reason'
  | 'wrong_check_in'
  | 'shift_correction';
export type CorrectionState = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface Journey {
  id: number;
  member_id: number;
  member_name: string;
  branch_id: number;
  journey_type: string;
  status: JourneyState;
  start_date: string;
  end_date: string;
  duration_days: number;
  assessment_days: number;
  current_day: number;
  phase: JourneyPhase;
  split_today: WorkoutSplit;
  assessment_status: AssessmentState;
  cardio_completed: number;
  cardio_required: number;
  days_completed: number;
  workouts_completed: number;
  completion_pct: number;
  completed_on: string | null;
  completion_summary: Record<string, unknown> | null;
  assigned_trainer_id: number | null;
  assigned_trainer_name: string | null;
  pt_converted: boolean;
  is_demo: boolean;
}

export interface JourneyDay {
  day_number: number;
  planned_on: string;
  split: WorkoutSplit;
  status: DayState;
  completed_at: string | null;
}

export type Feeling = 'great' | 'good' | 'okay' | 'tired' | 'low';

/** The member's own daily "how are you feeling" answer — nothing inferred from it. */
export interface MemberCheckIn {
  id: number;
  work_date: string;
  feeling: Feeling;
  created_at: string;
}

export interface Assessment {
  id: number;
  status: AssessmentState;
  goal: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  notes: string | null;
  trainer_id: number | null;
  recorded_at: string | null;
}

export interface CardioSession {
  id: number;
  day_number: number;
  duration_minutes: number;
  machine: string | null;
  completed_at: string;
}

export interface WorkoutItem {
  id: number;
  order_index: number;
  exercise: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  status: ItemState;
  completed_at: string | null;
  /** Sets actually logged, against the `sets` the plan prescribed. */
  sets_logged: number;
}

export interface WorkoutSession {
  id: number;
  member_id: number;
  branch_id: number;
  journey_id: number | null;
  day_number: number | null;
  split: WorkoutSplit;
  split_label: string;
  session_date: string;
  status: SessionState;
  started_at: string | null;
  completed_at: string | null;
  supervising_trainer_id: number | null;
  items: WorkoutItem[];
  completed_items: number;
  total_items: number;
}

/**
 * One performed set. `weight_kg` is 0 for bodyweight work — a real answer, not
 * a missing one — while `rpe` is genuinely optional and stays null when the
 * member did not record it.
 */
export interface WorkoutSet {
  id: number;
  session_item_id: number;
  set_number: number;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  completed_at: string | null;
}

export interface WorkoutSetInput {
  set_number: number;
  weight_kg: number;
  reps: number;
  rpe?: number | null;
}

/** One past session of one exercise, with what it adds up to. */
export interface ExerciseSession {
  session_id: number;
  session_date: string;
  split: WorkoutSplit;
  split_label: string;
  sets: WorkoutSet[];
  volume_kg: number;
  top_weight_kg: number;
  total_reps: number;
  /** Null when no set carried one — never 0, which would read as effortless. */
  average_rpe: number | null;
}

export type RecordKind = 'heaviest_weight' | 'best_reps_at_weight' | 'session_volume';

/**
 * Something a logged set beat. Numbers, not sentences: the app already knows
 * how to render a load, and a server-built string would drift from it.
 */
export interface PersonalRecord {
  kind: RecordKind;
  weight_kg: number;
  reps: number;
  volume_kg: number | null;
  previous_weight_kg: number | null;
  previous_reps: number | null;
  previous_volume_kg: number | null;
}

/**
 * A member's history with one lift. `sessions` is most recent first and never
 * includes the session being worked in. An empty list is the honest answer for
 * a first-ever session; the records look at every set, not just those sessions.
 */
export interface WorkoutSetHistory {
  exercise: string;
  sessions: ExerciseSession[];
  heaviest: WorkoutSet | null;
  best_volume_kg: number | null;
  best_volume_on: string | null;
}

/** A stored set, and anything it beat. */
export interface WorkoutSetLogged {
  set: WorkoutSet;
  records: PersonalRecord[];
}

export interface PTPackage {
  id: number;
  member_id: number;
  member_name: string | null;
  branch_id: number;
  trainer_id: number | null;
  trainer_name: string | null;
  sessions_total: number;
  sessions_used: number;
  sessions_remaining: number;
  status: PackageState;
  start_date: string;
  expiry_date: string | null;
  origin: string;
  price_amount: number | null;
  currency: string | null;
  low_balance: boolean;
}

export interface PTSession {
  id: number;
  package_id: number;
  member_id: number;
  member_name: string | null;
  trainer_id: number;
  trainer_name: string | null;
  branch_id: number;
  session_date: string;
  scheduled_start: string;
  scheduled_end: string | null;
  session_number: number;
  package_size: number | null;
  status: SessionState;
  member_checked_in_at: string | null;
  trainer_checked_in_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

export interface PTSplitView {
  session: PTSession;
  member_name: string;
  trainer_name: string;
  member_checked_in: boolean;
  trainer_checked_in: boolean;
  can_complete: boolean;
}

export interface PTOffer {
  eligible: boolean;
  headline: string;
  message: string;
  benefits: string[];
  options: {
    sessions: number;
    label: string;
    price_amount: number | null;
    currency: string | null;
  }[];
  disclaimer: string;
}

export interface GroupClass {
  id: number;
  branch_id: number;
  branch_name: string | null;
  trainer_id: number | null;
  trainer_name: string | null;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  class_date: string;
  capacity: number;
  status: 'scheduled' | 'cancelled' | 'completed';
  announcement: string | null;
  yes_count: number;
  no_count: number;
  pending_count: number;
  attended_count: number;
  available: number;
  show_up_pct: number;
  my_response: RsvpAnswer | null;
}

export interface ClassRosterEntry {
  member_id: number;
  member_name: string;
  response: RsvpAnswer;
  attended: boolean | null;
}

export interface ScheduleItem {
  kind: 'pt' | 'group_class' | 'own_workout_support';
  reference_id: number;
  title: string;
  subtitle: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: SessionState;
  member_id: number | null;
  member_name: string | null;
  branch_id: number | null;
  session_number: number | null;
  package_size: number | null;
  attendees: number | null;
  can_complete: boolean;
}

export interface AppAlert {
  id: number;
  branch_id: number | null;
  key: string;
  severity: AlertSeverity;
  status: AlertState;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  action_route: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

export interface FollowUpTask {
  id: number;
  branch_id: number;
  member_id: number | null;
  assigned_trainer_id: number | null;
  key: string;
  title: string;
  detail: string | null;
  due_on: string | null;
  status: string;
  completed_at: string | null;
}

export interface AttendanceCorrection {
  id: number;
  trainer_attendance_id: number;
  trainer_id: number;
  trainer_name: string | null;
  branch_id: number;
  work_date: string;
  correction_type: CorrectionKind;
  status: CorrectionState;
  reason: string;
  requested_check_in_at: string | null;
  requested_check_out_at: string | null;
  original_check_in_at: string | null;
  original_check_out_at: string | null;
  original_status: AttendanceStatus | null;
  new_status: AttendanceStatus | null;
  requested_by_user_id: number;
  reviewed_by_user_id: number | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface NeedsAttention {
  items: {
    id: number;
    key: string;
    severity: AlertSeverity;
    title: string;
    body: string;
    branch_id: number | null;
    entity_type: string | null;
    entity_id: string | null;
    action_route: string | null;
    created_at: string;
  }[];
  pt_ready_count: number;
  pending_corrections: number;
}

/** A metric with its comparison. `has_comparison` false means "no trend yet". */
export interface TrendPoint {
  value: number;
  previous: number | null;
  delta: number | null;
  has_comparison: boolean;
}

export interface BranchPerformance {
  branch_id: number;
  branch_code: string;
  branch_name: string;
  punctuality: TrendPoint;
  attendance: TrendPoint;
  late_marks: TrendPoint;
  early_exits: TrendPoint;
  session_completion: TrendPoint;
  pt_utilisation: TrendPoint;
  member_activity: TrendPoint;
  marketing_conversion: TrendPoint;
  members_inside: number;
  is_demo: boolean;
}

export interface BranchPerformanceResponse {
  period: string;
  period_start: string;
  period_end: string;
  comparison_start: string | null;
  comparison_end: string | null;
  has_comparison: boolean;
  branches: BranchPerformance[];
  note: string | null;
}

export interface SourceFunnel {
  source_key: string;
  source_label: string;
  joined: number;
  reached_day_45: number;
  pt_conversions: number;
  referrals: number;
  day45_pct: number;
  pt_conversion_pct: number;
  campaigns: string[];
}

export interface MarketingDashboard {
  period_start: string;
  period_end: string;
  new_members: number;
  sources: SourceFunnel[];
  campaigns: Record<string, unknown>[];
  referrals: Record<string, unknown>[];
  total_referrals: number;
  has_data: boolean;
}

export interface TrainerPerformance {
  trainer_id: number;
  trainer_name: string;
  branch_id: number;
  period_start: string;
  period_end: string;
  punctuality_pct: number;
  attendance_pct: number;
  late_count: number;
  early_exit_count: number;
  absent_count: number;
  missing_checkout_count: number;
  sessions_scheduled: number;
  sessions_completed: number;
  session_completion_pct: number;
  pt_scheduled: number;
  pt_completed: number;
  class_scheduled: number;
  class_completed: number;
  client_feedback: Record<string, unknown> | null;
  incentive_status: IncentiveStatus;
  incentive_checks: IncentiveCheck[];
  incentive_disclaimer: string;
}

export interface OccupancyForecast {
  branch_id: number;
  has_enough_history: boolean;
  days_of_history: number;
  days_required: number;
  busiest_hours: { hour: number; label: string; check_ins: number; share_pct: number }[];
  note: string | null;
}

export interface MemberActivity {
  member_id: number;
  totals: {
    gym_visits: number;
    own_workouts: number;
    pt_sessions: number;
    group_classes: number;
  };
  weekly: {
    week_start: string;
    week_end: string;
    gym_visits: number;
    own_workouts: number;
    pt_sessions: number;
    group_classes: number;
    total: number;
  }[];
}

export interface ActivityEntry {
  kind: 'gym_visit' | 'own_workout' | 'pt_session' | 'group_class';
  on: string;
  at: string | null;
  title: string;
  detail: string | null;
  reference_id: number | null;
  branch_id: number | null;
}

export interface MarketingSource {
  id: number;
  key: string;
  label: string;
  requires_referrer: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface AppSetting {
  key: string;
  value: unknown;
  branch_id: number | null;
  description: string | null;
}

/** The member home screen, composed server-side in one request. */
export interface MemberHome {
  member_id: number;
  full_name: string;
  branch_id: number;
  branch_name: string;
  membership_plan: string | null;
  membership_status: string | null;
  days_remaining: number | null;
  is_inside: boolean;
  trainer_name: string | null;
  journey: Journey | null;
  today_workout: WorkoutSession | null;
  next_pt_session: PTSession | null;
  pt_package: PTPackage | null;
  next_class: GroupClass | null;
  occupancy: Occupancy | null;
  unread_alerts: number;
  streak_days: number;
  today_checkin: MemberCheckIn | null;
}

/* ------------------------------------------------------ the trainer's desk */

/**
 * One of a trainer's assigned members.
 *
 * There is no payment field. GymFlow has no billing model, so a trainer acting
 * on a payment state here would be acting on nothing.
 */
export interface TrainerClient {
  member_id: number;
  member_code: string;
  full_name: string;
  branch_id: number;
  joined_on: string | null;
  membership_plan: string | null;
  membership_status: string | null;
  days_remaining: number | null;
  journey: Journey | null;
  pt_package: PTPackage | null;
  next_pt_session: PTSession | null;
  last_seen_on: string | null;
  visits_last_30: number;
}

export interface TrainerClientDetail {
  client: TrainerClient;
  recent_sessions: PTSession[];
  recent_workouts: WorkoutSession[];
  activity: ActivityEntry[];
}

/** What the server returns when a trainer moves a member onto PT. */
export interface PtConversion {
  member_id: number;
  member_name: string;
  trainer_id: number;
  trainer_name: string;
  from_training_type: string;
  to_training_type: string;
  package: PTPackage;
  converted_at: string;
}

export interface AvailabilitySlot {
  id: number;
  trainer_id: number;
  branch_id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  booked_session_id: number | null;
  note: string | null;
}

export interface AvailabilitySlotInput {
  start_time: string;
  end_time: string;
  note?: string | null;
}

/* ------------------------------------------------------------- owner desk */

export interface RenewalItem {
  member_id: number;
  member_name: string;
  branch_id: number;
  plan_name: string;
  ends_on: string;
  days_remaining: number;
}

/** Memberships approaching expiry. No value attached — there is no billing model. */
export interface Renewals {
  window_days: number;
  count: number;
  items: RenewalItem[];
}

/* ---------------------------------------------------------------- payments */

export type PaymentKind = 'membership' | 'pt' | 'group_class' | 'renewal' | 'addon';
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'other';

export interface Payment {
  id: number;
  branch_id: number;
  member_id: number;
  member_name: string | null;
  kind: PaymentKind;
  status: PaymentStatus;
  method: PaymentMethod | null;
  amount: number;
  discount: number;
  tax: number;
  currency: string;
  membership_id: number | null;
  pt_package_id: number | null;
  group_class_id: number | null;
  trainer_id: number | null;
  trainer_name: string | null;
  due_on: string | null;
  paid_at: string | null;
  collected_by_user_id: number | null;
  receipt_no: string | null;
  notes: string | null;
}

export interface RevenueLine {
  kind: PaymentKind;
  collected: number;
  pending: number;
  count: number;
}

export interface RevenueSummary {
  period_start: string;
  period_end: string;
  currency: string;
  collected_total: number;
  pending_total: number;
  lines: RevenueLine[];
}

/* --------------------------------------------------------------- live gym */

export interface MemberInside {
  member_id: number;
  member_code: string;
  full_name: string;
  branch_id: number;
  checked_in_at: string;
  minutes_inside: number;
  method: string | null;
}

/** Live occupancy: the count and the people making it up, from one rule. */
export interface WhoIsInside {
  branch_id: number;
  branch_name: string;
  count: number;
  capacity: number | null;
  members: MemberInside[];
}

/* --------------------------------------------------------------- broadcast */

export type BroadcastAudience = 'everyone' | 'members' | 'trainers' | 'pt_members' | 'member';

export type BroadcastType =
  | 'announcement'
  | 'urgent'
  | 'training'
  | 'membership'
  | 'motivation'
  | 'campaign';

export interface BroadcastRequest {
  audience: BroadcastAudience;
  branch_id: number | null;
  /** Required when, and only sent when, `audience` is `'member'`. */
  member_id?: number | null;
  broadcast_type: BroadcastType;
  title: string;
  message: string;
}

/** What actually happened: delivered as one alert per recipient. */
export interface BroadcastResult {
  recipients: number;
  audience: BroadcastAudience;
  branch_id: number | null;
  broadcast_type: BroadcastType;
  sent_at: string;
}
