# GymFlow --- Member Plan

## Purpose

This document defines the **Member experience and information
architecture** for GymFlow.

It is intended to be consumed by Claude, ChatGPT, Gemini, Cursor,
Lovable, Figma AI, or other implementation/design agents.

The current SLAM/GymFlow screens establish the visual language:

-   Dark, premium interface
-   Gold as the primary member accent
-   Minimal cards
-   Large readable typography
-   Bottom navigation
-   Strong use of progress
-   Operational information presented simply

**Do not redesign the visual system from scratch.**

The objective is to improve the **Member product experience and
information architecture**.

------------------------------------------------------------------------

# 1. Member Navigation

Keep the current five-section structure:

``` text
Home
Workout
PT
Progress
Account
```

Each section has a distinct job:

### Home

"What should I do today?"

### Workout

"Exactly what is my workout today, and what do I need to complete?"

### PT

"Who can train me, when are they available, and what is my PT
relationship?"

### Progress

"Am I getting better?"

### Account

"Who am I, what membership do I have, and what settings/account
information do I control?"

------------------------------------------------------------------------

# 2. Member Product Principle

The Member app should feel like a **personal fitness companion**, not a
gym administration system.

The Member should not need to understand:

-   45-day program administration
-   Trainer operational workflows
-   Attendance eligibility calculations
-   Owner analytics
-   Internal gym operations

The Owner/Trainer may see those concepts.

The Member should see the outcome:

``` text
Today
↓
Workout
↓
Consistency
↓
Progress
↓
Motivation
```

------------------------------------------------------------------------

# 3. Home Page

The current Member Home is too empty and operational.

It should become the Member's **daily command center**.

Recommended structure:

``` text
Good Morning, Aditya 👋

How are you feeling today?

[😊 Great] [🙂 Good] [😐 Okay] [😓 Tired] [😴 Low]

────────────────────

TODAY

Push Day
45 min · 5 exercises

[Start Workout]

────────────────────

STREAK

🔥 7 days

Best: 14 days

────────────────────

YOUR PROGRESS

+2.4 kg muscle
-1.8 kg body fat

[View Progress →]

────────────────────

FROM YOUR TRAINER

"Focus on controlled reps today."

Vikas Menon
Trainer

────────────────────

UPDATES

• Strength Circuit — tomorrow 7:00 PM
• New group class available
• Membership expires in 18 days

[View all →]
```

The exact metrics depend on available data.

------------------------------------------------------------------------

# 4. Personalized Greeting

The Member Home should dynamically greet the member.

Examples:

``` text
Good Morning, Aditya 👋
```

``` text
Good Afternoon, Aditya 👋
```

``` text
Good Evening, Aditya 👋
```

Use the device/local gym timezone.

Avoid generic:

``` text
Welcome back!
```

when a more contextual greeting is possible.

------------------------------------------------------------------------

# 5. Daily Mood

Add a lightweight daily mood check.

Example:

``` text
HOW ARE YOU FEELING TODAY?

😊 Great
🙂 Good
😐 Okay
😓 Tired
😴 Low
```

After selection:

``` text
Feeling good today.

Let's make it count.
```

## Important product constraint

Mood should be **optional and fast**.

Do not force a questionnaire every day.

Do not turn this into a medical/mental-health assessment.

The value is primarily:

-   personalization
-   workout context
-   motivation
-   optional trainer insight

------------------------------------------------------------------------

# 6. Mood → Workout Context

If the user reports:

``` text
😴 Low
```

the app can show:

``` text
Low-energy day?

Your trainer's plan is still ready.

Take it at your pace.
```

Do NOT automatically modify the workout unless the product has an
explicit trainer-approved adaptation system.

The app should not pretend that a mood selection is enough to safely
prescribe a different workout.

------------------------------------------------------------------------

# 7. Today's Workout

This should be the strongest card on Home.

Example:

``` text
TODAY'S WORKOUT

PUSH

45 min
5 exercises

Chest · Shoulders · Triceps

[Start Workout]
```

