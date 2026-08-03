import { useState } from 'react'
import {
  Apple,
  ClipboardList,
  Dumbbell,
  HeartPulse,
  History,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { Badge, Card, KeyValue, Meter, PageHeader, Segmented, SectionTitle, Toast } from '../components/ui.jsx'
import { dietHistory, medical, todayDiet, todayWorkout, workoutHistory } from '../data/gym.js'

const split = [
  { day: 'Mon', title: 'Push · Chest & Shoulders', focus: 'Hypertrophy', today: true },
  { day: 'Tue', title: 'Pull · Back & Biceps', focus: 'Hypertrophy' },
  { day: 'Wed', title: 'Legs · Quad focus', focus: 'Strength' },
  { day: 'Thu', title: 'Conditioning · HIIT', focus: 'Zone 2 + intervals' },
  { day: 'Fri', title: 'Push · Shoulder focus', focus: 'Hypertrophy' },
  { day: 'Sat', title: 'Legs · Posterior chain', focus: 'Strength' },
  { day: 'Sun', title: 'Rest / mobility', focus: 'Recovery' },
]

export default function MemberTraining() {
  const [tab, setTab] = useState('Workout')
  const [toast, setToast] = useState('')

  const kcalPct = Math.round((todayDiet.consumed / todayDiet.target) * 100)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Member"
        title="Training & Diet"
        sub="Your plan, today's targets and the full history — written by Coach Vikas, adjusted by AI each week."
        actions={
          <Segmented options={['Workout', 'Diet', 'Medical']} value={tab} onChange={setTab} />
        }
      />

      {tab === 'Workout' && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <SectionTitle
                icon={Dumbbell}
                title="This week's split"
                sub="Week 6 of 8 · hypertrophy block"
                right={<Badge tone="critical">Week 6/8</Badge>}
              />
              <div className="mt-4 space-y-2">
                {split.map((s) => (
                  <div
                    key={s.day}
                    className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${
                      s.today ? 'border-brand/35 bg-brand/[0.08]' : 'border-white/[0.08] bg-white/[0.03]'
                    }`}
                  >
                    <span className={`num w-10 shrink-0 text-sm font-bold ${s.today ? 'text-brand' : 'text-zinc-500'}`}>
                      {s.day}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{s.title}</p>
                      <p className="text-xs text-zinc-500">{s.focus}</p>
                    </div>
                    {s.today && <Badge tone="critical">Today</Badge>}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={Sparkles} title="AI adjustments" sub="Applied this week" />
              <ul className="mt-4 space-y-3">
                {[
                  'Bench volume up 8% — last three sessions all closed at RPE 8 or below.',
                  'Deadlift swapped to trap bar, respecting the L4 note on your file.',
                  'Added 10 min zone-2 after legs; your resting HR crept up 4 bpm.',
                ].map((t) => (
                  <li key={t} className="flex gap-2.5 text-sm text-zinc-300">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    {t}
                  </li>
                ))}
              </ul>
              <button onClick={() => setToast('Coach Vikas has been asked to review this week’s plan.')} className="btn btn-ghost btn-sm mt-5 w-full">
                Ask trainer to review
              </button>
            </Card>
          </div>

          <Card className="p-5">
            <SectionTitle icon={ClipboardList} title="Today · Push · Chest & Shoulders" sub={`${todayWorkout.duration} · ${todayWorkout.exercises.length} exercises`} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="border-b border-white/[0.08]">
                  <tr>
                    <th className="th">Exercise</th>
                    <th className="th">Sets × reps</th>
                    <th className="th">Load</th>
                    <th className="th text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {todayWorkout.exercises.map((e) => (
                    <tr key={e.name}>
                      <td className="td font-medium text-white">{e.name}</td>
                      <td className="td num text-zinc-300">{e.sets}</td>
                      <td className="td num text-zinc-300">{e.load}</td>
                      <td className="td text-right">
                        <Badge tone={e.done ? 'good' : 'neutral'}>{e.done ? 'Done' : 'Pending'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={History} title="Workout history" sub="Last 5 sessions" />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="border-b border-white/[0.08]">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Session</th>
                    <th className="th">Volume</th>
                    <th className="th">Duration</th>
                    <th className="th text-right">RPE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {workoutHistory.map((w) => (
                    <tr key={w.date} className="transition-colors hover:bg-white/[0.03]">
                      <td className="td num text-zinc-400">{w.date}</td>
                      <td className="td font-medium text-white">{w.title}</td>
                      <td className="td num text-zinc-300">{w.volume}</td>
                      <td className="td num text-zinc-300">{w.duration}</td>
                      <td className="td num text-right text-zinc-300">{w.rpe}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'Diet' && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <SectionTitle
                icon={Apple}
                title="Today's meals"
                sub={`${todayDiet.consumed} of ${todayDiet.target} kcal · ${kcalPct}% of target`}
                right={<Badge tone={kcalPct > 90 ? 'good' : 'warn'}>{todayDiet.target - todayDiet.consumed} kcal left</Badge>}
              />
              <div className="mt-4 space-y-2">
                {todayDiet.meals.map((m) => (
                  <div key={m.meal} className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{m.meal}</p>
                      <p className="truncate text-xs text-zinc-500">{m.items}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="num text-sm text-zinc-300">{m.kcal} kcal</span>
                      <Badge tone={m.done ? 'good' : 'neutral'}>{m.done ? 'Eaten' : 'Pending'}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={ClipboardList} title="Macros" sub="Today's split" />
              <div className="mt-5 space-y-5">
                {Object.entries(todayDiet.macros).map(([k, v]) => (
                  <div key={k}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm capitalize text-zinc-300">{k}</span>
                      <span className="num text-sm font-semibold text-white">
                        {v.g}g <span className="font-normal text-zinc-500">/ {v.target}g</span>
                      </span>
                    </div>
                    <Meter value={v.g} max={v.target} tone={v.g / v.target > 0.85 ? 'good' : 'warn'} showValue={false} />
                  </div>
                ))}
              </div>
              <button onClick={() => setToast('Protein shake added — 32g protein, 220 kcal. Charged to your tab.')} className="btn btn-ghost btn-sm mt-6 w-full">
                Order protein shake
              </button>
            </Card>
          </div>

          <Card className="p-5">
            <SectionTitle icon={History} title="Diet history" sub="Adherence over the last 5 days" />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead className="border-b border-white/[0.08]">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Calories</th>
                    <th className="th">Protein</th>
                    <th className="th">Adherence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {dietHistory.map((d) => (
                    <tr key={d.date} className="transition-colors hover:bg-white/[0.03]">
                      <td className="td num text-zinc-400">{d.date}</td>
                      <td className="td num text-zinc-300">{d.kcal} kcal</td>
                      <td className="td num text-zinc-300">{d.protein}g</td>
                      <td className="td w-56">
                        <Meter value={d.adherence} tone={d.adherence >= 90 ? 'good' : 'warn'} label={`${d.adherence}%`} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'Medical' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <SectionTitle icon={HeartPulse} title="Medical history" sub="Visible to your trainer only" />
            <div className="mt-4">
              <KeyValue
                rows={[
                  ['Blood group', medical.bloodGroup],
                  ['Emergency contact', medical.emergency],
                ]}
              />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Conditions</p>
            <ul className="mt-2 space-y-2">
              {medical.conditions.map((c) => (
                <li key={c} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-zinc-300">
                  {c}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={ShieldAlert} title="Injury notes" sub="Automatically respected by the AI planner" />
            <div className="mt-4 space-y-3">
              {medical.injuries.map((i) => (
                <div key={i.part} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{i.part}</p>
                    <Badge tone={i.status === 'Active' ? 'warn' : 'good'}>{i.status}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-zinc-400">{i.note}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setToast('Injury note sent to Coach Vikas for review.')} className="btn btn-ghost btn-sm mt-4 w-full">
              Add an injury note
            </button>
          </Card>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
