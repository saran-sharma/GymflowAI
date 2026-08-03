// GymFlow AI — demo data. Everything here is fictional. No backend, no APIs.
// Configured for a premium studio; swap `studio` to rebrand the whole demo.

export const studio = {
  name: 'SLAM Fitness Studio',
  city: 'Bengaluru',
  area: 'Indiranagar',
  capacity: 90,
  gst: '29ABCDE1234F1Z5',
}

export const inr = (n) =>
  '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)

export const inrShort = (n) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(0)}K` : `₹${n}`

/* ------------------------------------------------------------------ member */

export const member = {
  name: 'Aditya Rao',
  initials: 'AR',
  id: 'SLAM-2291',
  plan: 'Elite Annual + PT',
  since: 'Mar 2024',
  expiry: '19 Nov 2026',
  daysLeft: 108,
  phone: '+91 98•• ••4412',
  streak: 14,
  bestStreak: 31,
  attendancePct: 86,
  visitsThisMonth: 18,
  ptRemaining: 7,
  ptTotal: 12,
  referrals: 3,
  rewardPoints: 2450,
  guestPasses: 2,
  freezeDaysLeft: 15,
}

export const vitals = {
  weight: { value: 78.4, unit: 'kg', delta: -2.1, target: 74 },
  bodyFat: { value: 17.2, unit: '%', delta: -3.4, target: 14 },
  muscle: { value: 34.8, unit: 'kg', delta: 1.6, target: 37 },
  water: { value: 2.1, unit: 'L', target: 3.5 },
  calories: { value: 1840, target: 2400 },
  bmi: { value: 24.1, delta: -0.7 },
}

export const inbody = {
  lastScan: '28 Jul 2026',
  device: 'InBody 770 · Floor 1',
  metrics: [
    { label: 'Weight', value: 78.4, unit: 'kg', delta: -2.1, range: 'Normal' },
    { label: 'BMI', value: 24.1, unit: '', delta: -0.7, range: 'Normal' },
    { label: 'Body Fat', value: 17.2, unit: '%', delta: -3.4, range: 'Good' },
    { label: 'Skeletal Muscle Mass', value: 34.8, unit: 'kg', delta: 1.6, range: 'Above' },
    { label: 'Body Water', value: 44.2, unit: 'L', delta: 0.8, range: 'Normal' },
    { label: 'Protein', value: 12.1, unit: 'kg', delta: 0.3, range: 'Normal' },
    { label: 'Minerals', value: 4.3, unit: 'kg', delta: 0.1, range: 'Normal' },
    { label: 'Visceral Fat', value: 6, unit: 'level', delta: -2, range: 'Healthy' },
    { label: 'Basal Metabolic Rate', value: 1712, unit: 'kcal', delta: 34, range: 'Normal' },
  ],
  segmental: [
    { part: 'Left Arm', value: 92 },
    { part: 'Right Arm', value: 95 },
    { part: 'Trunk', value: 104 },
    { part: 'Left Leg', value: 98 },
    { part: 'Right Leg', value: 101 },
  ],
  history: [
    { month: 'Feb', weight: 84.2, fat: 23.1, muscle: 31.4 },
    { month: 'Mar', weight: 83.0, fat: 22.0, muscle: 32.0 },
    { month: 'Apr', weight: 81.8, fat: 20.8, muscle: 32.7 },
    { month: 'May', weight: 80.6, fat: 19.6, muscle: 33.4 },
    { month: 'Jun', weight: 79.7, fat: 18.5, muscle: 34.0 },
    { month: 'Jul', weight: 78.9, fat: 17.8, muscle: 34.5 },
    { month: 'Aug', weight: 78.4, fat: 17.2, muscle: 34.8 },
  ],
  aiSuggestions: [
    'Visceral fat dropped 2 levels in 6 months — the current deficit is working, hold it.',
    'Left arm is 3% behind right. Add unilateral dumbbell work twice a week.',
    'Protein sits at the low end for your muscle mass. Target 150g/day.',
  ],
  trainerNote:
    'Great trend on fat loss without muscle drop. Moving you to a lean-bulk from September — expect weight to climb slightly, that is intended.',
}

export const todayWorkout = {
  title: 'Push · Chest & Shoulders',
  block: 'Week 6 · Hypertrophy',
  duration: '58 min',
  exercises: [
    { name: 'Barbell Bench Press', sets: '4 × 8', load: '70 kg', done: true },
    { name: 'Incline Dumbbell Press', sets: '3 × 10', load: '26 kg', done: true },
    { name: 'Seated Shoulder Press', sets: '4 × 10', load: '22 kg', done: true },
    { name: 'Cable Fly', sets: '3 × 12', load: '15 kg', done: false },
    { name: 'Lateral Raise', sets: '4 × 15', load: '8 kg', done: false },
    { name: 'Triceps Rope Pushdown', sets: '3 × 15', load: '30 kg', done: false },
  ],
}

export const todayDiet = {
  target: 2400,
  consumed: 1840,
  macros: { protein: { g: 138, target: 150 }, carbs: { g: 190, target: 240 }, fat: { g: 58, target: 70 } },
  meals: [
    { meal: 'Breakfast', items: '4 egg whites, 2 whole eggs, oats, banana', kcal: 520, done: true },
    { meal: 'Mid-morning', items: 'Whey isolate + almonds', kcal: 280, done: true },
    { meal: 'Lunch', items: 'Grilled chicken, brown rice, salad', kcal: 640, done: true },
    { meal: 'Pre-workout', items: 'Black coffee, 2 dates', kcal: 140, done: true },
    { meal: 'Post-workout', items: 'Whey + banana', kcal: 260, done: false },
    { meal: 'Dinner', items: 'Paneer bhurji, 2 roti, curd', kcal: 560, done: false },
  ],
}

export const workoutHistory = [
  { date: '02 Aug', title: 'Pull · Back & Biceps', volume: '11,240 kg', duration: '62 min', rpe: 8 },
  { date: '01 Aug', title: 'Legs · Quad focus', volume: '14,880 kg', duration: '71 min', rpe: 9 },
  { date: '30 Jul', title: 'Push · Chest & Shoulders', volume: '10,110 kg', duration: '58 min', rpe: 8 },
  { date: '29 Jul', title: 'Conditioning · HIIT', volume: '—', duration: '32 min', rpe: 7 },
  { date: '28 Jul', title: 'Pull · Back & Biceps', volume: '10,760 kg', duration: '60 min', rpe: 8 },
]

export const dietHistory = [
  { date: '02 Aug', kcal: 2380, protein: 148, adherence: 96 },
  { date: '01 Aug', kcal: 2510, protein: 152, adherence: 92 },
  { date: '31 Jul', kcal: 2180, protein: 131, adherence: 88 },
  { date: '30 Jul', kcal: 2420, protein: 145, adherence: 97 },
  { date: '29 Jul', kcal: 2650, protein: 139, adherence: 79 },
]

export const medical = {
  conditions: ['Mild lactose intolerance', 'Seasonal asthma (inhaler on file)'],
  injuries: [
    { part: 'Right shoulder', note: 'Impingement, Nov 2024. Cleared. Avoid behind-neck press.', status: 'Cleared' },
    { part: 'Lower back', note: 'L4 stiffness. Deadlift capped at 100 kg, trap bar preferred.', status: 'Active' },
  ],
  emergency: 'Meera Rao · +91 98•• ••7701',
  bloodGroup: 'B+',
}

export const progressPhotos = [
  { date: 'Mar 2024', weight: 92.1, fat: 28.4, tone: ['#3a2b2e', '#241c1e'] },
  { date: 'Sep 2024', weight: 86.7, fat: 24.0, tone: ['#43302f', '#241c1e'] },
  { date: 'Mar 2025', weight: 82.3, fat: 20.6, tone: ['#4d3733', '#241c1e'] },
  { date: 'Aug 2026', weight: 78.4, fat: 17.2, tone: ['#5c3f38', '#241c1e'] },
]

export const transformation = [
  { date: 'Mar 2024', title: 'Joined SLAM', detail: '92.1 kg · 28.4% body fat · sedentary desk job' },
  { date: 'Jun 2024', title: 'First 5 kg down', detail: 'Switched to 4-day split with Coach Vikas' },
  { date: 'Dec 2024', title: 'Shoulder rehab', detail: '6 weeks of prehab work, cleared for pressing' },
  { date: 'May 2025', title: 'Sub-20% body fat', detail: 'First time below 20% since college' },
  { date: 'Aug 2026', title: 'Lean-bulk phase', detail: '17.2% body fat · 34.8 kg skeletal muscle' },
]

/* ------------------------------------------------------------- live gym */

export const live = {
  inside: 38,
  capacity: 90,
  entriesToday: 214,
  exitsToday: 176,
  waitMinutes: 4,
  crowdLevel: 'Medium',
  bestTime: 'After 8:30 PM',
  parking: { free: 7, total: 24 },
  lockers: { free: 31, total: 60 },
  showers: { free: 4, total: 8 },
  trainersOnFloor: 5,
}

export const occupancyByHour = [
  { hour: '5a', people: 8 },
  { hour: '6a', people: 26 },
  { hour: '7a', people: 41 },
  { hour: '8a', people: 34 },
  { hour: '9a', people: 19 },
  { hour: '10a', people: 12 },
  { hour: '12p', people: 9 },
  { hour: '2p', people: 7 },
  { hour: '4p', people: 14 },
  { hour: '5p', people: 28 },
  { hour: '6p', people: 52 },
  { hour: '7p', people: 71 },
  { hour: '8p', people: 58 },
  { hour: '9p', people: 29 },
  { hour: '10p', people: 11 },
]

export const equipment = [
  { name: 'Bench Press', total: 4, inUse: 3, waitlist: 1 },
  { name: 'Squat Rack', total: 4, inUse: 4, waitlist: 2 },
  { name: 'Cable Machine', total: 6, inUse: 3, waitlist: 0 },
  { name: 'Smith Machine', total: 2, inUse: 1, waitlist: 0 },
  { name: 'Leg Press', total: 2, inUse: 2, waitlist: 1 },
  { name: 'Treadmills', total: 12, inUse: 5, waitlist: 0 },
  { name: 'Cycles', total: 8, inUse: 2, waitlist: 0 },
  { name: 'Free Dumbbells', total: 40, inUse: 17, waitlist: 0 },
]

export const entryFeed = [
  { id: 1, name: 'Kavya Nair', type: 'Member', method: 'Face', dir: 'in', at: '7:42 PM' },
  { id: 2, name: 'Rohit Sharma', type: 'Member', method: 'Fingerprint', dir: 'in', at: '7:39 PM' },
  { id: 3, name: 'Coach Vikas', type: 'Trainer', method: 'RFID', dir: 'in', at: '7:35 PM' },
  { id: 4, name: 'Isha Patel', type: 'Member', method: 'QR', dir: 'out', at: '7:31 PM' },
  { id: 5, name: 'Arjun Mehta', type: 'Member', method: 'Face', dir: 'in', at: '7:28 PM' },
  { id: 6, name: 'Neel (Guest of Aditya)', type: 'Guest', method: 'QR', dir: 'in', at: '7:24 PM' },
  { id: 7, name: 'Priya Menon', type: 'Employee', method: 'RFID', dir: 'in', at: '7:20 PM' },
  { id: 8, name: 'Sameer Khan', type: 'Member', method: 'Fingerprint', dir: 'out', at: '7:17 PM' },
]

/* ------------------------------------------------------------ trainers */

export const trainers = [
  {
    id: 1,
    name: 'Vikas Menon',
    initials: 'VM',
    specialty: 'Strength & Transformation',
    rating: 4.9,
    sessions: 1240,
    experience: '9 yrs',
    rate: 1200,
    certs: ['NSCA-CSCS', 'Precision Nutrition L1'],
    slots: ['6:00 AM', '7:00 AM', '5:00 PM', '7:00 PM', '8:30 PM'],
    accent: '#ef2b3c',
  },
  {
    id: 2,
    name: 'Sneha Iyer',
    initials: 'SI',
    specialty: 'Fat Loss & Conditioning',
    rating: 4.8,
    sessions: 860,
    experience: '6 yrs',
    rate: 1000,
    certs: ['ACE-CPT', 'Kettlebell L2'],
    slots: ['6:30 AM', '8:00 AM', '4:00 PM', '6:00 PM'],
    accent: '#3987e5',
  },
  {
    id: 3,
    name: 'Rahul Deshpande',
    initials: 'RD',
    specialty: 'Powerlifting & Rehab',
    rating: 4.9,
    sessions: 1580,
    experience: '11 yrs',
    rate: 1500,
    certs: ['IPF Coach', 'FRC Mobility'],
    slots: ['7:30 AM', '5:30 PM', '7:30 PM'],
    accent: '#c98500',
  },
]

export const ptHistory = [
  { date: '01 Aug', trainer: 'Vikas Menon', focus: 'Lower body strength', rating: 5, note: 'Squat depth much better. Add pause reps.' },
  { date: '28 Jul', trainer: 'Vikas Menon', focus: 'Push day technique', rating: 5, note: 'Bench arch fixed. Elbow tuck at 45°.' },
  { date: '24 Jul', trainer: 'Sneha Iyer', focus: 'Conditioning', rating: 4, note: 'Held 165 bpm for 18 min. Improving.' },
  { date: '21 Jul', trainer: 'Vikas Menon', focus: 'Pull day', rating: 5, note: 'Chin-ups unassisted × 8. Big milestone.' },
]

export const trainerToday = [
  { time: '6:00 AM', client: 'Aditya Rao', focus: 'Push · Chest', status: 'Done' },
  { time: '7:00 AM', client: 'Kavya Nair', focus: 'Fat loss circuit', status: 'Done' },
  { time: '5:00 PM', client: 'Arjun Mehta', focus: 'Deadlift technique', status: 'Now' },
  { time: '7:00 PM', client: 'Isha Patel', focus: 'Glute hypertrophy', status: 'Upcoming' },
  { time: '8:30 PM', client: 'Sameer Khan', focus: 'Assessment', status: 'Upcoming' },
]

export const trainerClients = [
  { name: 'Aditya Rao', plan: 'Elite + PT', progress: 82, left: 7, paid: true, note: 'Lean-bulk from Sept' },
  { name: 'Kavya Nair', plan: 'Quarterly + PT', progress: 64, left: 3, paid: true, note: 'Knee-friendly leg day' },
  { name: 'Arjun Mehta', plan: 'Annual + PT', progress: 91, left: 11, paid: false, note: 'Meet prep — 12 weeks out' },
  { name: 'Isha Patel', plan: 'Annual + PT', progress: 47, left: 9, paid: true, note: 'Travelling next week' },
  { name: 'Sameer Khan', plan: 'Monthly', progress: 22, left: 1, paid: false, note: 'Trial package ending' },
]

/* --------------------------------------------------------------- owner */

export const ownerStats = [
  { key: 'members', label: 'Active Members', value: 642, delta: '+38', trend: 'up', hint: 'this month' },
  { key: 'occupancy', label: 'Current Occupancy', value: '38/90', delta: '42%', trend: 'flat', hint: 'live' },
  { key: 'entries', label: "Today's Entries", value: 214, delta: '+12%', trend: 'up', hint: 'vs yesterday' },
  { key: 'exits', label: "Today's Exits", value: 176, delta: '38 inside', trend: 'flat', hint: 'right now' },
  { key: 'revenue', label: 'Revenue (Aug)', value: 1842000, money: true, delta: '+18%', trend: 'up', hint: 'vs Jul' },
  { key: 'ptrev', label: 'PT Revenue (Aug)', value: 486000, money: true, delta: '+24%', trend: 'up', hint: 'vs Jul' },
  { key: 'renewals', label: 'Renewals Due', value: 47, delta: '30 days', trend: 'flat', hint: 'next 30 days' },
  { key: 'inactive', label: 'Inactive Members', value: 63, delta: '+9', trend: 'down', hint: 'no visit 21d' },
  { key: 'trial', label: 'Trial Members', value: 24, delta: '+6', trend: 'up', hint: 'this week' },
  { key: 'conversion', label: 'Lead Conversion', value: '34%', delta: '+5pp', trend: 'up', hint: 'vs Jul' },
]

export const revenueByMonth = [
  { month: 'Feb', revenue: 1180000 },
  { month: 'Mar', revenue: 1264000 },
  { month: 'Apr', revenue: 1352000 },
  { month: 'May', revenue: 1421000 },
  { month: 'Jun', revenue: 1508000 },
  { month: 'Jul', revenue: 1562000 },
  { month: 'Aug', revenue: 1842000 },
]

export const attendanceByDay = [
  { day: 'Mon', visits: 268 },
  { day: 'Tue', visits: 312 },
  { day: 'Wed', visits: 284 },
  { day: 'Thu', visits: 301 },
  { day: 'Fri', visits: 276 },
  { day: 'Sat', visits: 198 },
  { day: 'Sun', visits: 121 },
]

export const membershipGrowth = [
  { month: 'Feb', members: 468 },
  { month: 'Mar', members: 502 },
  { month: 'Apr', members: 539 },
  { month: 'May', members: 571 },
  { month: 'Jun', members: 596 },
  { month: 'Jul', members: 618 },
  { month: 'Aug', members: 642 },
]

export const ptBookings = [
  { month: 'Feb', sessions: 186 },
  { month: 'Mar', sessions: 214 },
  { month: 'Apr', sessions: 241 },
  { month: 'May', sessions: 268 },
  { month: 'Jun', sessions: 292 },
  { month: 'Jul', sessions: 318 },
  { month: 'Aug', sessions: 374 },
]

// Horizontal bars with direct labels — the adjacent pairlist the palette clears.
export const leadSources = [
  { source: 'Instagram', leads: 128, color: 'var(--cat-1)' },
  { source: 'WhatsApp', leads: 96, color: 'var(--cat-2)' },
  { source: 'Walk-in', leads: 74, color: 'var(--cat-3)' },
  { source: 'Google', leads: 51, color: 'var(--cat-4)' },
  { source: 'Referral', leads: 39, color: 'var(--cat-5)' },
]

export const businessInsights = [
  {
    severity: 'critical',
    title: '18 members may not renew',
    detail: 'Their visits dropped below 4/month for two consecutive months. Renewal falls due in the next 21 days.',
    action: 'Launch win-back campaign',
    impact: '₹2.4L at risk',
  },
  {
    severity: 'warning',
    title: 'Tuesday evenings are overcrowded',
    detail: '7–8 PM hits 71 of 90 capacity. Equipment wait times cross 9 minutes on the squat racks.',
    action: 'Open 2 extra racks',
    impact: '9 min avg wait',
  },
  {
    severity: 'info',
    title: 'Promote afternoon PT sessions',
    detail: 'Trainers are 62% idle between 11 AM and 4 PM while evening slots are fully booked out 6 days ahead.',
    action: 'Create afternoon offer',
    impact: '+₹84K/month',
  },
  {
    severity: 'info',
    title: 'Offer a discount to inactive members',
    detail: '63 members have not checked in for 21+ days. Historically 31% return on a 20% renewal discount.',
    action: 'Send WhatsApp offer',
    impact: '~19 recovered',
  },
  {
    severity: 'good',
    title: 'Transformation packages drive the most revenue',
    detail: '12-week transformation is 14% of sales volume but 31% of revenue, at the highest retention of any plan.',
    action: 'Expand capacity',
    impact: '31% of revenue',
  },
  {
    severity: 'info',
    title: "Predicted September revenue: ₹19.6L",
    detail: 'Based on renewal pipeline, trial conversion at 34% and the current PT booking run-rate.',
    action: 'View forecast model',
    impact: '+6.4% MoM',
  },
  {
    severity: 'warning',
    title: 'One trainer is trending below the floor average',
    detail: 'Client retention at 61% against a 84% floor average, with rebooking rate falling for 3 months.',
    action: 'Schedule 1:1 review',
    impact: '61% retention',
  },
]

/* ------------------------------------------------------------- billing */

export const invoices = [
  { id: 'SLAM/26-27/1184', date: '01 Aug 2026', type: 'Membership', desc: 'Elite Annual — renewal', base: 42372, gst: 7628, total: 50000, status: 'Paid', method: 'UPI' },
  { id: 'SLAM/26-27/1179', date: '28 Jul 2026', type: 'PT', desc: 'PT package — 12 sessions', base: 12203, gst: 2197, total: 14400, status: 'Paid', method: 'Razorpay' },
  { id: 'SLAM/26-27/1156', date: '14 Jul 2026', type: 'Store', desc: 'Whey isolate 2kg + shaker', base: 4661, gst: 839, total: 5500, status: 'Paid', method: 'Card' },
  { id: 'SLAM/26-27/1141', date: '02 Jul 2026', type: 'Freeze', desc: 'Membership freeze — 15 days', base: 847, gst: 153, total: 1000, status: 'Paid', method: 'Cash' },
  { id: 'SLAM/26-27/1203', date: '03 Aug 2026', type: 'PT', desc: 'PT session — Vikas Menon', base: 1017, gst: 183, total: 1200, status: 'Due', method: '—' },
]

export const paymentMethods = [
  { name: 'UPI', hint: 'GPay · PhonePe · Paytm' },
  { name: 'Credit Card', hint: 'Visa · Mastercard · Amex' },
  { name: 'Debit Card', hint: 'All Indian banks' },
  { name: 'Net Banking', hint: '58 banks' },
  { name: 'Cash', hint: 'At front desk' },
  { name: 'Razorpay', hint: 'Default gateway' },
  { name: 'Stripe', hint: 'International cards' },
  { name: 'EMI', hint: '3 / 6 / 9 months' },
]

export const promoCodes = [
  { code: 'SLAM20', off: '20% off', note: 'Win-back for inactive members', used: 42 },
  { code: 'REFER500', off: '₹500 off', note: 'Referral reward, both sides', used: 118 },
  { code: 'TRANSFORM12', off: '₹3,000 off', note: '12-week transformation package', used: 27 },
]

/* -------------------------------------------------------------- channels */

export const waConversation = [
  { from: 'member', text: 'How many people are in the gym?', at: '7:41 PM' },
  {
    from: 'bot',
    at: '7:41 PM',
    text: 'Currently there are 38 members inside.',
    cards: [
      { label: 'Crowd level', value: 'Medium' },
      { label: 'Best time today', value: 'After 8:30 PM' },
      { label: 'Squat rack wait', value: '~9 min' },
    ],
  },
]

export const waQuickReplies = [
  'Book PT',
  'Renew Membership',
  'Pay Fees',
  'Download Invoice',
  'View Workout',
  'Talk to Trainer',
]

export const waReplies = {
  'Book PT': {
    text: 'Coach Vikas has 7:00 PM and 8:30 PM free tomorrow. Which suits you?\n\nYour package has 7 sessions remaining, so there is nothing to pay.',
    note: 'PT slot held for 10 minutes',
  },
  'Renew Membership': {
    text: 'Your Elite Annual runs out on 19 Nov 2026. Renewing now locks this year’s rate at ₹50,000 (incl. GST) and adds 2 free PT sessions.',
    note: 'Renewal link sent',
  },
  'Pay Fees': {
    text: 'You have one open item: PT session on 03 Aug — ₹1,200 incl. GST. Pay by UPI, card or net banking.',
    note: 'Payment link sent',
  },
  'Download Invoice': {
    text: 'Here is your latest GST invoice — SLAM/26-27/1184, ₹50,000 incl. ₹7,628 GST. Sending the PDF now.',
    note: 'Invoice PDF delivered',
  },
  'View Workout': {
    text: 'Today is Push · Chest & Shoulders, Week 6 of your hypertrophy block. 6 exercises, about 58 minutes.',
    note: "Today's workout opened",
  },
  'Talk to Trainer': {
    text: 'Coach Vikas is on the floor until 9 PM. I have pinged him — he usually replies within 10 minutes.',
    note: 'Trainer notified',
  },
}

export const igTopics = [
  { q: 'What are your membership plans?', a: 'Monthly ₹4,500 · Quarterly ₹12,000 · Annual ₹38,000. Elite adds PT and InBody scans.' },
  { q: 'Where are you located?', a: 'SLAM Fitness Studio, 100ft Road, Indiranagar. Free covered parking for members.' },
  { q: 'What are your timings?', a: 'Weekdays 5 AM – 11 PM, weekends 6 AM – 9 PM. No closed days.' },
  { q: 'Any offers running?', a: 'August: annual plans get 2 months free plus an InBody scan every month.' },
  { q: 'Can I try before joining?', a: 'Yes — one free trial session with a trainer. Shall I book it for you?' },
]

export const igLeads = [
  { handle: '@sneha.fit', name: 'Sneha', asked: 'Pricing', phone: 'captured', status: 'Trial booked' },
  { handle: '@rahul_lifts', name: 'Rahul', asked: 'Timings', phone: 'captured', status: 'Interested' },
  { handle: '@fit.with.neha', name: 'Neha', asked: 'Offers', phone: 'pending', status: 'Following up' },
]

export const assistantPrompts = [
  'How crowded is the gym?',
  'Book PT tomorrow at 7 PM.',
  "Generate today's workout.",
  "Generate today's diet.",
  'Show my attendance.',
  'Renew my membership.',
  'Freeze my membership.',
  'When is my trainer available?',
  'Suggest the least crowded time today.',
]

/* --------------------------------------------------------------- smart */

export const challenges = [
  { name: '30-Day Consistency', joined: 128, days: 30, progress: 47, prize: '3 free PT sessions' },
  { name: 'August Squat Challenge', joined: 64, days: 31, progress: 71, prize: 'SLAM merch hoodie' },
  { name: '10K Steps Streak', joined: 212, days: 21, progress: 33, prize: '₹1,000 store credit' },
]

export const leaderboard = [
  { rank: 1, name: 'Arjun Mehta', points: 4820, streak: 41, badge: 'Iron' },
  { rank: 2, name: 'Kavya Nair', points: 4415, streak: 28, badge: 'Steel' },
  { rank: 3, name: 'Aditya Rao', points: 4180, streak: 14, badge: 'Steel', you: true },
  { rank: 4, name: 'Isha Patel', points: 3960, streak: 19, badge: 'Bronze' },
  { rank: 5, name: 'Sameer Khan', points: 3610, streak: 9, badge: 'Bronze' },
]

export const cafeMenu = [
  { name: 'Whey Isolate Shake', price: 220, tag: '32g protein', cat: 'Shakes' },
  { name: 'Mass Gainer Shake', price: 260, tag: '620 kcal', cat: 'Shakes' },
  { name: 'Cold Brew Protein', price: 240, tag: '24g protein', cat: 'Shakes' },
  { name: 'Grilled Chicken Bowl', price: 320, tag: '48g protein', cat: 'Cafe' },
  { name: 'Paneer Tikka Wrap', price: 280, tag: 'Veg · 26g protein', cat: 'Cafe' },
  { name: 'Whey Isolate 2kg', price: 5500, tag: 'Store pickup', cat: 'Supplements' },
  { name: 'Creatine Mono 300g', price: 1400, tag: 'Store pickup', cat: 'Supplements' },
  { name: 'SLAM Training Tee', price: 1200, tag: 'Merch', cat: 'Merch' },
]

export const buddies = [
  { name: 'Arjun Mehta', match: 94, why: 'Same push/pull split · trains 7 PM · similar bench', initials: 'AM' },
  { name: 'Sameer Khan', match: 81, why: 'Both on lean-bulk · overlapping leg days', initials: 'SK' },
  { name: 'Isha Patel', match: 73, why: 'Similar cardio targets · 6 AM regular', initials: 'IP' },
]

export const wearables = [
  { name: 'Apple Health', status: 'Connected', detail: 'Steps, heart rate, sleep' },
  { name: 'Google Fit', status: 'Connected', detail: 'Steps, active minutes' },
  { name: 'Garmin', status: 'Available', detail: 'HRV, VO2 max, recovery' },
  { name: 'Fitbit', status: 'Available', detail: 'Sleep stages, resting HR' },
]

export const badges = [
  { name: '100 Sessions', earned: true, detail: 'Hit in Jun 2026' },
  { name: '30-Day Streak', earned: true, detail: 'Best: 31 days' },
  { name: 'Sub-20% Body Fat', earned: true, detail: 'May 2025' },
  { name: '3 Referrals', earned: true, detail: '₹1,500 earned' },
  { name: '200 kg Deadlift', earned: false, detail: '182.5 kg current' },
  { name: '365-Day Member', earned: true, detail: 'Since Mar 2024' },
]

/* --------------------------------------------------------------- admin */

export const employees = [
  { name: 'Priya Menon', role: 'Front Desk Manager', access: 'Manager', shift: '6 AM – 2 PM', status: 'On duty' },
  { name: 'Vikas Menon', role: 'Head Trainer', access: 'Trainer', shift: '5 AM – 1 PM', status: 'On duty' },
  { name: 'Sneha Iyer', role: 'Trainer', access: 'Trainer', shift: '4 PM – 11 PM', status: 'On duty' },
  { name: 'Rahul Deshpande', role: 'Strength Coach', access: 'Trainer', shift: '5 PM – 11 PM', status: 'On duty' },
  { name: 'Farhan Ali', role: 'Housekeeping Lead', access: 'Staff', shift: '10 PM – 6 AM', status: 'Off' },
  { name: 'Divya Rao', role: 'Sales Executive', access: 'Manager', shift: '10 AM – 7 PM', status: 'On duty' },
]

export const inventory = [
  { item: 'Whey Isolate 2kg', cat: 'Supplements', stock: 14, reorder: 10, value: 77000 },
  { item: 'Creatine Mono 300g', cat: 'Supplements', stock: 6, reorder: 12, value: 8400 },
  { item: 'Pre-workout 400g', cat: 'Supplements', stock: 21, reorder: 10, value: 42000 },
  { item: 'SLAM Training Tee', cat: 'Merch', stock: 38, reorder: 20, value: 45600 },
  { item: 'SLAM Shaker', cat: 'Merch', stock: 4, reorder: 25, value: 1600 },
  { item: 'Lifting Straps', cat: 'Merch', stock: 17, reorder: 10, value: 10200 },
]

export const expenses = [
  { head: 'Rent', amount: 420000, share: 38 },
  { head: 'Salaries', amount: 386000, share: 35 },
  { head: 'Electricity', amount: 118000, share: 11 },
  { head: 'Equipment AMC', amount: 76000, share: 7 },
  { head: 'Marketing', amount: 62000, share: 6 },
  { head: 'Housekeeping', amount: 34000, share: 3 },
]

export const tickets = [
  { id: 'TCK-311', member: 'Sameer Khan', subject: 'Locker 24 jammed', priority: 'High', status: 'Open', age: '2h' },
  { id: 'TCK-309', member: 'Isha Patel', subject: 'AC too cold in cardio zone', priority: 'Medium', status: 'In progress', age: '1d' },
  { id: 'TCK-305', member: 'Arjun Mehta', subject: 'Invoice GST number correction', priority: 'Medium', status: 'Resolved', age: '3d' },
  { id: 'TCK-301', member: 'Kavya Nair', subject: 'Trainer reschedule request', priority: 'Low', status: 'Resolved', age: '5d' },
]

export const campaigns = [
  { name: 'August Annual Offer', channel: 'WhatsApp', sent: 1840, opened: 1512, converted: 96, status: 'Running' },
  { name: 'Inactive Win-back', channel: 'WhatsApp', sent: 63, opened: 44, converted: 11, status: 'Running' },
  { name: 'Transformation Challenge', channel: 'Instagram', sent: 12400, opened: 3180, converted: 74, status: 'Running' },
  { name: 'Renewal Reminder — 7 day', channel: 'SMS', sent: 47, opened: 41, converted: 22, status: 'Automated' },
  { name: 'Birthday Wishes', channel: 'WhatsApp', sent: 28, opened: 27, converted: 6, status: 'Automated' },
]

export const branches = [
  { name: 'Indiranagar', members: 642, occupancy: 42, revenue: 1842000, flagship: true },
  { name: 'Koramangala', members: 518, occupancy: 61, revenue: 1436000 },
  { name: 'Whitefield', members: 394, occupancy: 28, revenue: 1088000 },
]

export const auditLog = [
  { at: '7:44 PM', who: 'Priya Menon', what: 'Applied promo SLAM20 to invoice SLAM/26-27/1203' },
  { at: '6:12 PM', who: 'System', what: 'Auto-sent 7-day renewal reminders to 14 members' },
  { at: '5:03 PM', who: 'Divya Rao', what: 'Converted lead @rahul_lifts to trial member' },
  { at: '2:38 PM', who: 'Vikas Menon', what: 'Updated workout plan for Aditya Rao' },
  { at: '11:20 AM', who: 'Owner', what: 'Approved refund of ₹2,400 to Sameer Khan' },
]

export const reports = [
  { name: 'Daily Collection', desc: 'Cash, UPI, card and gateway splits for the day', value: '₹1,24,800', tag: 'Today' },
  { name: 'Monthly Revenue', desc: 'Membership, PT, store and cafe revenue by month', value: '₹18,42,000', tag: 'August' },
  { name: 'GST Report', desc: 'GSTR-1 ready output with HSN summary', value: '₹2,81,000', tag: 'Q2 FY27' },
  { name: 'Outstanding Payments', desc: 'Dues by member, ageing buckets and follow-up state', value: '₹1,86,400', tag: '38 members' },
  { name: 'Attendance Report', desc: 'Visits per member, per day, per hour', value: '1,760 visits', tag: 'This week' },
  { name: 'Transformation Report', desc: 'InBody deltas across all active members', value: '214 scanned', tag: 'August' },
  { name: 'Trainer Performance', desc: 'Sessions, retention, rebooking and ratings', value: '4.86 avg', tag: '8 trainers' },
  { name: 'Peak Hours', desc: 'Occupancy heat by hour and weekday', value: '7–8 PM', tag: 'Busiest' },
  { name: 'Occupancy Report', desc: 'Capacity utilisation and equipment contention', value: '58% avg', tag: 'August' },
  { name: 'Lead Conversion', desc: 'Source to trial to member funnel', value: '34%', tag: '+5pp' },
  { name: 'Retention Report', desc: 'Cohort retention by join month and plan', value: '84%', tag: '12-month' },
  { name: 'Member Churn Prediction', desc: 'Members most likely to lapse in 30 days', value: '18 at risk', tag: 'AI' },
  { name: 'Equipment Usage Report', desc: 'Utilisation and wait time by machine', value: 'Squat rack', tag: 'Most used' },
]

export const integrations = [
  { name: 'WhatsApp Business API', cat: 'Messaging', status: 'Connected', detail: '2 numbers · 4,120 msgs/mo' },
  { name: 'Instagram', cat: 'Messaging', status: 'Connected', detail: 'DMs + story replies' },
  { name: 'Google Reviews', cat: 'Growth', status: 'Connected', detail: '4.8 ★ · 612 reviews' },
  { name: 'Google Calendar', cat: 'Scheduling', status: 'Connected', detail: 'PT sessions sync' },
  { name: 'Google Maps', cat: 'Growth', status: 'Connected', detail: 'Directions + timings' },
  { name: 'Email', cat: 'Messaging', status: 'Connected', detail: 'Invoices + campaigns' },
  { name: 'SMS Gateway', cat: 'Messaging', status: 'Connected', detail: 'DLT-registered templates' },
  { name: 'InBody', cat: 'Hardware', status: 'Connected', detail: 'InBody 770 · auto-sync' },
  { name: 'Fingerprint Scanner', cat: 'Hardware', status: 'Connected', detail: '2 turnstiles' },
  { name: 'Face Recognition', cat: 'Hardware', status: 'Connected', detail: 'Main entrance' },
  { name: 'QR Scanner', cat: 'Hardware', status: 'Connected', detail: 'Guest + member entry' },
  { name: 'RFID', cat: 'Hardware', status: 'Connected', detail: 'Staff + trainer cards' },
  { name: 'POS Machine', cat: 'Payments', status: 'Connected', detail: 'Cafe + store counter' },
  { name: 'Razorpay', cat: 'Payments', status: 'Connected', detail: 'Default gateway' },
  { name: 'Stripe', cat: 'Payments', status: 'Available', detail: 'For international cards' },
]

/* ------------------------------------------------------------ marketing */

export const testimonials = [
  {
    quote:
      'We stopped guessing. I can see occupancy, revenue and who is about to lapse on one screen — and the AI tells me what to do about it before I ask.',
    name: 'Karan Shetty',
    role: 'Owner, SLAM Fitness Studio',
    stat: '+18% revenue in 4 months',
  },
  {
    quote:
      'My members check the crowd on WhatsApp before leaving home. Evening congestion dropped without us adding a single square foot.',
    name: 'Priya Menon',
    role: 'Front Desk Manager',
    stat: '9 min → 3 min avg wait',
  },
  {
    quote:
      'InBody syncs the moment my client steps off the machine. I walk into every session already knowing what changed.',
    name: 'Vikas Menon',
    role: 'Head Trainer',
    stat: '84% client retention',
  },
]

export const pricingPlans = [
  {
    name: 'Studio',
    price: 7999,
    tagline: 'Single location, up to 300 members',
    features: [
      'Member app + QR check-in',
      'WhatsApp AI replies',
      'Owner dashboard',
      'GST invoicing',
      'Email support',
    ],
  },
  {
    name: 'Growth',
    price: 14999,
    tagline: 'Everything a busy premium gym needs',
    featured: true,
    features: [
      'Everything in Studio',
      'Live occupancy + equipment tracking',
      'PT booking and trainer dashboards',
      'InBody + biometric integrations',
      'Instagram DM automation',
      'AI business insights',
      'Priority support',
    ],
  },
  {
    name: 'Chain',
    price: null,
    tagline: 'Multi-branch operators',
    features: [
      'Everything in Growth',
      'Multi-branch management',
      'Consolidated GST + reporting',
      'Role-based access and audit logs',
      'Dedicated success manager',
      'Custom integrations',
    ],
  },
]
