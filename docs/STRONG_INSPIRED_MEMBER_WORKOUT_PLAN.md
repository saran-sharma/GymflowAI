# GymFlow AI — Strong-Inspired Member Workout Integration Plan

> **Purpose:** This file is the implementation specification for Antigravity/Codex/Claude working directly in the GymFlow AI repository.
>
> **Reference principle:** Take the *workout interaction philosophy* from Strong, not its branding or visual identity.

---

## 1. Product Direction

### Strong

Strong is a reference for excellent workout logging:

- Fast set / rep / weight entry
- Previous workout performance
- Personal records
- Rest timers
- RPE
- Supersets
- Exercise history
- Progress charts
- Workout templates
- Scheduling

### GymFlow AI

GymFlow should go beyond logging:

> **Workout logging + understanding + next-best-action recommendations + trainer connection**

The key product principle:

> **Make the next workout better, not merely the last workout better documented.**

---

# 2. What We SHOULD Take From Strong

| Capability | GymFlow implementation | Priority |
|---|---|---|
| Workout logging | Fast set/rep/weight entry with minimal taps | P0 |
| Previous performance | Show last-session weight/reps beside current exercise | P0 |
| Personal records | Automatically detect and celebrate PRs | P0 |
| Rest timer | Automatic timer after sets | P0 |
| RPE | Capture RPE and use it in recommendations | P1 |
| Supersets | Group exercises into supersets/circuits | P1 |
| Exercise history | Per-exercise performance history | P1 |
| Progress charts | Strength, volume, reps, consistency, estimated 1RM | P1 |
| Workout templates | Save/reuse routines | P1 |
| Scheduling | Calendar-based training plan | P1 |
| Body measurements | Weight and selected measurements | P2 |
| Workout sharing | Optional achievement/workout sharing | P2 |
| Muscle coverage | Muscle-group volume/coverage visualization | P2 |

---

# 3. What We SHOULD NOT Copy

Do not turn GymFlow into a Strong clone.

Avoid:

- Copying Strong branding
- Copying Strong's exact UI
- Copying Strong's visual identity
- Excessive customization
- Too many integrations before the core workout loop is excellent
- Overbuilt social/sharing features
- Too many charts on the main screen
- Gamification everywhere
- Complex exercise-builder flows
- Feature parity for its own sake

GymFlow's differentiator is the AI + trainer + gym ecosystem.

---

# 4. Existing GymFlow Product Structure

Preserve the existing role architecture:

- Member
- Trainer
- Owner
- Authentication

Existing Member navigation:

- Home
- Workouts
- Nutrition
- Progress
- Profile

Recommended direction:

- Home → daily command center
- Workouts → evolve into the **Train** experience
- Nutrition → nutrition/macros/hydration
- Progress → strength/body/consistency/AI insights
- Profile → membership/account/settings

Do not rewrite the entire navigation just to implement the workout experience.

---

# 5. Core P0 — Member Train Experience

This is the highest-priority implementation.

The Member should be able to start today's workout and record sets with minimal friction.

### Example

```text
TODAY
Upper Body Strength

48 min · 6 exercises

────────────────────────

BENCH PRESS

Previous
60 kg × 8
60 kg × 8
57.5 kg × 10

Current

SET    KG     REPS     STATUS
1      60      8        ✓
2      60      8        ✓
3      60      7        ○

+ Add Set

REST
01:32

────────────────────────

NEXT EXERCISE
```

### UX requirements

- Mobile-first
- One-hand friendly
- Minimal taps
- Large touch targets
- Fast numeric entry
- Clear current-set state
- Clear completed-set state
- Easy exercise navigation
- Easy workout completion
- Premium dark visual system
- Existing GymFlow design language
- Member lime should be an accent, not the entire interface
- Avoid excessive cards

---

# 6. Previous Performance

Previous performance should be immediately visible when executing an exercise.

Example:

```text
LAST SESSION

60 kg × 8
60 kg × 8
57.5 kg × 10
```

