import { useMemo, useState } from 'react'
import {
  Award,
  Cake,
  Coffee,
  Gift,
  HeartHandshake,
  Medal,
  ScanLine,
  ShoppingBag,
  Trophy,
  Watch,
} from 'lucide-react'
import { Avatar, Badge, Card, Meter, PageHeader, Segmented, SectionTitle, Toast } from '../components/ui.jsx'
import { badges, buddies, cafeMenu, challenges, inr, leaderboard, wearables } from '../data/gym.js'

const cats = ['All', 'Shakes', 'Cafe', 'Supplements', 'Merch']

export default function SmartFeatures() {
  const [cat, setCat] = useState('All')
  const [cart, setCart] = useState([])
  const [toast, setToast] = useState('')

  const menu = useMemo(() => (cat === 'All' ? cafeMenu : cafeMenu.filter((m) => m.cat === cat)), [cat])
  const cartTotal = cart.reduce((a, i) => a + i.price, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Member"
        title="Smart Features"
        sub="The things that make members stay — challenges, buddies, ordering, rewards and wearables."
      />

      {/* Challenges + leaderboard */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle icon={Trophy} title="Fitness challenges" sub="Running now at the studio" />
          <div className="mt-4 space-y-3">
            {challenges.map((c) => (
              <div key={c.name} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{c.name}</p>
                    <p className="num mt-0.5 text-xs text-zinc-500">{c.joined} joined · {c.days} days · prize: {c.prize}</p>
                  </div>
                  <button onClick={() => setToast(`Joined ${c.name}. Good luck.`)} className="btn btn-ghost btn-sm">
                    Join
                  </button>
                </div>
                <div className="mt-3">
                  <Meter value={c.progress} tone="brand" label={`${c.progress}%`} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Medal} title="Leaderboard" sub="This month · points" />
          <div className="mt-4 space-y-2">
            {leaderboard.map((l) => (
              <div
                key={l.rank}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
                  l.you ? 'border-brand/35 bg-brand/[0.08]' : 'border-white/[0.08] bg-white/[0.03]'
                }`}
              >
                <span className={`num w-5 shrink-0 text-sm font-bold ${l.rank <= 3 ? 'text-brand' : 'text-zinc-500'}`}>
                  {l.rank}
                </span>
                <Avatar initials={l.name.split(' ').map((p) => p[0]).join('')} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {l.name}{l.you && <span className="ml-1.5 text-xs text-brand">you</span>}
                  </p>
                  <p className="num text-[11px] text-zinc-500">{l.streak}-day streak · {l.badge}</p>
                </div>
                <span className="num shrink-0 text-sm font-semibold text-white">{l.points.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Buddies + badges */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle icon={HeartHandshake} title="Workout buddy matching" sub="Members who train like you, at the same time" />
          <div className="mt-4 space-y-3">
            {buddies.map((b) => (
              <div key={b.name} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar initials={b.initials} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{b.name}</p>
                    <p className="truncate text-xs text-zinc-500">{b.why}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="critical">{b.match}% match</Badge>
                  <button onClick={() => setToast(`Request sent to ${b.name}.`)} className="btn btn-ghost btn-sm">Connect</button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Award} title="Achievement badges" sub="Earned across your membership" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {badges.map((b) => (
              <div
                key={b.name}
                className={`rounded-xl border p-4 ${
                  b.earned ? 'border-brand/25 bg-brand/[0.07]' : 'border-white/[0.08] bg-white/[0.02] opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Award className={`h-5 w-5 ${b.earned ? 'text-brand' : 'text-zinc-600'}`} />
                  {b.earned && <Badge tone="good">Earned</Badge>}
                </div>
                <p className="mt-2.5 text-sm font-semibold text-white">{b.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{b.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Ordering */}
      <Card className="p-5">
        <SectionTitle
          icon={Coffee}
          title="Cafe, supplements & merch"
          sub="Order from the floor — charged to your tab or paid on pickup"
          right={<Segmented options={cats} value={cat} onChange={setCat} />}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {menu.map((m) => {
            const inCart = cart.filter((c) => c.name === m.name).length
            return (
              <div key={m.name} className="flex flex-col rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-brand">
                    {m.cat === 'Merch' ? <ShoppingBag className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}
                  </span>
                  {inCart > 0 && <Badge tone="critical">{inCart} in cart</Badge>}
                </div>
                <p className="mt-3 flex-1 text-sm font-semibold text-white">{m.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{m.tag}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="num text-sm font-bold text-white">{inr(m.price)}</span>
                  <button onClick={() => setCart((c) => [...c, m])} className="btn btn-ghost btn-sm">Add</button>
                </div>
              </div>
            )
          })}
        </div>

        {cart.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand/[0.08] px-4 py-3.5">
            <p className="num text-sm text-zinc-200">
              {cart.length} item{cart.length > 1 ? 's' : ''} · <span className="font-bold text-white">{inr(cartTotal)}</span>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setCart([])} className="btn btn-ghost btn-sm">Clear</button>
              <button
                onClick={() => { setToast(`Order placed — ${inr(cartTotal)}. Ready at the counter in 6 minutes.`); setCart([]) }}
                className="btn-primary btn-sm"
              >
                Place order
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Wearables + rewards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle icon={Watch} title="Wearable integration" sub="Steps, heart rate and sleep flow into your plan" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {wearables.map((w) => (
              <div key={w.name} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{w.name}</p>
                  <p className="truncate text-xs text-zinc-500">{w.detail}</p>
                </div>
                {w.status === 'Connected' ? (
                  <Badge tone="good">Connected</Badge>
                ) : (
                  <button onClick={() => setToast(`${w.name} connected.`)} className="btn btn-ghost btn-sm shrink-0">
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Gift} title="Rewards & occasions" />
          <div className="mt-4 space-y-2.5">
            {[
              ['Attendance rewards', '50 pts per visit', ScanLine],
              ['Referral rewards', '₹500 both sides', HeartHandshake],
              ['Birthday wishes', 'Free shake on the day', Cake],
            ].map(([k, v, Icon]) => (
              <div key={k} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
                <Icon className="h-4 w-4 shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{k}</p>
                  <p className="truncate text-xs text-zinc-500">{v}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setToast('2,450 points redeemed for ₹1,225 in store credit.')} className="btn-primary btn-sm mt-4 w-full">
            Redeem 2,450 points
          </button>
        </Card>
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
