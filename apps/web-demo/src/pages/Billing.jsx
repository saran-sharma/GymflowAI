import { useMemo, useState } from 'react'
import {
  Banknote,
  Download,
  FileText,
  Mail,
  MessageCircle,
  Percent,
  Receipt,
  Search,
  Wallet,
} from 'lucide-react'
import { Badge, Card, KeyValue, Modal, PageHeader, Segmented, SectionTitle, StatCard, Toast } from '../components/ui.jsx'
import { inr, invoices, member, paymentMethods, promoCodes, studio } from '../data/gym.js'

const typeTone = { Membership: 'critical', PT: 'info', Store: 'neutral', Freeze: 'warn', Renewal: 'critical' }

function InvoiceModal({ invoice, onClose, onAction }) {
  if (!invoice) return null
  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      wide
      title={`Tax invoice · ${invoice.id}`}
      sub={`${invoice.date} · ${invoice.status}`}
      footer={
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onAction('Invoice PDF downloaded.')} className="btn-primary btn-sm flex-1">
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </button>
          <button onClick={() => onAction('Invoice sent on WhatsApp.')} className="btn btn-ghost btn-sm flex-1">
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </button>
          <button onClick={() => onAction('Invoice emailed.')} className="btn btn-ghost btn-sm flex-1">
            <Mail className="h-3.5 w-3.5" />
            Email
          </button>
        </div>
      }
    >
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div>
            <p className="text-base font-bold text-white">{studio.name}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              100ft Road, {studio.area}, {studio.city}
            </p>
            <p className="num mt-1 text-xs text-zinc-500">GSTIN {studio.gst}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Tax invoice</p>
            <p className="num text-sm font-semibold text-white">{invoice.id}</p>
            <p className="num text-xs text-zinc-500">{invoice.date}</p>
          </div>
        </div>

        <div className="grid gap-4 py-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Billed to</p>
            <p className="mt-1 text-sm font-medium text-white">{member.name}</p>
            <p className="num text-xs text-zinc-500">{member.id} · {member.phone}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Place of supply</p>
            <p className="mt-1 text-sm text-zinc-300">Karnataka (29)</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
          <table className="w-full min-w-[440px]">
            <thead className="bg-white/[0.04]">
              <tr>
                <th className="th">Description</th>
                <th className="th">HSN</th>
                <th className="th text-right">Taxable</th>
                <th className="th text-right">GST 18%</th>
                <th className="th text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="td text-white">{invoice.desc}</td>
                <td className="td num text-zinc-400">999723</td>
                <td className="td num text-right text-zinc-300">{inr(invoice.base)}</td>
                <td className="td num text-right text-zinc-300">{inr(invoice.gst)}</td>
                <td className="td num text-right font-semibold text-white">{inr(invoice.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 ml-auto max-w-xs">
          <KeyValue
            rows={[
              ['Taxable value', inr(invoice.base)],
              ['CGST 9%', inr(Math.round(invoice.gst / 2))],
              ['SGST 9%', inr(Math.round(invoice.gst / 2))],
              ['Total payable', inr(invoice.total)],
            ]}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
          <Badge tone={invoice.status === 'Paid' ? 'good' : 'warn'}>
            {invoice.status === 'Paid' ? `Paid via ${invoice.method}` : 'Payment due'}
          </Badge>
          <p className="text-[11px] text-zinc-600">
            Computer-generated invoice · demo data, not a real tax document
          </p>
        </div>
      </div>
    </Modal>
  )
}