If a trainer has posted a workout:

``` text
TODAY'S WORKOUT

Push

Assigned by
Vikas Menon

5 exercises · 45 min

[Start Workout]
```

------------------------------------------------------------------------

# 8. PT Day

If today is a PT session, do NOT show a normal workout as if it were
self-guided.

Instead:

``` text
TODAY

PERSONAL TRAINING

6:30 PM

Vikas Menon

SLAM Nagalkeni

[View Session]
```

The PT session is the primary action.

If both PT and an independent workout exist:

``` text
TODAY

PT SESSION
6:30 PM

Vikas Menon

Your trainer will guide today's session.

[View Session]

Later

Personal workout
Optional
```

Avoid creating conflicting priorities.

------------------------------------------------------------------------

# 9. Trainer Updates

Trainers need the ability to publish member-facing updates.

Examples:

``` text
FROM YOUR TRAINER

"Increase your squat weight slightly today.
Focus on depth and control."

Vikas Menon
2 hours ago
```

Another:

``` text
WORKOUT UPDATED

Your Push workout has been updated.

5 exercises
45 minutes

[View Workout]
```

Another:

``` text
RECOVERY NOTE

Take tomorrow as a recovery day.

Posted by
Vikas Menon
```

------------------------------------------------------------------------

# 10. Owner / Gym Updates

The Owner should be able to publish:

``` text
GYM UPDATE

Strength Circuit
Tomorrow · 7:00 PM

12 spots remaining

[Join]
```

or:

``` text
SPECIAL OFFER

20% off PT renewal this week.

Valid until 25 Aug.

[View Offer]
```

or:

``` text
GYM UPDATE

SLAM Nagalkeni will close at 8 PM
on Sunday for maintenance.
```

------------------------------------------------------------------------

# 11. Updates Priority

Not every update belongs at the top of Home.

Use priority:

### Priority 1

Trainer/workout changes

### Priority 2

PT/session changes

### Priority 3

Important gym announcements

### Priority 4

Offers/promotions

### Priority 5

General announcements

The Home page should not become an advertising feed.

------------------------------------------------------------------------

# 12. Streak

Show the current streak prominently but responsibly.

Example:

``` text
YOUR STREAK

🔥 7 days

You're building consistency.

Best streak
14 days
```

Tapping the streak should open:

``` text
CONSISTENCY
```

with a simple calendar/history.

Do not make streak loss feel punitive.

Avoid copy such as:

``` text
You broke your streak.
```

Prefer:

``` text
Your next streak starts today.
```

------------------------------------------------------------------------

# 13. Home Progress Preview

Show only a small progress snapshot.

Example:

``` text
YOUR PROGRESS

Body weight
72.4 kg
↓ 1.2 kg

Body fat
18.4%
↓ 1.6%

Strength
+8%
```

Do not put every measurement on Home.

The Progress tab is the detailed source.

------------------------------------------------------------------------

# 14. Membership / PT Expiry

Member Home should surface important expiry information.

Examples:

``` text
MEMBERSHIP

18 days remaining

Expires 5 Sep

[View Membership]
```

If urgent:

``` text
MEMBERSHIP ENDING SOON

Expires in 3 days.

[Renew Membership]
```

PT:

``` text
PT PACKAGE

4 sessions remaining

Expires in 8 days.

[View PT]
```

The Member should never have to discover expiry only inside Account.

------------------------------------------------------------------------

# 15. Workout Page

The existing "No programme yet" screen should be replaced with a
**workout-first experience**.

The Member should NOT see:

``` text
45-day programme
```

as the primary concept.

That is an administrative/program structure.

Instead, the Member sees:

``` text
WORKOUT

Today's workout
Weekly plan
Workout history
```

------------------------------------------------------------------------

# 16. Workout Page --- Today's Workout

Example:

``` text
TODAY

PUSH
45 min · 5 exercises

Chest · Shoulders · Triceps

Assigned by
Vikas Menon

[START WORKOUT]
```

Then:

``` text
1
Bench Press

4 sets × 8 reps

Last time
60 kg × 8

[Log set]
```

Next:

``` text
2
Incline Dumbbell Press

3 sets × 10 reps

[Log set]
```

------------------------------------------------------------------------

# 17. Workout Detail

Each exercise should support:

-   Sets
-   Reps
-   Weight
-   Previous performance
-   Notes
-   Trainer instructions
-   Rest timer
-   Completion state

Example:

``` text
BENCH PRESS

Set 1
60 kg × 8

Set 2
60 kg × 8

Set 3
62.5 kg × 7

Set 4
62.5 kg × 6

REST
01:42

Trainer note:
"Controlled eccentric. Don't rush."

[Complete Exercise]
```

------------------------------------------------------------------------

# 18. Trainer Workout Assignment

Trainer must be able to create/update a member's workout.

Trainer workflow:

``` text
Trainer
↓
Select Client
↓
Create / Edit Workout
↓
Select Exercises
↓
Sets / Reps / Weight / Rest
↓
Add Trainer Note
↓
Assign Date
↓
Publish
```

Member sees:

``` text
Workout updated by Vikas Menon
```

This creates a direct Owner/Trainer → Member information flow.

------------------------------------------------------------------------

# 19. Weekly Workout View

The Workout tab should optionally provide a week overview.

Example:

``` text
THIS WEEK

MON
Push
✓ Complete

TUE
Pull
✓ Complete

WED
Rest

THU
Legs
Today

FRI
PT
6:30 PM

SAT
Recovery

SUN
Rest
```

This is more useful to the Member than exposing an internal "45-day
program" concept.

------------------------------------------------------------------------

# 20. PT Page

The PT page should become a **trainer discovery + relationship +
booking** experience.

Recommended:

``` text
PERSONAL TRAINING

Your Trainer
Vikas Menon

★★★★★
4.9

Strength & Transformation

[View Profile]

────────────────────

FIND A TRAINER

Recommended
Available today
Top rated

Trainer cards

────────────────────

UPCOMING PT

Fri · 6:30 PM
Vikas Menon
```

------------------------------------------------------------------------

# 21. Trainer Card

Example:

``` text
Vikas Menon

★★★★★ 4.9

Strength & Transformation

8 years experience

124 sessions

₹___ / session

Available today

[View Profile]
```

Do not invent ratings or experience in production data.

------------------------------------------------------------------------

# 22. Trainer Profile

When a Member taps a trainer:

``` text
Vikas Menon

★★★★★ 4.9
128 reviews

Strength & Transformation

Specialties
• Strength
• Muscle gain
• Transformation

Experience
8 years

────────────────────

TESTIMONIALS

"Very structured and motivating."

— Sneha K.

"Helped me stay consistent."

— Rahul D.

────────────────────

AVAILABILITY

Today
6:00 PM
7:00 PM
8:00 PM

Tomorrow
7:00 AM
6:30 PM

[Book Session]
```

Testimonials should only be shown if real member consent/data exists.

------------------------------------------------------------------------

# 23. PT Availability

Trainer availability should be generated from actual trainer schedules.

The existing calendar/time picker can be used as the **Trainer/Admin
scheduling component**.

The supplied implementation:

``` tsx
<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
/>
```

with:

``` tsx
<InputGroupInput
  type="time"
  step="1"
/>
```

is suitable as a base for selecting:

``` text
Date
Start time
End time
```

However, for a Member booking experience, do not expose raw start/end
inputs first.

Instead show available slots:

``` text
Tuesday, 18 Aug

6:00 PM
Available

6:30 PM
Available

7:00 PM
Booked

7:30 PM
Available
```

The calendar/time-picker is better suited to the **Trainer/Admin
availability creation** workflow.

------------------------------------------------------------------------

# 24. PT Booking Flow

Recommended:

``` text
PT
↓
Trainer
↓
Trainer Profile
↓
Availability
↓
Select slot
↓
Confirm
↓
Booking confirmed
```

Confirmation:

