import { useState } from 'react'
import {
  Blocks,
  Calendar,
  CreditCard,
  Cpu,
  MapPin,
  Mail,
  MessageCircle,
  MessageSquare,
  Scan,
  Star,
} from 'lucide-react'
import { Instagram } from '../components/icons.jsx'
import { Badge, Card, PageHeader, Segmented, SectionTitle, StatCard, Toast } from '../components/ui.jsx'
import { integrations } from '../data/gym.js'

const iconFor = (name) => {
  if (name.includes('WhatsApp')) return MessageCircle
  if (name.includes('Instagram')) return Instagram
  if (name.includes('Reviews')) return Star
  if (name.includes('Calendar')) return Calendar
  if (name.includes('Maps')) return MapPin
  if (name === 'Email') return Mail
  if (name.includes('SMS')) return MessageSquare
  if (name.includes('InBody')) return Cpu
  if (name.includes('Fingerprint') || name.includes('Face') || name.includes('QR') || name.includes('RFID')) return Scan
  return CreditCard
}

const cats = ['All', 'Core', 'Messaging', 'Hardware', 'Payments', 'Growth', 'Scheduling']

export default function Integrations() {
  const [cat, setCat] = useState('All')
  const [toast, setToast] = useState('')

  const rows = cat === 'All' ? integrations : integrations.filter((i) => i.cat === cat)
  const connected = integrations.filter((i) => i.status === 'Connected').length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business"
        title="Integrations"
        sub="The devices, gateways and channels GymFlow plugs into. Nothing here needs a second login."
        actions={<Segmented options={cats} value={cat} onChange={setCat} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Connected" value={connected} delta={`of ${integrations.length}`} trend="up" hint="live now" icon={Blocks} featured />
        <StatCard label="Hardware devices" value={integrations.filter((i) => i.cat === 'Hardware').length} delta="All online" trend="up" hint="entry + InBody" icon={Scan} />
        <StatCard label="Payment gateways" value={integrations.filter((i) => i.cat === 'Payments').length} delta="Razorpay default" trend="flat" hint="UPI, cards, POS" icon={CreditCard} />
        <StatCard label="Messaging channels" value={integrations.filter((i) => i.cat === 'Messaging').length} delta="4,120 msgs" trend="up" hint="this month" icon={MessageCircle} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((i) => {
          const Icon = iconFor(i.name)
          const on = i.status === 'Connected'
          return (
            <Card key={i.name} className="flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-white/15">
              <div className="flex items-start justify-between gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${
                  on ? 'border-brand/25 bg-brand/[0.12] text-brand' : 'border-white/10 bg-white/[0.05] text-zinc-500'
                }`}>
                  <Icon className="h-5 w-5" />
                </span>
                <Badge tone={on ? 'good' : 'neutral'}>{i.status}</Badge>
              </div>

              <h3 className="mt-4 text-sm font-semibold text-white">{i.name}</h3>
              <p className="mt-1 flex-1 text-xs text-zinc-500">{i.detail}</p>

              <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-3.5">
                <span className="text-[11px] uppercase tracking-wider text-zinc-600">{i.cat}</span>
                <button
                  onClick={() => setToast(on ? `${i.name} settings opened.` : `${i.name} connected.`)}
                  className={on ? 'btn btn-ghost btn-sm' : 'btn-primary btn-sm'}
                >
                  {on ? 'Configure' : 'Connect'}
                </button>
              </div>
            </Card>
          )
        })}
      </div>

      <Card strong className="p-5">
        <SectionTitle icon={Blocks} title="How the pieces fit" sub="One member action, four systems updated" />
        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          {[
            ['Member taps in', 'Fingerprint / face / QR / RFID', 'Attendance + occupancy update'],
            ['Scan completes', 'InBody 770 writes over the network', 'Member app + trainer desk update'],
            ['Payment clears', 'Razorpay / POS / UPI confirms', 'GST invoice generated and sent'],
            ['Message arrives', 'WhatsApp or Instagram API', 'AI replies, lead captured'],
          ].map(([step, via, result], i) => (
            <div key={step} className="relative rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
              <span className="num text-xs font-bold text-brand">0{i + 1}</span>
              <p className="mt-2 text-sm font-semibold text-white">{step}</p>
              <p className="mt-1 text-xs text-zinc-500">{via}</p>
              <p className="mt-2.5 text-xs text-zinc-400">{result}</p>
            </div>
          ))}
        </div>
      </Card>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
