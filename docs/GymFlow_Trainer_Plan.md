# GymFlow — Trainer Plan

## Purpose

This document defines the **Trainer experience and information architecture** for GymFlow.

It is intended to be directly consumable by Claude, ChatGPT, Gemini, Cursor, Lovable, Figma AI, or another implementation/design agent.

The current GymFlow/SLAM UI should remain the visual reference:

- Dark premium UI
- Gold primary accent
- Compact cards
- Clear hierarchy
- Bottom navigation
- Minimal operational style

The goal is to define **what the Trainer needs to see and do**, not to redesign the visual language.

---

# 1. Trainer Navigation

Recommended primary navigation:

```text
Home
Clients
Sessions
Attendance
```

Account/settings can remain accessible from the profile/settings control rather than taking a primary navigation slot.

Each page has one core question:

### Home
"What do I need to handle today?"

### Clients
"Who am I responsible for, and how are they doing?"

### Sessions
"What sessions/workouts do I have, and what should I assign?"

### Attendance
"Did I attend my shift?"

---

# 2. Trainer Product Principle

The Trainer app should be a **coaching command centre**, not an Owner dashboard.

The Owner cares about:

```text
Revenue
Branches
Staff
Retention
Business performance
```

The Trainer cares about:

```text
Today's sessions
Clients
Workout assignments
Client progress
Follow-ups
Attendance
```

Research into trainer software consistently centers on client management, scheduling, workout templates/programming, progress tracking, and trainer workflow. citeturn0search0turn0search2turn0search12

---

# 3. Trainer Home

The current Trainer Home should become the daily command centre.

Top:

```text
Good Morning, Vikas 👋
Coach
```

Use:

```text
Good Morning
Good Afternoon
Good Evening
```

based on local time.

---

# 4. Current Gym Occupancy

At the top of Home:

```text
RIGHT NOW

24 members inside

SLAM Nagalkeni

[View members]
```

The expanded view:

```text
MEMBERS IN GYM

24 inside

Sneha Kapoor
Aditya Rao
Farhan Ali
Karthik Nair
...
```

Each member can show:

```text
Name
Assigned trainer
Current status
```

Example:

```text
Sneha Kapoor
Your client
Workout in progress
```

Important permission rule:

The Trainer should not automatically receive unrestricted access to every member's private information.

If the business rule permits trainers to see current branch occupancy, show names but restrict profile details to what their role permits.

A safer hierarchy is:

```text
Your clients currently inside
↓
Other members currently inside
```

with assigned clients visually prioritized.

---

# 5. Today's Workload

Immediately below occupancy:

```text
TODAY

12 sessions

6 completed
4 upcoming
2 remaining
```

Use clear status:

```text
✓ Completed
● Upcoming
! Needs attention
```

Do not make the Trainer calculate the numbers.

---

# 6. PT / GT Breakdown

Show today's training workload by type.

```text
TODAY'S TRAINING

PT
5 scheduled
3 completed
2 remaining

GT
7 scheduled
3 completed
4 remaining
```

If GT means General Training, keep the label consistent throughout the application.

If GT means Group Training in the product model, use "Group Training" consistently instead.

---

# 7. Today's Sessions

Show the next sessions rather than only totals.

Example:

```text
UP NEXT

10:30 AM
PT · Sneha Kapoor
✓ Completed

11:30 AM
GT · Push
8 members
● Upcoming

12:30 PM
PT · Farhan Ali
● Upcoming
```

Each session is tappable.

---

# 8. Home — Needs Attention

Add a small attention section.

Examples:

```text
NEEDS ATTENTION

2 clients haven't trained this week

1 PT package ending soon

1 workout awaiting assignment

3 members completed their journey
```

The Trainer should be able to tap each item.

---

# 9. Trainer Home — Recommended Layout

```text
Good Morning, Vikas 👋

RIGHT NOW
24 members inside
[View]

────────────────────

TODAY
12 sessions

6 completed
4 upcoming
2 remaining

────────────────────

PT / GT
PT 5
GT 7

────────────────────

UP NEXT
10:30 PT · Sneha
11:30 GT · Push
12:30 PT · Farhan

────────────────────

NEEDS ATTENTION
2 clients inactive
1 PT package ending
1 workout awaiting assignment
```