export default function Billing() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [open, setOpen] = useState(null)
  const [toast, setToast] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return invoices.filter(
      (i) =>
        (filter === 'All' || i.status === filter) &&
        (!q || i.id.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q) || i.type.toLowerCase().includes(q)),
    )
  }, [query, filter])

  const paid = invoices.filter((i) => i.status === 'Paid')
  const due = invoices.filter((i) => i.status !== 'Paid')
  const totalPaid = paid.reduce((a, i) => a + i.total, 0)
  const totalDue = due.reduce((a, i) => a + i.total, 0)
  const totalGst = invoices.reduce((a, i) => a + i.gst, 0)

  const act = (m) => { setToast(m); setOpen(null) }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business"
        title="Billing & GST"
        sub="Every payment produces a GST invoice, delivered on WhatsApp the moment it clears."
        actions={
          <button onClick={() => setToast('GSTR-1 export queued — you’ll get the file by email.')} className="btn-primary btn-sm">
            <FileText className="h-3.5 w-3.5" />
            Export GSTR-1
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Paid this year" value={inr(totalPaid)} delta={`${paid.length} invoices`} trend="up" hint="incl. GST" icon={Receipt} featured />
        <StatCard label="Outstanding" value={inr(totalDue)} delta={`${due.length} open`} trend="down" hint="follow up" icon={Wallet} />
        <StatCard label="GST collected" value={inr(totalGst)} delta="18%" trend="flat" hint="CGST + SGST" icon={Percent} />
        <StatCard label="Advance balance" value={inr(0)} delta="None" trend="flat" hint="credit on file" icon={Banknote} />
      </div>

      {/* Invoices */}
      <Card className="p-5">
        <SectionTitle
          icon={Receipt}
          title="Invoices"
          sub="Membership, PT, store and freeze invoices in one ledger"
          right={<Segmented options={['All', 'Paid', 'Due']} value={filter} onChange={setFilter} />}
        />

        <div className="relative mt-4 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            className="input input-icon"
            placeholder="Search invoice number or item"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search invoices"
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-white/[0.08]">
              <tr>
                <th className="th">Invoice</th>
                <th className="th">Type</th>
                <th className="th">Description</th>
                <th className="th text-right">GST</th>
                <th className="th text-right">Total</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {rows.map((i) => (
                <tr key={i.id} className="transition-colors hover:bg-white/[0.03]">
                  <td className="td">
                    <button onClick={() => setOpen(i)} className="num font-medium text-white underline-offset-2 hover:underline">
                      {i.id}
                    </button>
                    <p className="num text-xs text-zinc-500">{i.date}</p>
                  </td>
                  <td className="td"><Badge tone={typeTone[i.type]}>{i.type}</Badge></td>
                  <td className="td max-w-[240px] truncate text-zinc-300">{i.desc}</td>
                  <td className="td num text-right text-zinc-400">{inr(i.gst)}</td>
                  <td className="td num text-right font-semibold text-white">{inr(i.total)}</td>
                  <td className="td"><Badge tone={i.status === 'Paid' ? 'good' : 'warn'}>{i.status}</Badge></td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setOpen(i)} className="btn btn-ghost btn-sm">View</button>
                      {i.status !== 'Paid' && (
                        <button onClick={() => setToast(`Payment link for ${i.id} sent on WhatsApp.`)} className="btn-primary btn-sm">
                          Pay {inr(i.total)}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-zinc-500">
                    No invoices match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Methods + promos */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle icon={Wallet} title="Payment methods" sub="What members can pay with at the desk or in the app" />
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {paymentMethods.map((m) => (
              <button
                key={m.name}
                onClick={() => setToast(`${m.name} selected as the default method.`)}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-left transition-colors hover:border-brand/30"
              >
                <p className="text-sm font-semibold text-white">{m.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{m.hint}</p>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ['Refunds processed', inr(2400), '1 this month'],
              ['EMI memberships', '14 active', '3/6/9 month'],
              ['Digital receipts', '100%', 'no paper'],
            ].map(([k, v, h]) => (
              <div key={k} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <p className="text-[11px] text-zinc-500">{k}</p>
                <p className="num mt-0.5 text-sm font-semibold text-white">{v}</p>
                <p className="text-[11px] text-zinc-600">{h}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Percent} title="Promo codes" sub="Active coupons" />
          <div className="mt-4 space-y-2.5">
            {promoCodes.map((p) => (
              <div key={p.code} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="num rounded-md border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand-soft">
                    {p.code}
                  </span>
                  <span className="text-sm font-semibold text-white">{p.off}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">{p.note}</p>
                <p className="num mt-1 text-[11px] text-zinc-600">Used {p.used} times</p>
              </div>
            ))}
          </div>
          <button onClick={() => setToast('New promo code created and ready to share.')} className="btn btn-ghost btn-sm mt-4 w-full">
            Create promo code
          </button>
        </Card>
      </div>

      <InvoiceModal invoice={open} onClose={() => setOpen(null)} onAction={act} />
      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