If sufficient history exists:

```text
GYMFLOW SUGGESTION

Try:
62.5 kg × 6–8
```

Do not fabricate a recommendation if the required historical data does not exist.

---

# 7. Personal Records

Implement real PR detection.

Possible PR types:

- Highest weight
- Best reps at a given weight
- Estimated 1RM
- Highest workout volume

Example:

```text
NEW PR

Bench Press

62.5 kg × 8

+4% estimated strength
```

Keep the celebration subtle and premium.

---

# 8. Rest Timer

### Phase 1

Implement a reliable configurable timer.

### Phase 2

Add exercise-aware default rest periods.

### Phase 3

Consider adapting rest based on workout performance and reliable recovery signals.

Do NOT claim physiological recovery certainty from limited data.

---

# 9. RPE

RPE should not be a decorative field.

Use:

- Weight
- Reps
- Volume
- RPE
- Previous performance

to identify trends.

Example:

```text
Repeated high RPE
+
declining reps

→ conservative workload recommendation
```

Recommendations must explain the reasoning.

---

# 10. Exercise History & Progress

Exercise history should support:

- Best set
- Estimated 1RM
- Volume
- Reps
- Weight
- PRs
- Strength trend
- Consistency
- Muscle-group volume
- AI observations

Do not turn every metric into a separate card.

---

# 11. Muscle Coverage

Only use muscle coverage when it leads to an actionable insight.

Example:

```text
POSTERIOR CHAIN

31% below your 4-week average

Suggested next workout:
Romanian Deadlift
3 × 8
```

Avoid decorative heat maps that do not affect a decision.

---

# 12. GymFlow AI Layer

AI should answer:

> **What should I do next?**

AI insights should be grounded in real data.

### Examples

```text
You're 1 rep away from matching your best set.
```

```text
Bench volume is up 8% this week.
```

```text
Your recent sets have higher RPE than usual.
```

```text
Posterior-chain volume is below your recent baseline.
```

Recommendations should use identifiable inputs.

Never fabricate:

- Sleep data
- Recovery data
- Wearable data
- Training history
- Health metrics

If required data is unavailable, say so.

---

# 13. Recommended Member Home

Do not completely replace the current Member Home.

Reduce dashboard clutter.

Home should answer four questions:

1. How ready am I?
2. What should I do today?
3. What changed?
4. Is anything important?

Prioritize:

```text
Greeting

Readiness

Today's Workout
[ START WORKOUT ]

GymFlow AI
One useful insight

Progress
2–3 meaningful trends / PRs

Recovery
Only if real data exists
```

Avoid turning every item into a card.

---

# 14. Trainer ↔ Member Closed Loop

This is a major GymFlow differentiator.

Desired flow:

```text
TRAINER
   ↓
Creates/modifies workout
   ↓
MEMBER
Receives workout
   ↓
MEMBER
Logs weight / reps / RPE
   ↓
GYMFLOW
Analyzes performance
   ↓
TRAINER
Sees meaningful progress/exceptions
   ↓
GYMFLOW
Suggests adjustment
   ↓
TRAINER
Approves/modifies plan
   ↓
MEMBER
Receives updated workout
```

Important:

> AI assists the trainer. AI should not silently override trainer programming.

Trainer authority must remain explicit.

---

# 15. Visual Direction

Use the existing GymFlow design system.

Target:

- Premium
- Calm
- Professional
- Apple-like
- Dark
- Strong typography
- Strong spacing
- Clear hierarchy
- Restrained accent usage

Use the Strong interaction philosophy, not its visual identity.

### Color principle

Use mostly neutral surfaces.

Use the Member lime accent for:

- Primary CTA
- Completion state
- Selected state
- Important positive feedback
- PR highlights

Do NOT make every component lime.

---

# 16. Implementation Phases

## Phase 1 — P0

Build:

- Train screen
- Today's workout
- Exercise execution
- Set logging
- Weight/reps entry
- Previous-session performance
- Set completion
- Rest timer
- Workout completion

**Goal:** excellent core workout loop.

---

## Phase 2 — P1

Build:

- PR detection
- Exercise history
- Workout templates
- Supersets
- RPE
- Progress metrics

**Goal:** Strong-quality workout tracking.

---

## Phase 3 — P2

Build:

- Muscle coverage
- Strength analytics
- Volume analytics
- Consistency analytics
- AI insights
- Adaptive recommendations

**Goal:** GymFlow differentiation.

---

## Phase 4

Build:

- Trainer/member closed loop
- Trainer performance insights
- Trainer-approved workout adjustments

**Goal:** connected coaching ecosystem.

---

## Phase 5

Consider:

- Wearables
- Recovery integrations
- Advanced personalization

Only implement if justified by the existing product and data architecture.

---

# 17. Technical Rules for the Coding Agent

Before changing code:

1. Inspect the existing repository.
2. Inspect current Member screens.
3. Inspect existing workout APIs/types.
4. Inspect authentication/state management.
5. Inspect backend workout models/endpoints.
6. Inspect database schema/migrations.
7. Search for existing implementations before adding new ones.
8. Reuse existing components and APIs where possible.
9. Identify gaps before creating new architecture.

Do NOT rewrite unrelated screens.

Do NOT create duplicate workout APIs.

Do NOT replace working APIs with mocks.

Do NOT hard-code production member data.

Do NOT add dependencies without justification.

---

# 18. Phase 1 Acceptance Criteria

Phase 1 is complete only when:

- Member can open today's workout.
- Member can see exercises.
- Member can see previous performance when history exists.
- Member can enter weight.
- Member can enter reps.
- Member can mark a set complete.
- Member can add a set.
- Member can start/stop/use rest timer.
- Member can move between exercises.
- Member can finish workout.
- Data persists correctly.
- Loading state exists.
- Empty state exists.
- API error state exists.
- Offline state exists.
- Existing Member functionality still works.

---

# 19. Testing Requirements

Test at minimum:

### Workout

- Empty workout
- Normal workout
- Workout with multiple exercises
- Workout with previous history
- Workout without previous history
- Incomplete set
- Completed set
- Added set
- Workout completion

### PR

- New PR
- Non-PR
- Equal-to-best performance
- Multiple PR types

### Timer

- Start
- Pause
- Resume
- Reset
- Completion

### API

- Loading
- Success
- 401
- 4xx
- 5xx
- Timeout
- Offline

### Build

Run:

- TypeScript/typecheck
- Tests
- Relevant mobile build validation
- Backend tests
- Lint if configured

---

# 20. Antigravity Working Instructions

## IMPORTANT

Do not implement all phases in one pass.

Start with **Phase 1 only**.

First inspect the repository and report:

```text
Existing implementation
Reusable components
Existing workout APIs
Missing functionality
Files to modify
Files to add
Backend changes
Database changes
Risks
```

Then implement Phase 1.

After implementation:

```text
Run tests
Run typecheck
Validate the mobile build
Report changed files
Report API changes
Report migrations
Report known limitations
Give manual QA instructions
```

Only proceed to Phase 2 after Phase 1 is stable.

---

# 21. Copy/Paste Prompt for Antigravity

Use this exact prompt:

```text
Read:

docs/STRONG_INSPIRED_MEMBER_WORKOUT_PLAN.md

This is the product and UX specification for the GymFlow AI Member workout
experience.

Do NOT immediately start coding.

First inspect the existing GymFlow AI repository and understand:

- apps/mobile
- Expo Router structure
- Member screens
- Trainer screens
- workout APIs
- API client
- TypeScript types
- state management
- backend workout endpoints
- database workout models
- existing design system
- existing tests

Then report:

1. Existing workout implementation
2. Reusable components
3. Existing APIs/types
4. Missing functionality
5. Files you would modify
6. Files you would add
7. Backend/API changes required
8. Database changes required
9. Risks

Do not modify code during this inspection.

After the inspection, implement ONLY PHASE 1 from the specification.

Phase 1 includes:

- Train screen
- Today's workout
- Exercise execution
- Weight/reps/set logging
- Previous-session performance
- Set completion
- Add set
- Rest timer
- Exercise navigation
- Workout completion
- Loading/empty/error/offline states

Preserve the existing GymFlow architecture and functionality.

Do NOT:

- copy Strong's branding
- copy Strong's exact UI
- rewrite the whole app
- remove existing Member features
- create fake backend functionality
- hard-code production data
- create duplicate APIs
- add unnecessary dependencies
- implement Phase 2/3 yet

Use the existing GymFlow visual system:
premium, dark, calm, professional, Apple-like.

Member lime should be an accent, not the entire interface.

Optimize the workout flow for one-handed mobile use and minimal taps.

After implementation:

1. Run typecheck.
2. Run relevant tests.
3. Validate the mobile build.
4. Report changed files.
5. Report new/changed APIs.
6. Report database changes.
7. Report anything still mocked.
8. Report known limitations.
9. Provide manual QA steps.

Do not declare success merely because the screen renders.
The workout data flow must actually work end-to-end.
```

---



# 23. General Training → PT Conversion Flow (PHASE 1)

This flow is part of **Phase 1** and must be implemented together with the
core Member workout experience.

## Product Rule

Members who choose **General Training** should NOT see an explicit "45-day
plan" or countdown as the primary Member experience.

The Member should simply see and follow the weekly:

```text
PUSH
PULL
LEGS
```

training routine.

The 45-day period is an internal program lifecycle used by GymFlow to
determine when the Member becomes eligible for PT conversion.

### Member-facing principle

The Member experience should feel like:

```text
YOUR TRAINING

Push
Pull
Legs

This week's progress
Today's workout
Next workout
```

NOT:

```text
Day 1 of 45
Day 2 of 45
...
Day 45 of 45
```

The 45-day lifecycle should remain mostly behind the scenes.

---

## 24. General Training Lifecycle

The intended lifecycle is:

```text
MEMBER JOINS
     ↓
Selects General Training
     ↓
GymFlow assigns Push / Pull / Legs routine
     ↓
Member completes weekly workouts
     ↓
GymFlow tracks progress
     ↓
Approaching 45-day eligibility
     ↓
Trainer receives alert
     ↓
Trainer reviews Member
     ↓
Member completes / approaches General Training period
     ↓
Trainer converts Member to PT
     ↓
Member becomes eligible for 3-day PT trial
     ↓
Owner receives update
```

### Important

Do not expose the internal 45-day program structure unnecessarily to the
Member.

The Member should primarily experience the workout routine and progress.

---

# 25. Push / Pull / Legs Member Experience

For a General Training Member, the Member workout area should provide:

### Weekly overview

```text
THIS WEEK

PUSH       ✓
PULL       ✓
LEGS       ○
```

or, depending on the current schedule:

```text
TODAY

PUSH

Chest
Shoulders
Triceps

[ START WORKOUT ]
```

The exact exercise selection should come from the existing workout/program
data rather than being hard-coded into the UI.

### Requirements

- Show the current week's Push/Pull/Legs sessions.
- Clearly identify today's workout.
- Show completed/upcoming state.
- Allow the Member to enter the workout execution experience.
- Preserve previous-performance data.
- Preserve set logging.
- Preserve rest timer.
- Preserve workout completion.
- Do not display "45-day plan" as the Member's main navigation or workout
  structure.
- Do not hard-code exercises if the backend already provides workout data.

---

# 26. Trainer Alerts for General Training

Trainers need visibility before and at the point where a General Training
Member becomes ready for PT conversion.

The system should identify Members who are:

### Approaching eligibility

For example:

```text
PT CONVERSION APPROACHING

Member: John

General Training progress:
~40+ days

Review this Member before PT eligibility.
```