``` text
SESSION BOOKED

Vikas Menon

Tuesday, 18 Aug
6:30 PM

SLAM Nagalkeni

[Add to Calendar]
[View Session]
```

------------------------------------------------------------------------

# 25. Existing PT Relationship

If the Member already has a trainer, prioritize that relationship.

Do not immediately show a marketplace-like trainer directory.

Example:

``` text
YOUR TRAINER

Vikas Menon
★★★★★ 4.9

Strength & Transformation

Next session
Friday · 6:30 PM

[View Trainer]
```

Then:

``` text
FIND ANOTHER TRAINER
```

can appear below.

This preserves the coaching relationship.

------------------------------------------------------------------------

# 26. Progress Page

The Progress page should become the Member's **personal results
dashboard**.

Recommended structure:

``` text
PROGRESS

Your journey

Body
Strength
Consistency
Milestones

────────────────

BODY COMPOSITION

InBody

Weight
Body Fat
Skeletal Muscle
BMI

[View full InBody history]

────────────────

STRENGTH

Personal Records

Bench Press
Squat
Deadlift
etc.

────────────────

CONSISTENCY

Visits
Workouts
PT Sessions
Classes

────────────────

MILESTONES

Achievements
────────────────

LOG PROGRESS
```

------------------------------------------------------------------------

# 27. InBody Integration

If the branch has an InBody device connected to GymFlow, automatically
show imported results.

Useful metrics include:

-   Weight
-   Skeletal muscle mass
-   Body fat mass
-   Percent body fat
-   BMI
-   Other fields supplied by the connected InBody integration

InBody's own product documentation emphasizes tracking body composition
over repeated tests and comparing results over time.
citeturn0search0turn0search3

The UI should therefore prioritize **change over time**, not just
today's number.

Example:

``` text
BODY COMPOSITION

Weight
72.4 kg
↓ 1.2 kg

Body Fat
18.4%
↓ 1.6%

Skeletal Muscle
31.8 kg
↑ 0.7 kg

Last scan
12 Aug 2026

[View history]
```

------------------------------------------------------------------------

# 28. InBody History

Use a chart:

``` text
BODY FAT

20%
19%
18%
17%

Jun   Jul   Aug
```

Allow switching:

``` text
Weight
Body Fat
Muscle
```

Do not show too many graphs simultaneously.

------------------------------------------------------------------------

# 29. Manual Progress Logging

This is a major opportunity.

Allow Members to log progress that does not come from InBody.

Possible categories:

### Strength PR

``` text
Bench Press
80 kg × 5

New PR 🔥
```

### Measurement

``` text
Waist
82 cm
```

### Body weight

``` text
72.4 kg
```

### Endurance

``` text
5 km
28:42
```

### Exercise performance

``` text
Pull-ups
12 reps
```

### Flexibility / mobility

``` text
Toe touch
Improved
```

### Habit

``` text
Sleep
7h 20m
```

### Subjective recovery

``` text
Energy
8 / 10

Recovery
7 / 10
```

Do not force every metric.

Members choose what matters to their goals.

------------------------------------------------------------------------

# 30. Progress Entry

A simple flow:

``` text
LOG PROGRESS

What did you improve today?

[Strength]
[Body]
[Endurance]
[Measurement]
[Habit]
[Other]

Value
[________]

Date
[18 Aug 2026]

Notes
[________]

[Save]
```

------------------------------------------------------------------------

# 31. Personal Records

Create a dedicated PR section.

Example:

``` text
PERSONAL RECORDS

Bench Press
80 kg × 5
18 Aug

Squat
110 kg × 3
12 Aug

Deadlift
140 kg × 2
02 Aug

5K Run
28:42
28 Jul
```

Celebrate a new PR:

``` text
NEW PR 🔥

Bench Press
80 kg × 5

+5 kg from previous best
```

------------------------------------------------------------------------

# 32. Milestones

Add meaningful milestones.

Examples:

``` text
10 Workouts
✓

25 Gym Visits
✓

First PT Session
✓

100 kg Squat
✓

30-Day Consistency
✓

First InBody Scan
✓
```

