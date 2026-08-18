# GymFlow --- Owner Plan

## Purpose

This document defines the **Owner experience and information
architecture** for GymFlow.

It is written so that Claude, ChatGPT, Gemini, Lovable, Figma AI,
Cursor, or another LLM can use it as a product/design specification.

The goal is **not to redesign the current visual language**. The current
UI direction is good:

-   Premium
-   Dark
-   Minimal
-   Gold as the primary brand accent
-   Clear cards
-   Strong typography
-   Bottom navigation
-   Operational rather than overly decorative

The focus now is to define **what the Owner needs to see, what actions
they need to take, and how the screens connect**.

------------------------------------------------------------------------

# 1. Owner Product Philosophy

The Owner dashboard should answer one question immediately:

> **How is my gym doing today, and what needs my attention?**

The Owner experience should prioritize:

1.  Operational awareness
2.  Revenue protection
3.  Member retention
4.  Membership renewals
5.  PT package renewals
6.  Payment collection
7.  Trainer/staff visibility
8.  Branch performance

Avoid turning the Owner dashboard into a collection of analytics charts.

### Core principle

**Every important number on the Owner dashboard should be actionable.**

Examples:

-   `7 Renewals` → opens the 7 actual members
-   `₹45,100 Outstanding` → opens unpaid accounts
-   `3 PT packages ending` → opens those PT packages
-   `4 Inactive members` → opens those members
-   `0 Inside` → opens live attendance
-   `0/8 Trainers Present` → opens trainer attendance

The Owner should be able to move from **signal → person → action** with
minimal navigation.

------------------------------------------------------------------------

# 2. Owner Navigation

Use the existing primary navigation:

``` text
Dashboard
Members
Trainers
Marketing
Account
```

Recommended responsibility of each section:

### Dashboard

What is happening now and what requires attention.

### Members

Member database, journeys, PT clients, expiry, inactivity, and
individual member records.

### Trainers

Trainer roster, attendance, schedules, PT clients, sessions, and
performance.

### Marketing

Leads, follow-ups, campaigns, and member acquisition.

### Account

Owner profile, branches, plans, operations, notifications, and settings.

------------------------------------------------------------------------

# 3. Owner Dashboard

The current dashboard visual direction is good and should be retained.

Recommended structure:

``` text
OWNER DASHBOARD
│
├── Header
│
├── Right Now
│
├── Today
│
├── Needs Attention
│
├── Renewals
│
├── PT Packages Ending
│
├── Money
│
├── Performance
│
└── Branch Performance
```

------------------------------------------------------------------------

## 3.1 Header

Example:

``` text
Good morning, Karan

Tuesday, 18 August
All SLAM branches

[Settings]
```

If the Owner manages multiple branches, show the current scope clearly:

``` text
All SLAM branches ▾
```

Branch filtering must affect the dashboard numbers.

------------------------------------------------------------------------

# 4. Right Now

Keep the existing concept because it is useful.

Example:

``` text
RIGHT NOW

0 inside

Tuesday, 18 August · 3 branches

0/8 trainers present
8 shifts scheduled
285 member capacity
```

The card should be interactive.

### Actions

-   Tap `0 inside` → Live gym attendance
-   Tap `0/8 trainers` → Trainer attendance
-   Tap `8 shifts` → Today's trainer roster
-   Tap branch count → Branch selector/performance

Do not make these numbers decorative.

------------------------------------------------------------------------

# 5. Today

Current cards:

-   Late
-   Absent
-   Punctuality

Keep these.

Consider adding:

### Visits today

``` text
37 visits
12 unique members
```

This gives the Owner an understanding of member activity, not only staff
attendance.

------------------------------------------------------------------------

# 6. Needs Attention

This is the most important addition to the Owner dashboard.

Place it before detailed revenue analytics.

Example:

``` text
NEEDS ATTENTION

7 memberships expire soon
₹1.18L potential renewal value
[View members →]

3 PT packages are ending
11 sessions remaining across 3 members
[View PT →]

5 payments overdue
₹45,100 outstanding
[View dues →]

4 members inactive
No visit for 14+ days
[View members →]
```

The exact numbers are examples only.

