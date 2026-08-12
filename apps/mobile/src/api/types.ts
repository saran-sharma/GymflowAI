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
  occupancy: Occupancy | null;
}

export interface Dashboard {
  work_date: string;
  server_time: string;
  total_trainers: number;
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