### Eligible / ready

```text
READY FOR PT REVIEW

Member: John

General Training completed / eligible

Suggested action:
Review for 3-day PT trial
```

The exact threshold and alert timing should be based on the existing backend
business rules if they already exist.

If no such rule exists, implement the 45-day eligibility rule explicitly and
make the alert timing configurable rather than scattering `45` throughout
the codebase.

---

# 27. Trainer Conversion Action

The Trainer should have an explicit conversion action.

Example:

```text
MEMBER

General Training
Eligible for PT

[ CONVERT TO PT ]
```

Before conversion, the Trainer should be able to review relevant information,
such as:

- Attendance
- Workout completion
- Recent workout performance
- Progress
- PRs
- RPE where available
- General Training status

The Trainer remains the decision-maker.

AI may provide supporting information, but must not silently convert a Member.

---

# 28. PT Conversion State

Once the Trainer converts the Member:

```text
General Training
        ↓
PT Trial
```

The system should create/update the appropriate Member training state using
the existing domain model if one exists.

The Member should then be presented with the PT onboarding/trial experience.

The requested initial PT experience is:

```text
3-DAY PT TRIAL
```

Do not create an entirely new PT architecture if the repository already has
PT package/session models and APIs. Reuse those existing capabilities.

---

# 29. Owner Notification

After Trainer conversion to PT, the Owner should receive an update.

Example:

```text
PT CONVERSION

John was converted from General Training
to PT by Trainer Sarah.

Next:
3-day PT trial
```

The Owner notification should be based on the existing Owner notification,
alert, activity, or dashboard architecture where possible.

Do not introduce a separate notification system if an existing one can be
extended.

The Owner should be able to see at least:

- Member
- Trainer
- Previous training mode
- New training mode
- Conversion timestamp
- PT trial status

---

# 30. State Model

Prefer an explicit lifecycle/state model over scattered boolean flags.

Conceptually:

```text
GENERAL_TRAINING
       ↓
PT_ELIGIBLE
       ↓
PT_TRIAL
       ↓
PT_ACTIVE
```

The exact names should follow existing GymFlow domain terminology.

If the existing backend already has equivalent states, extend/reuse them
rather than introducing duplicate concepts.

### Important

A Member being close to 45 days should NOT automatically mean they have been
converted to PT.

The state transition must be:

```text
Eligibility detected
        ↓
Trainer review
        ↓
Trainer explicitly converts
        ↓
PT trial created
        ↓
Owner notified
```

---

# 31. Phase 1 Acceptance Criteria — General Training / PT Flow

Phase 1 is complete only when:

### Member

- General Training Member sees Push/Pull/Legs.
- Member does not need to navigate a visible 45-day plan.
- Member can see this week's training progress.
- Member can identify today's workout.
- Member can execute the workout.
- Member can log sets/reps/weight.
- Member can complete the workout.
- Member's progress is persisted.

### Trainer

- Trainer can see General Training Members approaching PT eligibility.
- Trainer receives an alert/attention item before or at eligibility.
- Trainer can review relevant Member performance.
- Trainer can explicitly convert the Member to PT.
- Conversion cannot happen silently.

### PT

- Conversion creates the correct PT trial state.
- The initial PT experience is a 3-day PT trial.
- Existing PT/session functionality is reused where possible.

### Owner

- Owner receives an update after Trainer conversion.
- Owner can identify the Member and Trainer involved.
- Owner can see the conversion and PT-trial status.

### Data integrity

- No fake Member data.
- No fake conversion events.
- No UI-only state pretending that conversion happened.
- API/database state must reflect the actual transition.

---

# 32. Implementation Guidance for the Coding Agent

When implementing this flow, first inspect the repository for existing:

- General Training models
- Workout/program models
- Push/Pull/Legs definitions
- Member training status
- PT package/session models
- Trainer alerts
- Owner notifications
- Activity/audit events
- Member progress APIs
- Existing conversion logic