The production UI must use real data.

### Why this section matters

The Owner should not have to inspect multiple screens to discover:

-   Memberships are expiring
-   PT packages are ending
-   Money is overdue
-   Members are becoming inactive

The dashboard should surface these events proactively.

------------------------------------------------------------------------

# 7. Membership Renewals

The current:

``` text
RENEWALS DUE
7
next 30 days
```

is useful but too passive.

Recommended:

``` text
RENEWALS

7 due soon

1 expires in 3 days
2 expire in 7 days
4 expire in 30 days

₹1,18,500 potential renewal value

[View renewal queue →]
```

The Owner should be able to open the list of affected members.

------------------------------------------------------------------------

# 8. PT Package Expiry

PT expiry must be treated separately from membership expiry.

This is important.

A member can have:

``` text
Membership
Active for 4 months

PT package
Expires tomorrow
```

or:

``` text
Membership
Expires tomorrow

PT package
8 sessions remaining
```

These are different commercial events.

Do not combine them into a single "membership expiry" state.

------------------------------------------------------------------------

## 8.1 PT Package Information

For every PT package, track:

-   Package type
-   Total sessions
-   Sessions completed
-   Sessions remaining
-   Start date
-   Expiry date
-   Assigned trainer
-   Package status
-   Renewal status

Example:

``` text
PERSONAL TRAINING

20 Session PT Package

17 / 20 completed
3 sessions remaining

Trainer
Vikas Menon

Expires
21 Aug 2026

Status
ENDING SOON

[Renew PT]
```

------------------------------------------------------------------------

# 9. Expiry Center

Create a reusable expiry workflow.

From Dashboard:

``` text
Needs Attention
    ↓
Memberships expiring
```

Open:

``` text
EXPIRING

Memberships | PT
```

------------------------------------------------------------------------

## 9.1 Membership Expiry List

Example:

  Member         Plan      Expiry      Amount Status
  -------------- --------- -------- --------- ---------
  Sneha Kapoor   Premium   21 Aug     ₹12,000 3 days
  Deepa Raman    Gold      24 Aug      ₹9,000 6 days
  Farhan Ali     Premium   28 Aug     ₹12,000 10 days

Each row should be clickable.

Clicking the member opens Member 360.

------------------------------------------------------------------------

## 9.2 PT Expiry List

Example:

  Member         Trainer          Sessions Left Expiry   Status
  -------------- -------------- --------------- -------- -------------
  Sneha Kapoor   Vikas Menon                  3 21 Aug   Ending soon
  Karthik Nair   Sneha Iyer                   2 24 Aug   Ending soon
  Lakshmi Iyer   Kiran Prasad                 5 27 Aug   Upcoming

------------------------------------------------------------------------

# 10. Expiry Rules

Define expiry states consistently.

## Membership

``` text
>30 days       GREEN
30–8 days      YELLOW
7–3 days       ORANGE
2–0 days       RED
Expired        GREY/RED
```

Exact colors should follow the existing GymFlow design system.

------------------------------------------------------------------------

## PT Package

PT should use two independent signals:

### Sessions remaining

``` text
>5 sessions      GREEN
3–5 sessions     YELLOW
1–2 sessions     RED
0 sessions       EXHAUSTED
```

### Package expiry

``` text
>30 days         GREEN
30–14 days       YELLOW
13–7 days        ORANGE
6–0 days         RED
Expired          EXPIRED
```

This allows GymFlow to distinguish:

``` text
5 sessions left
expires tomorrow
```

from:

``` text
1 session left
expires in 45 days
```

These should not be treated as the same situation.

------------------------------------------------------------------------

# 11. Inactive Members / Retention

Add an Owner signal for inactive members.

Example:

``` text
AT RISK

14 members haven't visited in 14+ days

Sneha Kapoor
Last visit: 17 days ago

Rahul Sharma
Last visit: 21 days ago

...

[View inactive members →]
```

This is intended as an early retention signal.

The system should identify inactivity before the membership expires.

------------------------------------------------------------------------

# 12. Members Page

The current Members screen is visually strong, but its primary purpose
should be broader than the 45-day journey list.

