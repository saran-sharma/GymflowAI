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

# 22. Final Principle

> **Make the next workout better, not merely the last workout better documented.**

Every feature should support at least one of:

- Easier logging
- Better understanding
- Better coaching decisions
- Better next action
