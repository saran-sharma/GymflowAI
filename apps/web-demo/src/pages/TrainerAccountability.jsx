import { useState } from 'react'
import {
  AlertTriangle,
  Award,
  BellRing,
  Camera,
  CheckCircle2,
  Clock,
  Fingerprint,
  LogIn,
  LogOut,
  QrCode,
  ScanFace,
  Timer,
  XCircle,
} from 'lucide-react'
import Scene from '../components/Scene.jsx'
import {
  Avatar,
  Badge,
  Card,
  DemoBadge,
  Meter,
  PageHeader,
  SectionTitle,
  StatCard,
  Toast,
} from '../components/ui.jsx'
import { graceMinutes, incentiveRules, ownerAlerts, trainerAttendance } from '../data/gym.js'

const methodIcon = { Fingerprint, 'Face ID': ScanFace, QR: QrCode }

/** Late / early-exit / clean, decided against the grace period. */
function statusOf(t) {
  if (t.lateBy > graceMinutes) return { tone: 'critical', icon: AlertTriangle, label: `${t.lateBy} min late` }
  if (t.earlyExitBy > 0) return { tone: 'warn', icon: LogOut, label: `Left ${t.earlyExitBy} min early` }
  if (t.lateBy > 0) return { tone: 'warn', icon: Clock, label: `${t.lateBy} min — within grace` }
  return { tone: 'good', icon: CheckCircle2, label: 'On time' }
}