The Members page should become the main member-management screen.

Recommended structure:

``` text
MEMBERS

285 total · 241 active · 31 expiring · 13 inactive

[Search name, phone, email...]

All | Active | Expiring | Expired | Inactive | PT

Branch ▾
Trainer ▾
Plan ▾
```

Then show the member list.

------------------------------------------------------------------------

# 13. 45-Day Journeys

Do NOT remove the existing 45-day journey feature.

It is a useful GymFlow-specific workflow.

Instead, make it a dedicated view/filter.

Recommended:

``` text
Members

[All Members] [45-Day Journeys] [PT]
```

When `45-Day Journeys` is selected, the current card style can remain:

``` text
Sneha Kapoor

Day 44 / 45

34 workouts recorded · Vikas Menon

[PULL]

██████████████████████████████████
```

The existing design can be retained with minor interaction improvements.

------------------------------------------------------------------------

# 14. Member List Interaction

The Member page must be interactive.

Example:

``` text
Sneha Kapoor
Day 44 / 45
34 workouts
Vikas Menon
```

When the Owner taps the member:

``` text
Sneha Kapoor
        ↓
Member 360
```

Do not leave member cards as static information.

Every important member card should open the complete member record.

------------------------------------------------------------------------

# 15. Member 360

This is the most important screen after the Owner dashboard.

The Member 360 should give the Owner one place to understand the member.

Recommended structure:

``` text
MEMBER 360
│
├── Header
├── Quick Status
├── Membership
├── Personal Training
├── Attendance
├── 45-Day Journey
├── Payments
├── Recent Activity
└── Notes / Actions
```

------------------------------------------------------------------------

# 16. Member 360 --- Header

Example:

``` text
Sneha Kapoor

ACTIVE

SLAM Alandur

Joined 12 June 2026

Trainer
Vikas Menon

[Call]
[WhatsApp]
[More]
```

The exact actions depend on the communication capabilities available in
GymFlow.

------------------------------------------------------------------------

# 17. Member 360 --- Quick Status

Use compact status cards:

``` text
Membership
ACTIVE

PT
ENDING SOON

Attendance
91%

Dues
₹0
```

This gives the Owner an immediate summary.

------------------------------------------------------------------------

# 18. Member 360 --- Membership

Example:

``` text
MEMBERSHIP

SLAM Premium
3 Months

Expires
24 Aug 2026

6 days remaining

Status
ENDING SOON

[Renew Membership]
```

If the membership is expired:

``` text
EXPIRED

Expired on 15 Aug 2026

[Renew Membership]
```

------------------------------------------------------------------------

# 19. Member 360 --- PT

Example:

``` text
PERSONAL TRAINING

20 Session PT Package

17 / 20 completed

3 sessions remaining

Trainer
Vikas Menon

Expires
21 Aug 2026

ENDING SOON

[Renew PT]
```

If there is no PT package:

``` text
NO ACTIVE PT PACKAGE

[Add PT Package]
```

------------------------------------------------------------------------

# 20. Member 360 --- Attendance

Example:

``` text
ATTENDANCE

91% attendance
90% punctuality

Last visit
18 Aug · 6:12 AM

This month
12 visits

[View attendance history →]
```

The Owner should be able to see attendance history without leaving the
member context.

------------------------------------------------------------------------

# 21. Member 360 --- 45-Day Journey

Example:

``` text
45-DAY JOURNEY

Day 44 / 45

34 workouts recorded

Trainer
Vikas Menon

Current focus
PULL

[View journey →]
```

If the journey is completed:

``` text
45 / 45

COMPLETED

[View journey results]
```

If not started:

``` text
PROGRAMME NOT STARTED

Your trainer needs to set up the programme.

[Assign / Start Programme]
```

------------------------------------------------------------------------

# 22. Member 360 --- Payments

Example:

``` text
PAYMENTS

Outstanding
₹0

Last payment
₹12,000 · 24 May 2026

[View payment history →]
```

If overdue:

``` text
OUTSTANDING

₹4,500

12 days overdue

[Record Payment]
[Contact Member]
```

------------------------------------------------------------------------

# 23. Member 360 --- Recent Activity