Do not create duplicate models if equivalent domain objects already exist.

Search before implementing.

The coding agent should specifically answer during inspection:

```text
1. Where is General Training currently represented?
2. Where are workout programs stored?
3. How are exercises assigned to Members?
4. Is Push/Pull/Legs already supported?
5. Is there already a 45-day eligibility rule?
6. How are Trainer alerts currently implemented?
7. How are Owner notifications currently implemented?
8. How is PT represented?
9. Is PT conversion already partially implemented?
10. What existing APIs can support this flow?
```

Only add missing backend/database functionality after confirming that the
existing architecture cannot support the requirement.

# 33. Final Principle

> **Make the next workout better, not merely the last workout better documented.**

Every feature should support at least one of:

- Easier logging
- Better understanding
- Better coaching decisions
- Better next action

---

# Implementation assessment — Phase 1 (pre-code inspection)

Recorded per the Phase 1 brief's Step 1. **No code changed for this section.**

## 1. What already exists

| Concept | Where | Usable as-is? |
| --- | --- | --- |
| General Training | `JourneyType.GENERAL_TRAINING` (`models.py:114`) | **Yes** — already the only journey type |
| 45-day period | `Journey.duration_days` default `45`, with `start_date` / `end_date` (`models.py:698-700`) | **Yes** — a real column, not a hard-coded literal. The milestone has a home |
| PPL splits | `WorkoutSplit` enum + `JourneyDay.split`, `WorkoutSession.split` | **Yes** |
| Per-day schedule | `JourneyDay` — `day_number`, `planned_on`, `split`, `status` | **Yes** |
| A workout session | `WorkoutSession` — `split`, `session_date`, `status`, `started_at`, `completed_at` | **Yes** |
| Exercises in a session | `WorkoutSessionItem` — `exercise`, `sets` (planned count), `reps` (string, e.g. `"10"`), `rest_seconds`, `status` | **Partly — see the gap below** |
| Plan templates | `WorkoutPlan` / `WorkoutPlanItem` | Yes |
| PT | `PTPackage`, `PTSession`, `Member.assigned_trainer_id` | Yes |
| Endpoints | `/journeys/me/workout/today`, `/journeys/me/workout/start`, `/journeys/members/{id}/plan` | Yes |
| Events / alerts | existing alert + audit infrastructure | Yes — reuse, do not rebuild |

## 2. The blocking gap: there is no per-set record

`WorkoutSessionItem` stores the **plan** for an exercise (`sets: 3`, `reps: "10"`) and one
`status` for the whole exercise. There is **no row per set**, and nowhere in the schema
records:

- **weight lifted** — the only two `weight_kg` columns in `models.py` (lines 773, 1183)
  belong to body composition / InBody, not to training
- **actual reps performed** (as opposed to the prescribed `reps` string)
- **RPE**
- **set number**, or per-set completion time

Consequences for the P0 brief, all of which depend on per-set data:

- weight / reps entry — **no destination**
- set completion — only whole-exercise completion exists
- previous-session performance (`60 kg × 8`) — **cannot be read**, because it was never written
- PR detection (heaviest weight, best reps, e1RM, session volume) — **no source data**
- grounded GymFlow AI insights ("bench volume up 8%") — **no source data**
- RPE trends in trainer review — **no source data**

This is not a UI problem. **The smallest production-safe solution is one new table**, e.g.
`workout_sets` — `session_item_id`, `set_number`, `weight_kg`, `reps`, `rpe` (nullable),
`completed_at` — plus create/update endpoints under the existing `/journeys` router and a
migration. Everything else in P0 is then reachable from real data.

Until that table exists, any "previous performance", PR or volume insight would be
fabricated, which the brief forbids.

## 3. What Phase 1 must therefore contain, in order

1. ~~`workout_sets` table + migration + endpoints + service + backend tests~~ *(prerequisite —
   **done**; see §6)*