This makes the first screen operationally useful within seconds.

---

# 10. Clients Page

The Clients page should replace a simple member list with a **trainer-specific client management view**.

Top:

```text
CLIENTS

18 active

[Search]
```

Filters:

```text
All
PT
GT
Needs attention
Ending soon
Inactive
```

---

# 11. Client Categories

The Trainer should clearly understand the relationship.

Example:

```text
ALL CLIENTS

PT CLIENTS
5

GT / 45-DAY CLIENTS
13
```

Do not create duplicate records.

A member can potentially belong to both:

```text
GT Journey
+
PT Package
```

The UI should show both relationships.

---

# 12. Client Card

Example:

```text
Sneha Kapoor

PT
45-Day Journey · Day 44 / 45

34 workouts
82% consistency

Last visit
Today

PT sessions
4 remaining

[View Client]
```

Another:

```text
Farhan Ali

GT
Day 37 / 45

26 workouts
74% consistency

Last visit
2 days ago

[View Client]
```

---

# 13. Client Status

Use simple states:

```text
ON TRACK
NEEDS ATTENTION
INACTIVE
ENDING SOON
COMPLETED
```

Examples:

```text
ON TRACK
Training consistently

NEEDS ATTENTION
No workout for 6 days

ENDING SOON
PT package ends in 3 days

COMPLETED
45-day journey completed
```

This is more useful than forcing trainers to inspect every client individually.

---

# 14. Interactive Client Detail

When the Trainer taps:

```text
Sneha Kapoor
```

open the full client profile.

Recommended structure:

```text
Sneha Kapoor

PT · GT
SLAM Nagalkeni

[Message]
[Add note]

────────────────────

TODAY

Push
34 workouts
82% consistency

────────────────────

TRAINING

45-Day Journey
Day 44 / 45

PT Package
4 sessions remaining

────────────────────

PROGRESS

Weight
72.4 kg

Body Fat
18.4%

Strength
+8%

────────────────────

RECENT ACTIVITY

Today
Push completed

Yesterday
Gym visit

12 Aug
PT session

────────────────────

GOALS

Bench 80 kg
72 / 80 kg

────────────────────

TRAINER NOTES

"Good progress on bench.
Focus on depth next session."

```

---

# 15. Client Detail Tabs

Do not make the profile infinitely long.

Recommended tabs:

```text
Overview
Workouts
Progress
Sessions
Notes
```

### Overview

Current status and key metrics.

### Workouts

Assigned and completed workouts.

### Progress

InBody, PRs, measurements and goals.

### Sessions

PT history and upcoming sessions.

### Notes

Private trainer notes.

---

# 16. Trainer Notes

Trainer notes should be private by default.

Examples:

```text
18 Aug

Increase bench load next session.

— Vikas
```

```text
15 Aug

Client reported fatigue.
Keep volume moderate.

— Vikas
```

If a note is intended for the Member, it should use a separate:

```text
Post update to member
```

action.

Do not accidentally expose private coaching notes to Members.

---

# 17. Client Progress

Trainer should see the same progress the Member sees, but with coaching context.

Show:

```text
BODY
Weight trend
Body fat
Muscle

STRENGTH
PRs

CONSISTENCY
Visits
Workouts
PT

GOALS
Progress

INBODY
Latest + history
```

This creates a shared source of truth between Member and Trainer.

---

# 18. Client Journey

For GT / 45-day clients:

```text
45-DAY JOURNEY

Day 44 / 45

███████████████████░

34 workouts

Consistency
82%

Next
Day 45
```

Do not make the 45-day concept the Member's primary navigation.

It can remain a meaningful Trainer coaching metric.

---

# 19. PT Package

Show:

```text
PT PACKAGE

4 sessions remaining

12 / 16 completed

Expires
28 Aug 2026

Next session
20 Aug · 6:30 PM
```

Important:

The Trainer should receive an alert when:

```text
Sessions remaining <= configured threshold
OR
Expiry is approaching
```

Example:

```text
PT PACKAGE ENDING

Sneha Kapoor

2 sessions remaining
Expires in 5 days

[View Client]
```

---

# 20. Sessions Page

The Sessions page is the operational heart of the Trainer app.

Recommended sections:

```text
SESSIONS

Today
Upcoming
Completed

PT
GT

[Calendar]
```

---

# 21. Today's Sessions

Example:

```text
TODAY

10:30 AM
PT
Sneha Kapoor
60 min

✓ Completed

11:30 AM
GT
Push
8 members
45 min

● Upcoming

12:30 PM
PT
Farhan Ali
60 min

● Upcoming
```

Tap any session to open details.

---

# 22. PT Session Detail

Example:

```text
PT SESSION

Sneha Kapoor

Today
6:30 PM

PT · 1:1

PACKAGE
4 sessions remaining

────────────────────

TODAY'S PLAN

Warm-up
5 min

Bench Press
4 × 8

Incline DB Press
3 × 10

Cable Row
3 × 12

────────────────────

TRAINER NOTES

[Add note]

────────────────────

[Start Session]
```

During the session:

```text
STARTED
6:31 PM

Bench Press

Set 1
60 kg × 8 ✓

Set 2
60 kg × 8 ✓

Set 3
62.5 kg × 7

Set 4
62.5 kg × 6

[Complete Session]
```

---

# 23. Workout Templates

This is one of the most important additions.

The Trainer should have:

```text
WORKOUT LIBRARY

Push
Pull
Legs
Full Body
Upper
Lower
Cardio
Mobility
Custom
```

This should not mean every client receives the exact same workout.

Templates are starting points.

---

# 24. Push Template

Example:

```text
PUSH

Warm-up
5–10 min

Bench Press
4 × 8
Rest 90 sec

Incline DB Press
3 × 10
Rest 75 sec

Shoulder Press
3 × 10
Rest 75 sec

Lateral Raise
3 × 12
Rest 60 sec

Triceps Pushdown
3 × 12
Rest 60 sec
```

Trainer can:

```text
Use Template
Edit
Duplicate
Delete
```

---

# 25. Template → Client Workflow

The Trainer should be able to:

```text
Sessions
↓
Select GT member
↓
Select date
↓
Select template
↓
Push
↓
Customize
↓
Publish
```

The Member immediately sees:

```text
TODAY'S WORKOUT

Push

Assigned by Vikas Menon

5 exercises

[Start Workout]
```

This is the key Trainer → Member connection.

---

# 26. Template Categories

Initial library:

```text
PUSH
PULL
LEGS

UPPER
LOWER
FULL BODY

CORE
CARDIO
MOBILITY
RECOVERY

BEGINNER
INTERMEDIATE
ADVANCED
```

Later:

```text
Goal-based
Fat loss
Muscle gain
Strength
General fitness
```

Avoid making the template library huge on day one.

---

# 27. Template Builder

Trainer workflow:

```text
CREATE TEMPLATE

Name
Push A

Category
Push

Level
Intermediate

Exercises

1. Bench Press
4 × 8
90 sec

2. Incline DB Press
3 × 10
75 sec

3. Shoulder Press
3 × 10
75 sec

4. Lateral Raise
3 × 12
60 sec

5. Triceps Pushdown
3 × 12
60 sec

Trainer note
Focus on controlled reps.

[Save Template]
```

---

# 28. Assigning a Template

After selecting:

```text
Push A
```

the Trainer should be able to modify:

```text
Weight
Sets
Reps
Rest
Exercise
Notes
```

before publishing.

This prevents the template system from becoming rigid.

Reusable workout templates are a common pattern in current trainer software because they allow standardized programming while still allowing client-specific customization. citeturn0search2turn0search10turn0search12

---

# 29. GT / 45-Day Workflow

For a General Training member:

```text
Trainer
↓
Select member
↓
Select today's date
↓
Choose Push / Pull / Legs / etc.
↓
Select template
↓
Customize
↓
Publish
```

The Member sees only:

```text
TODAY'S WORKOUT
Push
```

The Trainer sees:

```text
45-Day Journey
Day 30 / 45
Workout assigned
Push A
```

This separation is intentional.

---

# 30. Group Training / GT Sessions

If GT is a group session rather than General Training, support:

```text
GT SESSION

Push
7:00 PM

8 members

Vikas Menon

[View roster]
[Start session]
```

The roster:

```text
1. Sneha Kapoor
2. Aditya Rao
3. Farhan Ali
...
```