Milestones should reward progress, not encourage unhealthy volume.

------------------------------------------------------------------------

# 33. Consistency

The current weekly activity chart is useful.

Expand it into:

``` text
CONSISTENCY

This week
4 visits

This month
14 visits

Current streak
7 days

Best streak
21 days

Workouts
12

PT sessions
4

Group classes
2
```

Then a simple calendar/heatmap.

------------------------------------------------------------------------

# 34. Goal Tracking

Add personal goals.

Examples:

``` text
GOALS

Lose 5 kg
3.2 / 5 kg

Bench 100 kg
80 / 100 kg

Attend 4x this week
3 / 4

Run 5K under 30 min
28:42 ✓
```

Goals should be optional.

The user can choose:

``` text
Weight
Strength
Attendance
Endurance
Body composition
Custom
```

------------------------------------------------------------------------

# 35. Trainer Feedback on Progress

Trainer should be able to comment on member progress.

Example:

``` text
TRAINER FEEDBACK

"Great consistency this month.
Your strength is moving up nicely."

Vikas Menon
18 Aug
```

This creates a useful loop:

``` text
Member logs progress
        ↓
Trainer sees it
        ↓
Trainer comments
        ↓
Member sees encouragement
```

------------------------------------------------------------------------

# 36. Surprise Feature --- Weekly Fitness Story

Instead of showing only isolated metrics, generate a compact weekly
summary.

Example:

``` text
YOUR WEEK

You showed up 4 times.

🔥 3 workouts completed
💪 Bench PR +5 kg
🏃 1 cardio session
📈 Strength trending up

Your consistency is your biggest win this week.
```

This turns raw data into a story.

Keep it concise.

------------------------------------------------------------------------

# 37. Surprise Feature --- Progress Timeline

Add a visual timeline:

``` text
YOUR JOURNEY

18 Aug
🔥 Bench PR
80 kg × 5

15 Aug
🏋️ Gym visit

12 Aug
📊 InBody scan

10 Aug
🔥 7-day streak

02 Aug
🎯 First PT session
```

This makes progress feel cumulative.

------------------------------------------------------------------------

# 38. Surprise Feature --- Before / After

If the Member explicitly chooses to record progress photos:

``` text
PROGRESS PHOTOS

Front
Side
Back

June 2026
↓
August 2026

[Compare]
```

Privacy must be explicit.

Do not automatically expose photos to trainers or other members.

------------------------------------------------------------------------

# 39. Surprise Feature --- Trainer Goals

A trainer can assign a small number of measurable goals.

Example:

``` text
YOUR TRAINER'S GOALS

✓ Complete 3 workouts this week
✓ Bench 70 kg × 8
○ Attend Friday PT
○ Improve squat depth
```

This is better than generic gamification because it connects motivation
to coaching.

------------------------------------------------------------------------

# 40. Surprise Feature --- Recovery Check

A lightweight optional check:

``` text
TODAY'S CHECK-IN

Energy
● ● ● ● ○

Soreness
● ● ○ ○ ○

Sleep
7h 20m
```

This can be visible to the trainer if the Member chooses to share it.

Do not present it as medical advice or diagnosis.

------------------------------------------------------------------------

# 41. Home Updates Model

Create a common update model.

``` text
Update
├── type
├── title
├── message
├── author
├── createdAt
├── priority
├── expiresAt
├── action
└── target
```

Types:

``` text
TRAINER_UPDATE
WORKOUT_UPDATE
PT_UPDATE
CLASS_UPDATE
GYM_ANNOUNCEMENT
OFFER
MEMBERSHIP_ALERT
SYSTEM_ALERT
```

This lets Home show a unified feed while preserving different sources.

------------------------------------------------------------------------

# 42. Trainer → Member Publishing

Trainer should have:

``` text
CLIENTS
↓
Select Member
↓
Post Update
```

Options:

``` text
Workout update
Trainer note
Goal
Recovery note
Session reminder
```

