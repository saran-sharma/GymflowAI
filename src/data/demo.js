// All data in this demo is dummy data. There is no backend, no API, no storage.

export const currency = (n) =>
  '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)

export const stats = [
  { key: 'leads', label: 'New Leads', value: 18, delta: '+22%', trend: 'up', hint: 'vs last week' },
  { key: 'trials', label: 'Trial Bookings', value: 9, delta: '+3', trend: 'up', hint: 'this week' },
  { key: 'members', label: 'Active Members', value: 126, delta: '+8', trend: 'up', hint: 'this month' },
  { key: 'renewals', label: 'Renewals Due', value: 14, delta: '7 days', trend: 'flat', hint: 'next 7 days' },
  { key: 'revenue', label: 'Revenue This Month', value: 218000, money: true, delta: '+12%', trend: 'up', hint: 'vs last month' },
]

// Chart 1 — Leads this week (one series, one week of days).
export const leadsThisWeek = [
  { day: 'Mon', leads: 4 },
  { day: 'Tue', leads: 7 },
  { day: 'Wed', leads: 5 },
  { day: 'Thu', leads: 9 },
  { day: 'Fri', leads: 12 },
  { day: 'Sat', leads: 15 },
  { day: 'Sun', leads: 8 },
]

// Chart 2 — Membership growth (one series, active members by month).
export const membershipGrowth = [
  { month: 'Feb', members: 74 },
  { month: 'Mar', members: 82 },
  { month: 'Apr', members: 91 },
  { month: 'May', members: 99 },
  { month: 'Jun', members: 108 },
  { month: 'Jul', members: 118 },
  { month: 'Aug', members: 126 },
]

export const leads = [
  { id: 1, name: 'Rahul', source: 'Instagram', status: 'Interested', action: 'Send WhatsApp', phone: '+91 98•• ••4412', added: '12 min ago' },
  { id: 2, name: 'Priya', source: 'WhatsApp', status: 'Trial Booked', action: 'View', phone: '+91 90•• ••7781', added: '1 hr ago' },
  { id: 3, name: 'Ajay', source: 'Walk-in', status: 'Follow-up', action: 'Message', phone: '+91 99•• ••2093', added: 'Yesterday' },
  { id: 4, name: 'Sneha', source: 'Instagram', status: 'Interested', action: 'Send WhatsApp', phone: '+91 87•• ••5510', added: 'Yesterday' },
  { id: 5, name: 'Vikram', source: 'WhatsApp', status: 'Trial Booked', action: 'View', phone: '+91 81•• ••3367', added: '2 days ago' },
  { id: 6, name: 'Neha', source: 'Walk-in', status: 'Follow-up', action: 'Message', phone: '+91 76•• ••9028', added: '3 days ago' },
]

export const members = [
  { id: 1, name: 'Arjun Mehta', plan: 'Annual', expiry: '12 Aug 2026', daysLeft: 9, attendance: 82, phone: '+91 98•• ••1120' },
  { id: 2, name: 'Kavya Nair', plan: 'Quarterly', expiry: '28 Aug 2026', daysLeft: 25, attendance: 64, phone: '+91 90•• ••4402' },
  { id: 3, name: 'Rohit Sharma', plan: 'Monthly', expiry: '05 Aug 2026', daysLeft: 2, attendance: 45, phone: '+91 99•• ••8871' },
  { id: 4, name: 'Isha Patel', plan: 'Annual', expiry: '19 Nov 2026', daysLeft: 108, attendance: 91, phone: '+91 87•• ••2233' },
  { id: 5, name: 'Manish Gupta', plan: 'Monthly', expiry: '01 Aug 2026', daysLeft: -2, attendance: 28, phone: '+91 81•• ••6640' },
  { id: 6, name: 'Divya Rao', plan: 'Quarterly', expiry: '14 Sep 2026', daysLeft: 42, attendance: 73, phone: '+91 76•• ••3195' },
  { id: 7, name: 'Sameer Khan', plan: 'Monthly', expiry: '09 Aug 2026', daysLeft: 6, attendance: 58, phone: '+91 70•• ••7724' },
  { id: 8, name: 'Ananya Iyer', plan: 'Annual', expiry: '02 Feb 2027', daysLeft: 183, attendance: 88, phone: '+91 96•• ••5006' },
]

// Owner-facing activity feed — shows the AI working while the owner is off the floor.
export const activity = [
  { id: 1, at: '2 min ago', channel: 'WhatsApp', text: 'AI answered pricing question from Rahul and offered a free trial slot.' },
  { id: 2, at: '18 min ago', channel: 'Instagram', text: 'AI replied to a DM from @sneha.fit and captured her phone number.' },
  { id: 3, at: '1 hr ago', channel: 'WhatsApp', text: 'Renewal reminder sent to 6 members expiring this week.' },
  { id: 4, at: '3 hrs ago', channel: 'WhatsApp', text: 'Trial booked for Vikram — Saturday 7:00 AM.' },
]