Attendance can be recorded per member.

If GT means General Training in the product, retain the current "45-Day General Training" terminology and do not relabel it.

---

# 31. Session Completion

When Trainer completes a session:

```text
COMPLETE SESSION

Sneha Kapoor

Duration
58 min

Exercises completed
5 / 5

Trainer note
[________]

Member progress
Optional

[Complete]
```

The system then updates:

```text
Member workout history
Trainer session count
PT package balance
Consistency
Progress
Home updates
```

One action should update all relevant systems.

---

# 32. Sessions — Calendar

Use the supplied Calendar + Time component for:

### Trainer/Admin

- Creating availability
- Creating sessions
- Editing sessions
- Scheduling PT
- Scheduling GT
- Selecting start/end times

For normal daily use, show a faster agenda:

```text
TODAY

10:30 PT
11:30 GT
12:30 PT
2:00 GT
4:00 PT
```

Calendar should be available as a secondary view.

---

# 33. Attendance Page

Keep the current Trainer attendance experience largely unchanged for V1.

It should show:

```text
TODAY

Your shift
9:00 AM – 6:00 PM

Check-in
8:54 AM

Status
Present

Hours
7h 42m
```

Then:

```text
THIS WEEK

Mon ✓
Tue ✓
Wed ✓
Thu ✓
Fri ○
Sat —
Sun —
```

The user's attendance is enough for the initial Trainer release.

---

# 34. Trainer Notifications

Trainer should receive meaningful alerts.

Examples:

```text
PT package ending

Sneha has 2 sessions remaining.

Workout not assigned

Farhan has no workout for tomorrow.

Client inactive

Karthik has not trained for 7 days.

Session reminder

PT with Sneha starts in 30 minutes.

New progress

Aditya recorded a new PR.
```

Do not notify for every minor event.

---

# 35. Needs Attention Engine

Create a simple rules engine.

Potential triggers:

```text
No workout > X days
PT package <= X sessions
PT expiry <= X days
45-day journey nearing completion
No workout assigned for tomorrow
New PR
Progress milestone
Missed PT session
```

Example:

```text
NEEDS ATTENTION

3 items

1
Sneha
PT package ending in 5 days

2
Karthik
No workout for 7 days

3
Farhan
Day 45 tomorrow
```

---

# 36. Trainer → Member Updates

Trainer should be able to send:

```text
Workout update
Goal
Trainer note
Session reminder
Recovery note
Achievement
```

Example:

```text
POST UPDATE

To
Aditya Rao

Type
Goal

"Let's target 80 kg × 5 on bench this week."

[Publish]
```

Member Home receives:

```text
FROM YOUR TRAINER

Let's target 80 kg × 5 on bench this week.

Vikas Menon
```

---

# 37. Trainer Client Search

Client search should support:

```text
Name
Email
Phone
Client ID
```

But default search should prioritize:

```text
Assigned clients
Active clients
Current branch
```

Do not expose unrelated member data unnecessarily.

---

# 38. Client Filters

Recommended:

```text
All
PT
GT
Active
Inactive
Needs Attention
Ending Soon
Journey Ending
```

Optional sort:

```text
Recent activity
Next session
Progress
Name
Attention required
```

---

# 39. Trainer Home — Final Information Architecture

```text
TRAINER HOME

Good Morning, Vikas 👋

RIGHT NOW
24 members inside
[View]

TODAY

12 sessions

6 completed
4 upcoming
2 remaining

PT
5

GT
7

────────────────────

UP NEXT

10:30
PT · Sneha

11:30
GT · Push

12:30
PT · Farhan

────────────────────

NEEDS ATTENTION

2 inactive clients
1 PT package ending
1 workout missing

────────────────────

QUICK ACTIONS

[Start Session]
[Assign Workout]
[View Clients]
```

---

# 40. Trainer Information Architecture