Example:

``` text
POST UPDATE

To
Sneha Kapoor

Type
Workout update

Message
"Add one extra set of cable rows today."

[Publish]
```

------------------------------------------------------------------------

# 43. Owner → Members Publishing

Owner can publish:

``` text
All members
Branch
Membership segment
PT members
Specific member
```

Example:

``` text
CREATE ANNOUNCEMENT

Audience
SLAM Nagalkeni

Type
Group Class

Title
Strength Circuit

Date
20 Aug
7:00 PM

[Publish]
```

------------------------------------------------------------------------

# 44. Notifications

The existing "notifications off in this build" placeholder should
eventually become a real notification center.

Categories:

``` text
Workout
PT
Trainer
Gym
Membership
Offers
Progress
```

Examples:

``` text
Your trainer updated today's workout.

Your PT session is tomorrow at 6:30 PM.

Your membership expires in 7 days.

You hit a new bench press PR.
```

Avoid sending every event as a push notification.

------------------------------------------------------------------------

# 45. Home Priority Rules

Home should prioritize information in this order:

``` text
1. Today's workout / PT
2. Trainer instruction
3. Important membership/PT expiry
4. Personal progress
5. Streak / consistency
6. Gym updates
7. Offers
```

This prevents the Home screen from becoming a marketing surface.

------------------------------------------------------------------------

# 46. Account Page

Keep the existing Account page structure.

Current useful information:

``` text
Aditya Rao
MEMBER
SLAM Nagalkeni

Role
Member

Gym
SLAM Nagalkeni

Phone
+91...
```

Useful sections:

``` text
Account
Membership
Attendance
Progress
Notifications
Security
```

Avoid duplicating the full Progress experience here.

------------------------------------------------------------------------

# 47. Calendar / Scheduling Component

The supplied calendar component can be retained as a shared component.

Use it primarily for:

### Trainer/Admin

-   Creating availability
-   Editing availability
-   Scheduling PT
-   Creating classes
-   Selecting start/end times

### Member

Use a simplified availability selector:

``` text
Choose date
↓
Available slots
↓
Choose slot
```

Do not expose unnecessary raw scheduling controls to Members.

------------------------------------------------------------------------

# 48. Member UX Rules

### Rule 1

The Member Home should answer:

> "What should I do today?"

### Rule 2

Workout should answer:

> "What exactly do I need to do?"

### Rule 3

PT should answer:

> "Who can coach me and when?"

### Rule 4

Progress should answer:

> "Am I getting better?"

### Rule 5

Account should answer:

> "What is my membership/account status?"

------------------------------------------------------------------------

# 49. What NOT to Show Members

Do not expose Owner/Trainer operational concepts such as:

-   45-day journey administration
-   Incentive eligibility
-   Staff punctuality
-   Branch revenue
-   Trainer attendance
-   Internal corrections
-   Owner alerts
-   Internal operational rules

The Member should see the **fitness outcome**, not the gym's internal
administration.

------------------------------------------------------------------------

# 50. Member Experience Information Architecture

``` text
MEMBER
│
├── HOME
│   ├── Greeting
│   ├── Mood
│   ├── Today's Workout / PT
│   ├── Streak
│   ├── Progress Snapshot
│   ├── Trainer Update
│   ├── Gym Updates
│   └── Membership/PT Alerts
│
├── WORKOUT
│   ├── Today's Workout
│   ├── Weekly Plan
│   ├── Exercise Details
│   ├── Set Logging
│   ├── Rest Timer
│   ├── Workout History
│   └── Trainer Notes
│
├── PT
│   ├── My Trainer
│   ├── Trainer Profile
│   ├── Ratings
│   ├── Testimonials
│   ├── Trainer Availability
│   ├── PT Sessions
│   └── Booking
│
├── PROGRESS
│   ├── Overview
│   ├── InBody
│   ├── Body Composition
│   ├── Strength
│   ├── Personal Records
│   ├── Consistency
│   ├── Goals
│   ├── Milestones
│   ├── Progress Photos
│   ├── Manual Logs
│   └── Trainer Feedback
│
└── ACCOUNT
    ├── Profile
    ├── Membership
    ├── Attendance
    ├── Notifications
    ├── Security
    └── Settings
```