Show a simple chronological activity feed.

Example:

``` text
RECENT ACTIVITY

18 Aug
Gym visit

17 Aug
PT session

16 Aug
Gym visit

15 Aug
PT session

12 Aug
Payment received
```

This should be compact and easy to scan.

------------------------------------------------------------------------

# 24. Member Alerts

Alerts should be contextual.

Examples:

### Membership

``` text
MEMBERSHIP EXPIRING

Sneha's membership expires in 6 days.

[Renew Membership]
```

### PT

``` text
PT PACKAGE ENDING

3 sessions remain and the package expires in 3 days.

[Renew PT]
```

### Payment

``` text
PAYMENT OVERDUE

₹4,500 has been outstanding for 12 days.

[Record Payment]
[Contact Member]
```

### Inactivity

``` text
MEMBER INACTIVE

No gym visit recorded for 16 days.

[View Attendance]
[Contact Member]
```

Do not use generic SaaS subscription language such as:

> "Your subscription will expire in 3 days."

That alert pattern is useful as a UI component, but GymFlow needs
gym-domain messaging.

------------------------------------------------------------------------

# 25. Dashboard Money Section

Keep the existing Money section.

Current concept:

``` text
MONEY

Collected
₹3.33L
last 30 days

Outstanding
₹45,100
all unpaid
```

The `Outstanding` number should be clickable.

------------------------------------------------------------------------

## 25.1 Money Breakdown

The current:

``` text
BY WHAT WAS SOLD

Membership
Personal training
Group classes
Renewals
```

is useful.

Keep it, but make the rows interactive.

Example:

``` text
Membership        ₹2.35L
Personal training ₹42,000
Group classes     ₹3,100
Renewals          ₹97,500
```

Clicking a category should open the relevant transaction/revenue detail.

------------------------------------------------------------------------

# 26. Performance

Keep:

``` text
TODAY | WEEK | MONTH
```

The Owner should be able to switch time range.

Metrics can include:

-   Visits
-   New members
-   Renewals
-   Membership revenue
-   PT revenue
-   Group class revenue
-   Attendance rate
-   Trainer utilization

Do not put all metrics on the main screen.

Show a concise summary and allow:

``` text
[Detail →]
```

------------------------------------------------------------------------

# 27. Branch Performance

Because the Owner can see multiple branches, branch comparison should be
available.

Example:

``` text
BRANCH PERFORMANCE

SLAM Alandur
Members: 102
Revenue: ₹1.24L
Attendance: 78%

SLAM Nagalkeni
Members: 94
Revenue: ₹98K
Attendance: 74%

SLAM Velachery
Members: 89
Revenue: ₹1.11L
Attendance: 81%

[View detailed comparison →]
```

The existing Account page already communicates that the Owner can see
all SLAM branches.

------------------------------------------------------------------------

# 28. Alerts / Notifications

The Owner should have an Alerts area, but it should not become a dumping
ground.

Alerts should be categorized:

``` text
Alerts

Membership
7

PT
3

Payments
5

Attendance
2

Operations
1
```

Examples:

-   Membership expiring
-   PT package ending
-   Payment overdue
-   Unusual inactivity
-   Trainer absent
-   Shift issue
-   Attendance correction required
-   Operational issue

------------------------------------------------------------------------

# 29. Owner Account Page

The current Owner Account page already has a good structure.

Keep:

``` text
Account

Karan Shetty
owner@slam.demo

OWNER

Role
Owner

Gym
All SLAM branches

Phone
+91 90000 00000
```

The existing activity links are useful:

``` text
Payments
Incentives
Branch performance
PT opportunities
Group classes
Corrections
Alerts
Operations
```

However, these should connect to the same workflows defined above.

------------------------------------------------------------------------

# 30. Owner Account --- Important Change

Avoid duplicating functionality unnecessarily.

For example:

``` text
Account → Payments
```

and:

``` text
Dashboard → Money → Outstanding
```

can lead to the same payment system but different entry points.

The underlying data should be shared.

Likewise:

``` text
Account → PT opportunities
```

can lead to the same PT opportunity/renewal workflow surfaced from:

``` text
Dashboard → Needs Attention
```

