# GymFlow AI — Design Brief

Living document. Maintained by the `/gymflow-uiux` skill
(`.claude/skills/gymflow-uiux/`). Extend it — a bullet, not an essay — whenever
UI work needs it to say something new. Seeded 2026-09-02 from the codebase as it
stands.

---

## Product

Gym-operations software for **SLAM Fitness Studio** (Nagalkeni, Boganhalli,
Alandur). Two things carry the product: **trainer accountability** (who is on
the floor, on time, checked out) and the **45-day member journey** (assessment
→ PPL rotation → Day-45 auto-completion). PT packages, group classes, payments,
acquisition/marketing and an alert centre hang off those two. It is *not* a
replacement for Yoactiv and ships with every integration off.

## Audience

SLAM staff and members, Chennai/Bengaluru, on **mid-range Android** (Pixel 6a
class), portrait only. Context of use:

- **Trainer** — on the gym floor, standing, often one-handed, mid-set, noisy.
  Needs the one action big and fast, and the server's verdict shown plainly.
- **Owner** — 20 seconds between meetings. Needs the accountability numbers and
  "what needs attention" without hunting.
- **Member** — before/after a session. Needs to know which journey day they're
  on and today's split; wants calm, not gamification.

## User roles

One Expo binary, role-switched. Each role has a theme-invariant accent
(`roleAccent` in `src/design/tokens.ts`).

| Role | Tabs | Accent |
| --- | --- | --- |
| Owner / branch_manager / super_admin | Dashboard · Trainers · Incentives · Marketing · Profile | violet `#7C6EF5` |
| Trainer | Shift · Attendance · Sessions · Profile | gold `#D4A44C` |
| Member | Home · Workout · PT · Progress · Profile | lime `#B4E052` |
| Auth (pre-role) | — | gold `#C9A84C` |

## Primary UX goals

1. A trainer completes check-in / check-out in **one deliberate tap** and sees
   the **server's** on-time/late/absent verdict.
2. An owner reads the six accountability numbers **and** the "needs attention"
   list at a glance, no hunting.
3. A member always knows **which journey day** they are on and **today's split**.
4. Every screen degrades honestly — empty, offline, partial, error, permission
   states are all designed, not just the happy path.

## Brand personality

Serious, precise, physical, unshowy. Trust and speed over delight. Feels like
software built *for gyms* by people who understand a shift — not a fitness
consumer app, not a generic dashboard.

## Visual direction

Editorial restraint on a **dark, warm-neutral** ground (with a full light
theme). Fraunces gives headlines a voice; Inter runs the machine; DM Mono makes
the numbers a product. **Elevation by lightness**, one translucent **hairline**,
one **accent per role** used only where it means "act on this" or "selected".

## Typography

- **Fraunces** — `display` (44/48/−1.5), `title` (27/33/−0.7). Headlines and
  brand moments **only**; never a label or a button.
- **Inter** — `heading` (17 SemiBold), `body` (15), `label` (13), `caption`
  (11, all-caps eyebrow). Everything operated.
- **DM Mono** — `mono` (14), `metric` (32/36/−1). Figures that align, times,
  measurements.
- Weight is in the family name (`Inter_600SemiBold`), never `fontWeight`.
- Line heights are in the scale; spread the role, don't restyle it.

## Colour strategy

Per-role accent + **muted** status hues (positive/caution/critical/warning/
notable/info/neutral, bound to labels via `statusMeta` / `incentiveMeta`) +
neutral ground. Status is always **label + colour**, never colour alone. No
gradients as decoration. No second accent.

## Spacing & density

4pt rhythm (`space` 2·4·8·12·16·24·32·48). Radius 8·12·16·24·pill.

- **Trainer** surfaces: **low** density, large targets (gym floor). Hero
  control 128dp, bottom-anchored.
- **Owner** surfaces: **higher** density (scanning many branches/trainers), one
  focal point per view.
- **Member** surfaces: **medium**, calm.

`HIT_TARGET = 48` minimum everywhere.

## Component language

Flat surfaces separated by lightness + one hairline; corners 12–16; the primary
action is a single filled accent `Button` per view; cards are containers, not
decoration. All shared UI lives in `src/design` (tokens → primitives → controls
→ cards → feedback → motion → overlay → navigation → brand).

## Iconography

`@expo/vector-icons` (Ionicons), outline weight, for wayfinding and status —
not ornament. A word or a number beats an icon when there's room.

## Motion language

