import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Dumbbell,
  IndianRupee,
  Info,
  Sparkles,
  Timer,
  UserCheck,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Card, DemoBadge, LivePulse, PageHeader, SectionTitle, StatCard, Toast } from '../components/ui.jsx'
import { AreaSeries, BarSeries, ChartCard, OccupancyBars, PunctualityBars } from '../components/charts.jsx'
import {
  attendanceByDay,
  businessInsights,
  inr,
  inrShort,
  live,
  membershipGrowth,
  occupancyByHour,
  ownerStats,
  ptBookings,
  revenueByMonth,
  trainerAttendance,
} from '../data/gym.js'

const icons = {
  present: UserCheck,
  late: AlertTriangle,
  live: Users,
  revenue: IndianRupee,
  ptrev: Dumbbell,
  renewals: CalendarClock,
  punctuality: Timer,
  inbody: Activity,
}

const severityMeta = {
  critical: { tone: 'critical', icon: AlertTriangle, label: 'Act now' },
  warning: { tone: 'warn', icon: AlertTriangle, label: 'Watch' },
  info: { tone: 'info', icon: Info, label: 'Opportunity' },
  good: { tone: 'good', icon: CheckCircle2, label: 'Working well' },
}

export default function OwnerDashboard() {
  const [toast, setToast] = useState('')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business"
        title="Owner Dashboard"
        sub="Trainers, floor and money on one screen — sitting on top of Yoactiv, not replacing it. Tap any card to open the breakdown."
        actions={
          <>
            <LivePulse />
            <Link to="/accountability" className="btn btn-ghost btn-sm">
              Trainer accountability
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        }
      />

      {/* Cards */}
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ownerStats.map((s) => (
          <StatCard
            key={s.key}
            label={s.label}
            value={s.money ? inrShort(s.value) : s.value}
            delta={s.delta}
            trend={s.trend}
            hint={s.hint}
            icon={icons[s.key]}
            drill={s.drill}
            to={s.to}
            tone={s.key === 'late' ? 'alert' : undefined}
            featured={s.key === 'revenue'}
          />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Revenue"
          sub="Membership, PT, store and cafe combined, by month"
          data={revenueByMonth}
          columns={[
            { key: 'month', label: 'Month' },
            { key: 'revenue', label: 'Revenue', format: inr },
          ]}
          height={250}
          right={<Badge tone="good">+18% MoM</Badge>}
        >
          <AreaSeries data={revenueByMonth} xKey="month" yKey="revenue" format={inrShort} domainPad={200000} />
        </ChartCard>

        <ChartCard
          title="Attendance"
          sub="Member visits by day of the week"
          data={attendanceByDay}
          columns={[
            { key: 'day', label: 'Day' },
            { key: 'visits', label: 'Visits' },
          ]}
          height={250}
          right={<Badge tone="neutral">1,760 this week</Badge>}
        >
          <BarSeries data={attendanceByDay} xKey="day" yKey="visits" unit="visits" />
        </ChartCard>

        <ChartCard
          title="Occupancy"
          sub="Headcount by hour · the highlighted bar is the current hour"
          data={occupancyByHour}
          columns={[
            { key: 'hour', label: 'Hour' },
            { key: 'people', label: 'Members inside' },
          ]}
          height={250}
          right={<Badge tone="warn">Peak 7–8 PM</Badge>}
        >
          <OccupancyBars data={occupancyByHour} currentHour="7p" capacity={live.capacity} />
        </ChartCard>

        <ChartCard
          title="Membership growth"
          sub="Active members at the end of each month"
          data={membershipGrowth}
          columns={[
            { key: 'month', label: 'Month' },
            { key: 'members', label: 'Active members' },
          ]}
          height={250}
          right={<Badge tone="good">+174 since Feb</Badge>}
        >
          <AreaSeries data={membershipGrowth} xKey="month" yKey="members" unit="members" domainPad={50} />
        </ChartCard>

        <ChartCard
          title="PT bookings"
          sub="Personal training sessions delivered per month"
          data={ptBookings}
          columns={[
            { key: 'month', label: 'Month' },
            { key: 'sessions', label: 'Sessions' },
          ]}
          height={250}
          right={<Badge tone="good">+18% MoM</Badge>}
        >
          <BarSeries data={ptBookings} xKey="month" yKey="sessions" unit="sessions" />
        </ChartCard>

        <ChartCard
          title="Trainer punctuality"
          sub="On-time check-ins over the last 30 days · target 90%"
          data={trainerAttendance}
          columns={[
            { key: 'name', label: 'Trainer' },
            { key: 'punctuality', label: 'On time %' },
            { key: 'monthLate', label: 'Late marks' },
          ]}
          height={250}
          right={<Badge tone="warn">2 below target</Badge>}
        >
          <PunctualityBars data={trainerAttendance} />
        </ChartCard>
      </div>

      {/* AI insights */}
      <Card strong className="p-5">
        <SectionTitle
          icon={Sparkles}
          title="AI insights"
          sub="Generated nightly from trainer check-ins, occupancy, payments and the PT calendar"
          right={<Badge tone="critical">{businessInsights.filter((i) => i.severity === 'critical').length} need action</Badge>}
        />

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {businessInsights.map((ins) => {
            const m = severityMeta[ins.severity]
            const Icon = m.icon
            return (
              <div
                key={ins.title}
                className={`rounded-xl border p-4 transition-colors ${
                  ins.severity === 'critical'
                    ? 'border-brand/30 bg-brand/[0.07]'
                    : 'border-white/[0.08] bg-white/[0.03] hover:border-white/15'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${
                      ins.severity === 'critical' ? 'text-brand'
                        : ins.severity === 'warning' ? 'text-amber-300'
                        : ins.severity === 'good' ? 'text-emerald-300' : 'text-sky-300'
                    }`} />
                    <p className="text-sm font-semibold text-white">{ins.title}</p>
                  </div>
                  <Badge tone={m.tone}>{m.label}</Badge>
                </div>

                <p className="mt-2 pl-6.5 text-sm leading-relaxed text-zinc-400">{ins.detail}</p>

                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="num text-xs font-semibold text-zinc-300">{ins.impact}</span>
                  <div className="flex flex-wrap gap-2">
                    {ins.to && (
                      <Link to={ins.to} className="btn btn-ghost btn-sm">
                        See the data
                      </Link>
                    )}
                    <button
                      onClick={() => setToast(`${ins.action} — queued. You'll get a summary on WhatsApp.`)}
                      className="btn-primary btn-sm"
                    >
                      {ins.action}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Where the numbers come from */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-white">Powered by Yoactiv</p>
            <DemoBadge />
          </div>
          <p className="mt-1.5 max-w-2xl text-sm text-zinc-400">
            Members, memberships, payments and raw attendance stay in Yoactiv. GymFlow AI reads them and
            adds the layer on top — trainer accountability, occupancy, PT optimisation and these insights.
          </p>
        </div>
        <Link to="/yoactiv" className="btn btn-ghost btn-sm">
          See the integration
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Card>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