------------------------------------------------------------------------

# 31. Final Owner Information Architecture

``` text
OWNER
│
├── Dashboard
│   │
│   ├── Right Now
│   ├── Today
│   ├── Needs Attention
│   ├── Membership Renewals
│   ├── PT Packages Ending
│   ├── Money
│   ├── Performance
│   └── Branch Performance
│
├── Members
│   │
│   ├── All Members
│   ├── Active
│   ├── Expiring
│   ├── Expired
│   ├── Inactive
│   ├── PT
│   └── 45-Day Journeys
│       │
│       └── Member 360
│           ├── Overview
│           ├── Membership
│           ├── PT
│           ├── Attendance
│           ├── Journey
│           ├── Payments
│           ├── Activity
│           └── Notes / Actions
│
├── Trainers
│   ├── Roster
│   ├── Attendance
│   ├── Schedules
│   ├── PT Clients
│   ├── PT Sessions
│   └── Performance
│
├── Marketing
│   ├── Leads
│   ├── Follow-ups
│   └── Campaigns
│
└── Account
    ├── Owner Profile
    ├── Branches
    ├── Payments
    ├── Incentives
    ├── PT Opportunities
    ├── Group Classes
    ├── Corrections
    ├── Alerts
    ├── Operations
    ├── Notifications
    └── Settings
```

------------------------------------------------------------------------

# 32. Core Owner Workflows

The LLM implementing the product should preserve these workflows.

## Workflow A --- Membership Renewal

``` text
Dashboard
  ↓
Needs Attention
  ↓
Membership expires soon
  ↓
Renewal Queue
  ↓
Member
  ↓
Member 360
  ↓
Membership
  ↓
Renew Membership
```

------------------------------------------------------------------------

## Workflow B --- PT Renewal

``` text
Dashboard
  ↓
PT packages ending
  ↓
PT Expiry Queue
  ↓
Member
  ↓
Member 360
  ↓
PT Package
  ↓
Renew PT
```

------------------------------------------------------------------------

## Workflow C --- Payment Collection

``` text
Dashboard
  ↓
Outstanding
  ↓
Unpaid Members
  ↓
Member
  ↓
Member 360
  ↓
Payments
  ↓
Record Payment / Contact Member
```

------------------------------------------------------------------------

## Workflow D --- Inactive Member

``` text
Dashboard
  ↓
At Risk
  ↓
Inactive Members
  ↓
Member
  ↓
Attendance
  ↓
Contact Member
```

------------------------------------------------------------------------

## Workflow E --- Member Lookup

``` text
Members
  ↓
Search
  ↓
Member
  ↓
Member 360
```

------------------------------------------------------------------------

# 33. Product Design Rules

The implementation should follow these rules.

### Rule 1 --- Do not add information just because there is space.

Every element should answer:

> Does this help the Owner make a decision or take an action?

### Rule 2 --- Numbers must be actionable.

If a number is important enough to show, it should usually be possible
to drill into it.

### Rule 3 --- Membership and PT are separate products.

Do not combine their expiry states.

### Rule 4 --- Detect problems before they become lost revenue.

Prioritize:

``` text
Inactive member
      ↓
Membership expiry
      ↓
Membership expired
```

rather than only showing the final state.

### Rule 5 --- Member 360 is the source of truth for a member.

Dashboard cards should deep-link to the relevant Member 360 state.

### Rule 6 --- Avoid dashboard overload.

Detailed information belongs in deeper screens.

### Rule 7 --- Preserve the existing visual system.

Do not introduce a completely different visual language when
implementing these flows.

------------------------------------------------------------------------

# 34. What Should NOT Be Added to Owner Home Yet

Do not overload the Owner dashboard with:

-   Detailed BMI analytics
-   Detailed workout analytics
-   Full payment transaction tables
-   Full trainer analytics
-   Diet information
-   Inventory
-   Equipment management
-   Marketing campaign analytics
-   Detailed member measurements
-   Large data tables
-   Every possible KPI

These can be deeper features.

The Owner Home should remain a **decision and operations screen**.

------------------------------------------------------------------------

# 35. Recommended Implementation Priority