2. Member workout execution UI reading and writing it
3. Member Home CTA into that flow
4. Milestone: derive from `Journey.start_date` + a single named constant
   `GENERAL_TRAINING_PT_REVIEW_DAYS = 45` (reusing `duration_days` where it already applies)
5. Trainer review surface + explicit PT-trial conversion
6. Owner event on conversion, via the existing alert/audit infrastructure

## 4. Decisions taken

- **The 45 is not re-declared.** `Journey.duration_days` already holds it per journey;
  the constant names the *review* rule for members whose journey predates it.
- **Members never see the 45-day framing.** `JourneyBar` currently renders "Day 12 of 45"
  on Member Home — that is internal business workflow and must be replaced with
  PPL/consistency framing for General Training members.
- **No fabricated sections.** AI Readiness, recovery, HRV, nutrition and calories have no
  model and are omitted entirely rather than shown as placeholders.

## 5. Risk

The prerequisite in §3.1 is a schema change, and the brief requires new business entities to
carry validation and tests. Sequencing set logging ahead of the UI is what keeps the rest of
Phase 1 from resting on invented data.

## 6. Phase 1 step 1 — delivered

The prerequisite in §3.1 is implemented. Nothing else in this document has been built.

`workout_sets` stores one row per performed set — `session_item_id`, `set_number`,
`weight_kg`, `reps`, `rpe` (nullable), `completed_at`, timestamps — under
`workout_session_items`, with `(session_item_id, set_number)` unique and a cascading
delete from the exercise. Migration `7c4b1e9a2f30`.

Four endpoints on the existing `/journeys` router, nested under the workout path already
used by `PATCH /workouts/{id}/items/{item_id}`:

    GET    /journeys/workouts/{session_id}/items/{item_id}/sets
    POST   /journeys/workouts/{session_id}/items/{item_id}/sets
    PATCH  /journeys/workouts/{session_id}/items/{item_id}/sets/{set_id}
    DELETE /journeys/workouts/{session_id}/items/{item_id}/sets/{set_id}

Authorization reuses `assert_can_read_member`, exactly as workout-item completion does:
the member logs their own sets, a trainer at the same branch may correct them, everyone
else is refused by branch scope. Writes stop once the workout is completed; reads do not.

What this unblocks, now from real data rather than invented: previous-session performance,
PR detection, session volume, RPE trends and any AI insight derived from them. None of
those are built — they are the next steps, in the order §3 sets out.

## 7. Phase 1 step 2–3 — delivered

Set logging (§3.2) and the performance layer on top of it are implemented. Everything
below is derived from `workout_sets` on read; nothing is stored, nothing is cached, and
no figure exists that cannot be recomputed from the rows the member logged.

**Previous performance** is listed set by set — `60 kg × 8` on its own line — because it is
glanced at between sets. **Exercise history** is a sheet: the last eight sessions with
volume, top weight, total reps and average RPE, plus the member's heaviest set and best
session for that lift.

**Personal records** (`app/domain/records.py`) cover heaviest weight, most reps at a weight,
and best session volume. Every kind requires something to have been beaten — a first-ever
set records nothing, and neither does the first set at a new weight. Bodyweight sets never
set a weight record. Records ride back on the `POST` that earned them, so the app cannot
show a PR for a set the server did not store.

**Estimated 1RM is deliberately absent.** Every e1RM formula is a model fitted to someone
else's lifters, and presenting its output beside a weight the member actually lifted would
present an estimate as a measurement. §7 lists it as *possible*; it is the one item there
that cannot be derived honestly from what GymFlow knows.

**RPE** is displayed per set and averaged per session (null, never 0, when nobody recorded
one). The trend analysis in §9 is not built — it needs more history than any member has.

Still unbuilt, in the order §3 sets out: the milestone constant, the trainer review surface,
and the PT-trial conversion. Readiness, recovery, HRV and nutrition remain without models
and are omitted rather than approximated.