function TrainerCard({ t, onAlert }) {
  const s = statusOf(t)
  const StatusIcon = s.icon
  const MethodIcon = methodIcon[t.method] ?? Fingerprint
  const passed = incentiveRules.filter((r) => r.test(t))
  const eligible = passed.length === incentiveRules.length

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-0 sm:flex-row">
        {/* Identity frame grabbed at check-in */}
        <div className="relative w-full shrink-0 sm:w-40">
          <Scene
            variant="figure"
            palette={t.palette}
            build={t.build}
            ratio="aspect-[4/3] sm:aspect-[3/4]"
            alt={`Check-in frame captured for ${t.name}`}
          >
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80 backdrop-blur">
              <Camera className="h-3 w-3" />
              {t.photoAt}
            </span>
            <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80 backdrop-blur">
              <MethodIcon className="h-3 w-3" />
              {t.method}
            </span>
          </Scene>
        </div>

        <div className="min-w-0 flex-1 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar initials={t.initials} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{t.name}</p>
                <p className="text-xs text-zinc-500">{t.role} · shift {t.shiftStart}–{t.shiftEnd}</p>
              </div>
            </div>
            <Badge tone={s.tone} icon={StatusIcon}>{s.label}</Badge>
          </div>

          {/* In / out */}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <LogIn className="h-3 w-3" /> Checked in
              </p>
              <p className="num mt-1 text-lg font-semibold text-white">{t.inAt}</p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <LogOut className="h-3 w-3" /> Checked out
              </p>
              <p className="num mt-1 text-lg font-semibold text-white">
                {t.outAt ?? <span className="text-brand">On floor</span>}
              </p>
            </div>
          </div>

          {/* Scores */}
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-zinc-400">Punctuality score · 30 days</span>
                <span className="num font-semibold text-white">{t.punctuality}%</span>
              </div>
              <Meter value={t.punctuality} tone={t.punctuality >= 90 ? 'good' : 'warn'} showValue={false} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-zinc-400">Sessions completed today</span>
                <span className="num font-semibold text-white">{t.sessionsCompleted}/{t.sessionsBooked}</span>
              </div>
              <Meter
                value={t.sessionsCompleted}
                max={t.sessionsBooked}
                tone={t.sessionsCompleted / t.sessionsBooked >= 0.8 ? 'good' : 'warn'}
                showValue={false}
              />
            </div>
          </div>

          {/* Incentive */}
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Award className="h-3.5 w-3.5 text-brand" />
                Incentive eligibility
              </p>
              <Badge tone={eligible ? 'good' : 'neutral'}>
                {eligible ? 'Eligible' : `${passed.length}/${incentiveRules.length} rules met`}
              </Badge>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {incentiveRules.map((r) => {
                const ok = r.test(t)
                return (
                  <li key={r.key} className="flex items-center gap-2 text-xs">
                    {ok
                      ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                      : <XCircle className="h-3.5 w-3.5 shrink-0 text-zinc-600" />}
                    <span className={ok ? 'text-zinc-300' : 'text-zinc-500 line-through'}>{r.label}</span>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => onAlert(`Punctuality note sent to ${t.name} on WhatsApp.`)}
              className="btn btn-ghost btn-sm"
            >
              Message trainer
            </button>
            <button
              onClick={() => onAlert(`${t.name}'s 30-day accountability report queued for your WhatsApp.`)}
              className="btn btn-ghost btn-sm"
            >
              Full report
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

/** The turnstile, simulated. Pick a method, watch the record land. */
function CheckInSimulator({ onDone }) {
  const [method, setMethod] = useState('Fingerprint')
  const [stage, setStage] = useState('idle') // idle → reading → done
  const MethodIcon = methodIcon[method]

  const run = () => {
    setStage('reading')
    setTimeout(() => {
      setStage('done')
      onDone(`${method} check-in recorded for Divya Rao at 3:52 PM — photo captured, marked on time.`)
    }, 1500)
  }

  return (
    <Card strong className="p-5">
      <SectionTitle
        icon={Fingerprint}
        title="Check-in device"
        sub={`Trainers clock in at the turnstile. A late mark starts ${graceMinutes} minutes after shift start.`}
        right={<DemoBadge>Demo / Integration Ready</DemoBadge>}
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {Object.keys(methodIcon).map((m) => {
          const Icon = methodIcon[m]
          const active = m === method
          return (
            <button
              key={m}
              onClick={() => { setMethod(m); setStage('idle') }}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors ${
                active ? 'border-brand/50 bg-brand/[0.12] text-white' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20'
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-brand' : ''}`} />
              <span className="text-sm font-medium">{m}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-5 flex flex-col items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-7 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-4">
          <span className={`grid h-16 w-16 place-items-center rounded-2xl border transition-colors ${
            stage === 'done'
              ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300'
              : 'border-brand/30 bg-brand/[0.12] text-brand'
          }`}>
            {stage === 'done'
              ? <CheckCircle2 className="h-7 w-7" />
              : <MethodIcon className={`h-7 w-7 ${stage === 'reading' ? 'animate-pulse' : ''}`} />}
          </span>
          <div>
            <p className="text-sm font-semibold text-white">
              {stage === 'idle' && `Waiting for ${method.toLowerCase()}…`}
              {stage === 'reading' && 'Reading and matching…'}
              {stage === 'done' && 'Divya Rao · check-in recorded'}
            </p>
            <p className="num mt-0.5 text-xs text-zinc-500">
              {stage === 'done'
                ? 'Photo 15:52:18 · shift 16:00 · on time · sent to Yoactiv'
                : 'Photo and timestamp are captured with every scan'}
            </p>
          </div>
        </div>
        <button onClick={run} disabled={stage === 'reading'} className="btn-primary w-full sm:w-auto">
          {stage === 'reading' ? 'Scanning…' : stage === 'done' ? 'Scan again' : `Simulate ${method}`}
        </button>
      </div>
    </Card>
  )
}

export default function TrainerAccountability() {
  const [toast, setToast] = useState('')

  const present = trainerAttendance.filter((t) => t.inAt).length
  const late = trainerAttendance.filter((t) => t.lateBy > graceMinutes || t.earlyExitBy > 0).length
  const avg = Math.round(trainerAttendance.reduce((a, t) => a + t.punctuality, 0) / trainerAttendance.length)
  const booked = trainerAttendance.reduce((a, t) => a + t.sessionsBooked, 0)
  const done = trainerAttendance.reduce((a, t) => a + t.sessionsCompleted, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Staff"
        title="Trainer Accountability"
        sub="Every trainer clocks in at the turnstile. GymFlow AI turns those scans into punctuality, session completion and incentive eligibility — and tells you the moment one slips."
        actions={<DemoBadge>Demo / Integration Ready</DemoBadge>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Trainers present" value={`${present}/6`} delta="1 off" trend="flat" hint="checked in today" icon={CheckCircle2} />
        <StatCard label="Flagged today" value={late} delta="late or early exit" trend="down" hint={`grace ${graceMinutes} min`} icon={AlertTriangle} featured />
        <StatCard label="Floor punctuality" value={`${avg}%`} delta="-4pp" trend="down" hint="30-day average" icon={Timer} />
        <StatCard label="Sessions completed" value={`${done}/${booked}`} delta={`${Math.round((done / booked) * 100)}%`} trend="flat" hint="today" icon={Award} />
      </div>

      <CheckInSimulator onDone={setToast} />

      {/* Owner alerts */}
      <Card className="p-5">
        <SectionTitle
          icon={BellRing}
          title="Owner alerts"
          sub="Pushed to your WhatsApp as they happen — you don't have to open the dashboard to find out"
          right={<Badge tone="critical">{ownerAlerts.filter((a) => a.severity === 'critical').length} critical</Badge>}
        />
        <ul className="mt-5 space-y-2.5">
          {ownerAlerts.map((a) => (
            <li
              key={a.text}
              className={`flex flex-wrap items-start gap-3 rounded-xl border p-3.5 ${
                a.severity === 'critical'
                  ? 'border-brand/30 bg-brand/[0.07]'
                  : 'border-white/[0.08] bg-white/[0.03]'
              }`}
            >
              {a.severity === 'critical' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand" />}
              {a.severity === 'warning' && <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
              {a.severity === 'good' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />}
              <p className="min-w-0 flex-1 text-sm text-zinc-300">{a.text}</p>
              <span className="num shrink-0 text-xs text-zinc-500">{a.at}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Roster */}
      <div>
        <SectionTitle
          icon={Timer}
          title="Today's roster"
          sub="Photo and timestamp from the device, scored against each trainer's shift"
        />
        <div className="mt-5 grid gap-4 2xl:grid-cols-2">
          {trainerAttendance.map((t) => (
            <TrainerCard key={t.id} t={t} onAlert={setToast} />
          ))}
        </div>
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