Build in this order.

## Phase 1 --- Member Management

1.  Members list
2.  Search
3.  Filters
4.  Member card interaction
5.  Member 360
6.  Membership status
7.  PT status
8.  Attendance
9.  Payments
10. 45-day journey

## Phase 2 --- Owner Attention System

11. Membership expiry detection
12. PT expiry detection
13. Outstanding payment detection
14. Inactive member detection
15. Needs Attention dashboard section
16. Expiry queues

## Phase 3 --- Dashboard Drill-down

17. Live gym status
18. Trainer attendance
19. Revenue drill-down
20. Branch performance
21. Owner alerts

## Phase 4 --- Trainer / Marketing Workflows

22. Trainer management
23. PT client management
24. Leads
25. Follow-ups
26. Campaigns

------------------------------------------------------------------------

# 36. Definition of Done --- Owner Experience

The Owner experience should be considered successful when Karan can
answer these questions without hunting through the app:

### Gym status

-   How many members are inside?
-   How many trainers are present?
-   Which branch is busiest?

### Revenue

-   How much was collected?
-   How much is outstanding?
-   What revenue is coming from memberships?
-   What revenue is coming from PT?

### Renewals

-   Who is expiring this week?
-   Who is expiring this month?
-   How much renewal revenue is potentially at risk?

### PT

-   Which PT packages are ending?
-   How many sessions remain?
-   Which trainer owns the relationship?

### Retention

-   Which members have stopped visiting?
-   Who might be at risk of churn?

### Member

-   What is Sneha's membership status?
-   When does it expire?
-   Does she have PT?
-   How many PT sessions remain?
-   When did she last visit?
-   Does she owe money?
-   What is her 45-day journey status?

If GymFlow can answer these questions quickly, the Owner product is
doing its job.

------------------------------------------------------------------------

# 37. Important Instruction for AI / Implementation Agents

When implementing this Owner Plan:

1.  **Do not redesign the existing UI from scratch.**
2.  Preserve the current dark/premium SLAM/GymFlow visual language.
3.  Treat the screenshots provided in the project as the visual
    reference.
4.  Add functionality and information architecture around the existing
    design.
5.  Make member cards interactive.
6.  Build Member 360 as the central member detail experience.
7.  Separate Membership and PT package lifecycle states.
8.  Surface expiry and inactivity as actionable Owner alerts.
9.  Make dashboard metrics drillable.
10. Prefer real data relationships over hardcoded duplicated
    information.
11. Keep Owner dashboard concise.
12. Use progressive disclosure for detailed analytics.
13. Do not create unnecessary screens until the workflow requires them.
14. Reuse components and data patterns across Dashboard, Members,
    Alerts, Payments and PT.
15. Any placeholder/demo data must be clearly structured so it can later
    be replaced by real data.

------------------------------------------------------------------------

# 38. Current Design Reference

The provided screens establish the current visual direction:

-   Owner Dashboard
-   Owner Members
-   Owner Account
-   Member Account
-   Member Progress
-   Member Home
-   Member Workout
-   Alert component reference

The next design work should extend this system rather than replace it.

------------------------------------------------------------------------

# 39. Immediate Next Design Task

The next screen to design should be:

> **Owner → Members → Member 360**

Use **Sneha Kapoor** as the example member because she is already
present in the current Owner Members screen.

The interaction should be:

``` text
Owner Members
      ↓
Tap "Sneha Kapoor"
      ↓
Member 360
      ↓
See:
  - Membership
  - PT
  - Attendance
  - 45-Day Journey
  - Payments
  - Recent Activity
  - Alerts
      ↓
Take action:
  - Renew Membership
  - Renew PT
  - Record Payment
  - Contact Member
```

Once this screen is finalized, use the same underlying information
architecture to refine the Owner Dashboard's **Needs Attention**,
**Renewals**, **PT Opportunities**, and **Outstanding Payments**
sections.

------------------------------------------------------------------------

# Owner Plan --- Summary

The Owner product should not simply tell the owner what happened.

It should tell them:

> **What is happening → What needs attention → Who is affected → What
> action should I take?**

That is the core product principle for GymFlow Owner.
