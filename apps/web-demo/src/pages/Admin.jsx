import { useState } from 'react'
import {
  Building2,
  Megaphone,
  Package,
  ReceiptText,
  ScrollText,
  Shield,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react'
import { Badge, Card, Meter, PageHeader, Segmented, SectionTitle, StatCard, Toast } from '../components/ui.jsx'
import { auditLog, branches, campaigns, employees, expenses, inr, inrShort, inventory, tickets } from '../data/gym.js'

const accessTone = { Manager: 'critical', Trainer: 'info', Staff: 'neutral' }
const priorityTone = { High: 'critical', Medium: 'warn', Low: 'neutral' }
const statusTone = { Open: 'critical', 'In progress': 'warn', Resolved: 'good' }

export default function Admin() {
  const [tab, setTab] = useState('People')
  const [toast, setToast] = useState('')

  const totalExpense = expenses.reduce((a, e) => a + e.amount, 0)
  const lowStock = inventory.filter((i) => i.stock < i.reorder)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business"
        title="Admin"
        sub="Staff, stock, money out, complaints, campaigns and every branch — with an audit trail behind all of it."
        actions={<Segmented options={['People', 'Stock & Money', 'Support', 'Marketing']} value={tab} onChange={setTab} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Employees" value={employees.length} delta="5 on duty" trend="up" hint="across shifts" icon={Users} />
        <StatCard label="Monthly expenses" value={inrShort(totalExpense)} delta="+4%" trend="down" hint="vs July" icon={Wallet} />
        <StatCard label="Low stock items" value={lowStock.length} delta="Reorder" trend="down" hint="below threshold" icon={Package} />
        <StatCard label="Open tickets" value={tickets.filter((t) => t.status !== 'Resolved').length} delta="1 high" trend="down" hint="member complaints" icon={Ticket} />
      </div>

      {tab === 'People' && (
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle
              icon={Users}
              title="Employee management"
              sub="Roles, shifts and role-based access"
              right={<button onClick={() => setToast('Invite sent to the new employee.')} className="btn btn-ghost btn-sm">Add employee</button>}
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-white/[0.08]">
                  <tr>
                    <th className="th">Name</th>
                    <th className="th">Role</th>
                    <th className="th">Access level</th>
                    <th className="th">Shift</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {employees.map((e) => (
                    <tr key={e.name} className="transition-colors hover:bg-white/[0.03]">
                      <td className="td font-medium text-white">{e.name}</td>
                      <td className="td text-zinc-400">{e.role}</td>
                      <td className="td"><Badge tone={accessTone[e.access]}><Shield className="h-3 w-3" />{e.access}</Badge></td>
                      <td className="td num text-zinc-400">{e.shift}</td>
                      <td className="td"><Badge tone={e.status === 'On duty' ? 'good' : 'neutral'}>{e.status}</Badge></td>
                      <td className="td text-right">
                        <button onClick={() => setToast(`Permissions opened for ${e.name}.`)} className="btn btn-ghost btn-sm">Permissions</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={Building2} title="Multi-branch management" sub="All three SLAM locations" />
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {branches.map((b) => (
                <div key={b.name} className={`rounded-xl border p-4 ${b.flagship ? 'border-brand/30 bg-brand/[0.07]' : 'border-white/[0.08] bg-white/[0.03]'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{b.name}</p>
                    {b.flagship && <Badge tone="critical">Flagship</Badge>}
                  </div>
                  <p className="num mt-3 text-2xl font-bold tracking-tightest text-white">{inrShort(b.revenue)}</p>
                  <p className="text-xs text-zinc-500">revenue this month</p>
                  <div className="mt-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Members</span>
                      <span className="num font-semibold text-white">{b.members}</span>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-zinc-400">Occupancy</span>
                        <span className="num font-semibold text-white">{b.occupancy}%</span>
                      </div>
                      <Meter value={b.occupancy} tone={b.occupancy > 55 ? 'warn' : 'good'} showValue={false} size="sm" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={ScrollText} title="Audit logs" sub="Who changed what, and when" />
            <ul className="mt-4 divide-y divide-white/[0.06]">
              {auditLog.map((l) => (
                <li key={l.at + l.who} className="flex items-start gap-4 py-3">
                  <span className="num w-16 shrink-0 text-xs text-zinc-500">{l.at}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200">{l.what}</p>
                    <p className="text-xs text-zinc-500">{l.who}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'Stock & Money' && (
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle
              icon={Package}
              title="Inventory"
              sub="Supplements and merchandise"
              right={<Badge tone={lowStock.length ? 'warn' : 'good'}>{lowStock.length} need reorder</Badge>}
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead className="border-b border-white/[0.08]">
                  <tr>
                    <th className="th">Item</th>
                    <th className="th">Category</th>
                    <th className="th">Stock vs reorder point</th>
                    <th className="th text-right">Stock value</th>
                    <th className="th text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {inventory.map((i) => {
                    const low = i.stock < i.reorder
                    return (
                      <tr key={i.item} className="transition-colors hover:bg-white/[0.03]">
                        <td className="td font-medium text-white">{i.item}</td>
                        <td className="td text-zinc-400">{i.cat}</td>
                        <td className="td w-64">
                          <Meter value={i.stock} max={Math.max(i.reorder * 2, i.stock)} tone={low ? 'warn' : 'good'} label={`${i.stock} / ${i.reorder}`} size="sm" />
                        </td>
                        <td className="td num text-right text-zinc-300">{inr(i.value)}</td>
                        <td className="td text-right">
                          <button
                            onClick={() => setToast(`Purchase order raised for ${i.item}.`)}
                            className={low ? 'btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                          >
                            {low ? 'Reorder' : 'Order'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <SectionTitle icon={ReceiptText} title="Expense tracking" sub={`${inr(totalExpense)} this month`} />
              <div className="mt-5 space-y-4">
                {expenses.map((e) => (
                  <div key={e.head}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm text-zinc-300">{e.head}</span>
                      <span className="num text-sm font-semibold text-white">{inr(e.amount)}</span>
                    </div>
                    <Meter value={e.share} tone="brand" label={`${e.share}%`} size="sm" />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={Building2} title="Vendor management" sub="Active suppliers and contracts" />
              <div className="mt-4 space-y-2.5">
                {[
                  ['MuscleBlaze Distribution', 'Supplements', 'Net 30', 'good'],
                  ['Cybex India AMC', 'Equipment service', 'Quarterly', 'good'],
                  ['FreshPro Housekeeping', 'Facility', 'Monthly', 'good'],
                  ['PrintWorks Bengaluru', 'Merch printing', 'Per order', 'warn'],
                ].map(([name, cat, terms, tone]) => (
                  <div key={name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{name}</p>
                      <p className="truncate text-xs text-zinc-500">{cat} · {terms}</p>
                    </div>
                    <Badge tone={tone}>{tone === 'good' ? 'Active' : 'Renewal due'}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'Support' && (
        <Card className="p-5">
          <SectionTitle
            icon={Ticket}
            title="Complaints & support tickets"
            sub="Raised at the desk, in the app or over WhatsApp"
            right={<button onClick={() => setToast('Announcement pushed to all members.')} className="btn btn-ghost btn-sm">Post announcement</button>}
          />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-white/[0.08]">
                <tr>
                  <th className="th">Ticket</th>
                  <th className="th">Member</th>
                  <th className="th">Subject</th>
                  <th className="th">Priority</th>
                  <th className="th">Status</th>
                  <th className="th">Age</th>
                  <th className="th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {tickets.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-white/[0.03]">
                    <td className="td num font-medium text-white">{t.id}</td>
                    <td className="td text-zinc-300">{t.member}</td>
                    <td className="td text-zinc-400">{t.subject}</td>
                    <td className="td"><Badge tone={priorityTone[t.priority]}>{t.priority}</Badge></td>
                    <td className="td"><Badge tone={statusTone[t.status]}>{t.status}</Badge></td>
                    <td className="td num text-zinc-500">{t.age}</td>
                    <td className="td text-right">
                      <button
                        onClick={() => setToast(`${t.id} ${t.status === 'Resolved' ? 'reopened' : 'marked resolved'}.`)}
                        className="btn btn-ghost btn-sm"
                      >
                        {t.status === 'Resolved' ? 'Reopen' : 'Resolve'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'Marketing' && (
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle
              icon={Megaphone}
              title="Marketing campaigns"
              sub="WhatsApp, SMS, email and Instagram"
              right={<button onClick={() => setToast('New campaign drafted.')} className="btn-primary btn-sm">New campaign</button>}
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-white/[0.08]">
                  <tr>
                    <th className="th">Campaign</th>
                    <th className="th">Channel</th>
                    <th className="th text-right">Sent</th>
                    <th className="th text-right">Opened</th>
                    <th className="th text-right">Converted</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {campaigns.map((c) => (
                    <tr key={c.name} className="transition-colors hover:bg-white/[0.03]">
                      <td className="td font-medium text-white">{c.name}</td>
                      <td className="td"><Badge tone="neutral">{c.channel}</Badge></td>
                      <td className="td num text-right text-zinc-300">{c.sent.toLocaleString('en-IN')}</td>
                      <td className="td num text-right text-zinc-300">{c.opened.toLocaleString('en-IN')}</td>
                      <td className="td num text-right font-semibold text-white">{c.converted}</td>
                      <td className="td"><Badge tone={c.status === 'Running' ? 'good' : 'info'}>{c.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={Megaphone} title="Dynamic membership offers" sub="Rules that fire automatically" />
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {[
                ['Inactive 21+ days', 'Send 20% renewal discount over WhatsApp', 'Running'],
                ['Renewal in 7 days', 'Reminder with one-tap payment link', 'Running'],
                ['Trial ended, no join', 'Offer 2 free PT sessions within 48 hours', 'Running'],
                ['Birthday this week', 'Free protein shake and a wish', 'Running'],
                ['Referred 3+ friends', 'Upgrade to Elite for a month, free', 'Paused'],
              ].map(([trigger, action, status]) => (
                <div key={trigger} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{trigger}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{action}</p>
                    </div>
                    <Badge tone={status === 'Running' ? 'good' : 'neutral'}>{status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