```text
TRAINER
│
├── HOME
│   ├── Greeting
│   ├── Members currently inside
│   ├── Today's PT/GT totals
│   ├── Completed
│   ├── Remaining
│   ├── Upcoming sessions
│   ├── Needs attention
│   └── Quick actions
│
├── CLIENTS
│   ├── All clients
│   ├── PT
│   ├── GT / 45-Day
│   ├── Search
│   ├── Filters
│   └── Client detail
│       ├── Overview
│       ├── Workouts
│       ├── Progress
│       ├── Sessions
│       └── Notes
│
├── SESSIONS
│   ├── Today's sessions
│   ├── Upcoming
│   ├── Completed
│   ├── PT sessions
│   ├── GT sessions
│   ├── Session detail
│   └── Workout Templates
│       ├── Push
│       ├── Pull
│       ├── Legs
│       ├── Upper
│       ├── Lower
│       ├── Full Body
│       └── Custom
│
└── ATTENDANCE
    ├── Today
    ├── Check-in
    ├── Check-out
    └── History
```

---

# 41. Critical Product Separation

The three roles should now have clearly different mental models.

## OWNER

```text
Run the business
```

Sees:

- Revenue
- Branch performance
- Memberships
- Renewals
- Trainer performance
- PT opportunities
- Operations
- Alerts
- Members

## TRAINER

```text
Coach the people
```

Sees:

- Today's sessions
- Current gym occupancy
- Assigned clients
- PT
- GT / 45-day clients
- Workout templates
- Progress
- Goals
- Trainer notes
- Attendance

## MEMBER

```text
Improve myself
```

Sees:

- Today's workout
- PT
- Coach
- Progress
- Streak
- Goals
- Classes
- Membership

This separation should drive permissions as well as UI.

---

# 42. Important Permission Model

A Trainer should NOT automatically see:

- Gym revenue
- Branch financials
- Other trainers' private notes
- Owner settings
- Payroll
- Business analytics
- All payment records

A Trainer should see:

- Assigned clients
- Relevant member progress
- Their sessions
- Their workout plans
- Their attendance
- Branch occupancy if allowed
- PT package/session status necessary for coaching

Role-specific access is a standard pattern in gym/trainer systems; trainer workspaces commonly focus on assigned clients, schedules, session logs and relevant attendance rather than owner-level financial/admin data. citeturn0search6turn0search15

---

# 43. Recommended V1 Build Order

## Phase 1 — Trainer Home

1. Greeting
2. Members currently inside
3. Today's session count
4. PT/GT breakdown
5. Completed/upcoming/remaining
6. Upcoming sessions
7. Needs attention

## Phase 2 — Clients

8. Client list
9. Search/filter
10. PT/GT labels
11. Interactive client detail
12. Journey progress
13. PT package
14. Recent activity
15. Trainer notes

## Phase 3 — Sessions

16. Today's sessions
17. PT session detail
18. Session start/complete
19. GT sessions
20. Session history

## Phase 4 — Workout Templates

21. Template library
22. Push/Pull/Legs templates
23. Template builder
24. Assign template
25. Customize workout
26. Publish to Member
27. Member receives workout

## Phase 5 — Intelligence

28. Needs attention
29. PT expiry alerts
30. Inactive client alerts
31. Missing workout alerts
32. Progress/PR alerts

---

# 44. Definition of Done

A Trainer should be able to open GymFlow and immediately answer:

### Today

- How many members are currently in the gym?
- Which of my clients are here?
- How many sessions do I have today?
- How many are completed?
- How many remain?
- What is my next session?

### Clients

- Who am I responsible for?
- Who is on PT?
- Who is on GT / 45-day training?
- Who needs attention?
- Who is nearing package/journey completion?
- How is each client progressing?

### Coaching

- What workout should I assign?
- Can I use a Push/Pull/Legs template?
- Can I customize it?
- Can I publish it directly to the Member?

### Sessions

- What PT sessions are scheduled?
- What is today's session plan?
- Can I start/complete the session?
- Can I record notes?

### Attendance

- Am I checked in?
- How many hours have I worked?
- What is my attendance history?

---

# 45. Product Principle

The Trainer app should feel like:

> **"My coaching day, organized."**

Not:

> **"A smaller Owner dashboard."**

The core loop is:

```text
SEE WHO NEEDS ME
        ↓
OPEN CLIENT
        ↓
PLAN / ASSIGN WORKOUT
        ↓
RUN SESSION
        ↓
RECORD RESULT
        ↓
UPDATE MEMBER
        ↓
TRACK PROGRESS
        ↓
KNOW WHAT TO DO NEXT
```

That loop should drive the Trainer experience.