------------------------------------------------------------------------

# 51. Member → Trainer → Owner Data Flow

The product should create a connected loop.

``` text
TRAINER
   │
   ├── assigns workout
   ├── adds goal
   ├── posts update
   └── provides feedback
           ↓
        MEMBER
           │
           ├── completes workout
           ├── logs PR
           ├── records progress
           ├── books PT
           └── reports mood/recovery
           ↓
        TRAINER
           │
           └── sees progress

OWNER
   │
   ├── sees member retention
   ├── sees PT utilization
   ├── sees renewals
   └── sees business-level activity
```

This should be a shared product model rather than isolated screens.

------------------------------------------------------------------------

# 52. Recommended Implementation Order

## Phase 1 --- Member Home

1.  Greeting
2.  Mood
3.  Today's workout/PT
4.  Streak
5.  Progress snapshot
6.  Trainer updates
7.  Gym updates
8.  Membership/PT alerts

## Phase 2 --- Workout

9.  Today's workout
10. Exercise detail
11. Set logging
12. Rest timer
13. Workout completion
14. Weekly plan
15. Trainer assignment workflow

## Phase 3 --- PT

16. My trainer
17. Trainer profile
18. Ratings
19. Testimonials
20. Availability
21. Booking
22. Upcoming sessions

## Phase 4 --- Progress

23. InBody integration
24. Body composition history
25. Strength/PR tracking
26. Manual progress logging
27. Goals
28. Milestones
29. Consistency
30. Trainer feedback

## Phase 5 --- Engagement

31. Weekly Fitness Story
32. Progress timeline
33. Progress photos
34. Recovery check
35. Smart notifications

------------------------------------------------------------------------

# 53. Definition of Done

A Member should be able to open GymFlow and answer:

### Today

-   What should I do today?
-   Is today a workout or PT day?
-   Who is my trainer?
-   What time is my session?

### Motivation

-   How long is my streak?
-   What did I accomplish recently?
-   Did I set a new PR?

### Progress

-   Is my weight changing?
-   Is my body composition changing?
-   Is my strength improving?
-   How consistent am I?

### Coaching

-   Did my trainer leave an update?
-   What is my current goal?
-   What should I focus on?

### PT

-   Who are my available trainers?
-   What are their specialties?
-   What do other members say?
-   When can I book?

### Membership

-   When does my membership expire?
-   When does my PT package expire?
-   How many PT sessions remain?

------------------------------------------------------------------------

# 54. Critical Product Decision

Do not make GymFlow's Member Home a clone of the Owner dashboard.

The Owner needs:

``` text
Operations
Revenue
Retention
Staff
Branches
```

The Member needs:

``` text
Today
Workout
Coach
Progress
Motivation
```

That separation is important.

------------------------------------------------------------------------

# 55. Immediate Next Design Task

The next screen to design should be:

> **Member → Home**

Use the existing **Aditya Rao** Member screens as the visual reference.

Design the new Home around:

``` text
Good Morning, Aditya 👋

How are you feeling today?

Today's Workout / PT

Streak

Progress Snapshot

Trainer Update

Gym / Class Updates

Membership / PT Expiry
```

Then design:

> **Member → Workout → Today's Workout**

using the trainer-assigned workout model.

After that:

> **Member → PT → Trainer Profile + Availability**

Then:

> **Member → Progress → InBody + PR + Goals + Consistency**

------------------------------------------------------------------------

# 56. Product Principle

GymFlow Member should feel like:

> **A coach that remembers your journey.**

Not:

> **An app that stores your gym records.**

The interface should continuously connect:

``` text
What you did
      ↓
How you're progressing
      ↓
What your trainer recommends
      ↓
What you should do next
```

That is the experience that makes the Member side of GymFlow valuable.