`references/motion-principles.md`. One critically-damped press spring (no
overshoot), short staggered entrances, **meters travel / numbers don't count
up**, nothing blocks a tap, durations ≤320ms, reduced-motion respected.

- 2026-09-03 — **Reduced motion is now wired.** `useReducedMotion()` /
  `reduceMotionActive()` in `src/design/motion.tsx` read
  `AccessibilityInfo.isReduceMotionEnabled()` and subscribe to
  `reduceMotionChanged`; `usePressMotion`, `entrance`, `useTravel` and
  `usePulse` all route through it (no scale / no slide / no stagger / no pulse;
  meters snap). New motion must not check the OS setting ad hoc — use the hook.
- 2026-09-03 — **`SuccessCheck`** (`feedback.tsx`): the one "clean outcome"
  mark — a circle that closes and a tick that draws, once, ≤`slow`+140ms,
  reduced-motion draws it complete. For a *flagged* outcome (late check-in,
  early exit) use a static Ionicon in the status colour, not this — the
  animated draw must never read as "well done" over a flag.
- 2026-09-03 — **`Countdown`** (`controls.tsx`): a ring that empties as a
  timer runs down (the arc travels; the centre clock is the real value and
  just updates). Turns positive at zero — the rest is over, not failed.
- 2026-09-03 — **`haptics`** (`src/design/haptics.ts`): the one place the app
  buzzes. `impact` for a discrete choice (a set logged), `notify` for a
  server-confirmed outcome (check-in verdict, PR, rest over), `selection` for
  a stepper. Fire-and-forget, never throws. Used at those five moments and
  nowhere else.
- 2026-09-03 (batch 2) — **`Staggered`** (`motion.tsx`): a screen's column of
  sections arriving once, top to bottom, on mount. Wrap the body's static
  sections; a section that is itself a list with its own row `index` stagger
  stays *outside* it (motion on motion otherwise). Instant header/greeting
  sits above the wrapper.
- 2026-09-03 (batch 2) — **`slide(direction)`** (`motion.tsx`): a step in a
  guided sequence entering from the direction of travel (forward from the
  right, back from the left). For wizards only; keep the stepped content keyed
  by step index. Reduced motion → short fade, no travel.
- 2026-09-03 (batch 2) — **Charts draw themselves.** `BarChart` bars grow up
  from the axis (`scaleY` from a bottom origin) into their real static height
  — the chart reads out on arrival and re-draws on data change. The value is
  never animated, only the reveal. Reduced motion snaps to full height.
- 2026-09-03 (batch 3) — **`JourneyCompleteCard`** (`components/member.tsx`):
  the one member milestone that earns a moment — finishing the 45-day journey.
  A `SuccessCheck` in the member accent draws once, the workout count is a
  plain figure (not counted up), the completion bar travels to full. No
  confetti, nothing to dismiss. The `SuccessCheck` is the entrance — the card
  does not also slide, so it sits inside a `Staggered` body cleanly. Used on
  Home and Workout so "complete" reads the same on both.
- 2026-09-03 (batch 3) — **Owner detail screens follow the member/trainer
  hierarchy.** `owner/branch/[id]` and `owner/trainer/[id]` use
  `ScreenHeader` + `Section` + `ProgressCard`/`StatRow` (the member-360
  pattern), not a wall of equal tiles; the meters travel. `owner/incentives`
  leads with the action state ("N of M eligible", review count called out) and
  each row states the failing checks, not a stat grid. Incentive checks are
  Pass / Near / Fail badges everywhere now — never `✓ / ~ / ✕` glyphs.

## Accessibility principles

`references/accessibility.md`. Contrast (≥4.5:1 body) and target size (≥48dp)
are non-negotiable; status never colour-only; every actionable has a role/label;
decorative imagery hidden from the a11y tree; reduced motion honoured.

## Mobile principles

`references/mobile-ux.md` + `references/live-device-loop.md`. Safe areas via
`Screen`; keyboard never hides the input or the submit; primary action in the
thumb zone; long lists virtualized. **UI is developed side-by-side with the
physical Pixel 6a** (Expo dev server → Fast Refresh → `adb` screenshot); the
device is the visual authority (`DEVICE > WEB PREVIEW`). EAS/dev builds only for
native changes (Level 3).

## Design anti-patterns

`references/anti-patterns.md`. In short: not a crypto/analytics dashboard, not a
developer tool, not a generic SaaS admin template, not a gamified consumer
fitness app — **and** no forced gym clichés (dumbbell bullets, "BEAST MODE",
flames). "Never satisfied" means clearer, not more.
