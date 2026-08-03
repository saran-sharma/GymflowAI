import { useState } from 'react'
import { Activity, Camera, Cable, Sparkles, TrendingDown, TrendingUp, UserCheck } from 'lucide-react'
import Scene from '../components/Scene.jsx'
import { Badge, Card, Meter, PageHeader, SectionTitle, StatCard, Toast } from '../components/ui.jsx'
import { CATEGORICAL, ChartCard, CompositionLines, Legend } from '../components/charts.jsx'
import { inbody, progressPhotos, transformation, vitals } from '../data/gym.js'

export default function MemberProgress() {
  const [toast, setToast] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [synced, setSynced] = useState(true)

  const sync = () => {
    setSyncing(true)
    setSynced(false)
    setTimeout(() => {
      setSyncing(false)
      setSynced(true)
      setToast('InBody 770 scan synced — 15 metrics updated and sent to Coach Vikas.')
    }, 1600)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Member"
        title="Progress & InBody"
        sub={`Last scan ${inbody.lastScan} on ${inbody.device}. Metrics land here the moment you step off the machine.`}
        actions={
          <button onClick={sync} disabled={syncing} className="btn-primary btn-sm">
            <Cable className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync InBody'}
          </button>
        }
      />

      {/* Connection status */}
      <Card strong className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3.5">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand/25 bg-brand/[0.12] text-brand">
            <Activity className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">{inbody.device}</p>
            <p className="text-xs text-zinc-500">
              {syncing ? 'Reading scan…' : synced ? `Synced · ${inbody.lastScan}` : 'Waiting for device'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={syncing ? 'warn' : 'good'}>{syncing ? 'Syncing' : 'Connected'}</Badge>
          <Badge tone="neutral">Auto-sync on</Badge>
        </div>
      </Card>

      {/* Headline vitals */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Weight" value={`${vitals.weight.value} kg`} delta={`${vitals.weight.delta} kg`} trend="up" hint="since Feb" icon={TrendingDown} />
        <StatCard label="Body fat" value={`${vitals.bodyFat.value}%`} delta={`${vitals.bodyFat.delta} pp`} trend="up" hint="since Feb" icon={TrendingDown} featured />
        <StatCard label="Skeletal muscle" value={`${vitals.muscle.value} kg`} delta={`+${vitals.muscle.delta} kg`} trend="up" hint="since Feb" icon={TrendingUp} />
        <StatCard label="BMI" value={vitals.bmi.value} delta={`${vitals.bmi.delta}`} trend="up" hint="normal range" icon={Activity} />
      </div>

      {/* Transformation graph */}
      <ChartCard
        title="Transformation graph"
        sub="Body fat and skeletal muscle, monthly"
        data={inbody.history}
        columns={[
          { key: 'month', label: 'Month' },
          { key: 'weight', label: 'Weight (kg)' },
          { key: 'fat', label: 'Body fat (%)' },
          { key: 'muscle', label: 'Muscle (kg)' },
        ]}
        height={260}
        right={<Legend items={[{ label: 'Body fat %', color: CATEGORICAL[0] }, { label: 'Muscle kg', color: CATEGORICAL[1] }]} />}
      >
        <CompositionLines data={inbody.history} />
      </ChartCard>

      {/* Full InBody metric sheet */}
      <Card className="p-5">
        <SectionTitle
          icon={Activity}
          title="Full InBody sheet"
          sub={`${inbody.metrics.length} metrics · change shown against the previous scan`}
          right={<button onClick={() => setToast('InBody report PDF sent to your WhatsApp.')} className="btn btn-ghost btn-sm">Send PDF</button>}
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {inbody.metrics.map((m) => {
            const improving = m.label === 'Body Fat' || m.label === 'Visceral Fat' || m.label === 'Weight' || m.label === 'BMI'
              ? m.delta < 0
              : m.delta > 0
            return (
              <div key={m.label} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-zinc-400">{m.label}</p>
                  <Badge tone={improving ? 'good' : 'neutral'}>{m.range}</Badge>
                </div>
                <p className="num mt-2 text-xl font-bold tracking-tightest text-white">
                  {m.value}
                  <span className="ml-1 text-xs font-medium text-zinc-500">{m.unit}</span>
                </p>
                <p className={`num mt-1 text-xs ${improving ? 'text-emerald-300' : 'text-zinc-500'}`}>
                  {m.delta > 0 ? '+' : ''}
                  {m.delta} since last scan
                </p>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Segmental + AI */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle icon={Activity} title="Segmental muscle analysis" sub="100% = balanced for your body type" />
          <div className="mt-5 space-y-4">
            {inbody.segmental.map((s) => (
              <div key={s.part}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm text-zinc-300">{s.part}</span>
                  <span className="num text-sm font-semibold text-white">{s.value}%</span>
                </div>
                <Meter value={s.value} max={120} tone={s.value >= 96 ? 'good' : 'warn'} showValue={false} />
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3.5 py-2.5 text-xs text-amber-200">
            Left arm trails the right by 3%. Unilateral work has been added to your plan.
          </p>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle icon={Sparkles} title="AI suggestions" sub="Generated from this scan" />
            <ul className="mt-4 space-y-3">
              {inbody.aiSuggestions.map((s) => (
                <li key={s} className="flex gap-2.5 text-sm text-zinc-300">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  {s}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={UserCheck} title="Trainer recommendation" sub="Coach Vikas Menon · 28 Jul" />
            <p className="mt-4 text-sm leading-relaxed text-zinc-300">“{inbody.trainerNote}”</p>
            <button onClick={() => setToast('Message sent to Coach Vikas.')} className="btn btn-ghost btn-sm mt-4">
              Reply to trainer
            </button>
          </Card>
        </div>
      </div>

      {/* Photos + timeline */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle
            icon={Camera}
            title="Progress photos"
            sub="Front view · every 6 months"
            right={<button onClick={() => setToast('Camera opened. Photos stay private to you.')} className="btn btn-ghost btn-sm">Add photo</button>}
          />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {progressPhotos.map((p) => (
              <figure key={p.date} className="overflow-hidden rounded-xl border border-white/[0.08]">
                {/* Generated stand-in — the silhouette leans as body fat drops.
                    Pass `src` to swap in a real photo. */}
                <Scene
                  variant="figure"
                  palette={p.palette}
                  build={p.build}
                  ratio="aspect-[3/4]"
                  alt={`Progress photo, ${p.date}`}
                >
                  <span className="absolute left-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] text-white/70 backdrop-blur">
                    Photo
                  </span>
                </Scene>
                <figcaption className="bg-white/[0.03] px-2.5 py-2">
                  <p className="text-[11px] font-medium text-white">{p.date}</p>
                  <p className="num text-[10px] text-zinc-500">{p.weight} kg · {p.fat}%</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={TrendingUp} title="Transformation timeline" sub="Milestones since joining" />
          <ol className="mt-5 space-y-0">
            {transformation.map((t, i) => (
              <li key={t.date} className="relative flex gap-4 pb-6 last:pb-0">
                {i < transformation.length - 1 && (
                  <span className="absolute left-[7px] top-4 h-full w-px bg-white/10" aria-hidden="true" />
                )}
                <span className={`relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                  i === transformation.length - 1 ? 'border-brand bg-brand' : 'border-white/25 bg-matte-900'
                }`} />
                <div className="min-w-0">
                  <p className="num text-[11px] font-semibold uppercase tracking-wider text-brand">{t.date}</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">{t.title}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{t.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
