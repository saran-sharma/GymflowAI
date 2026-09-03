# GymFlow AI — Design Decisions

Notable design decisions, the alternatives considered, and why the alternative
lost. Maintained by `/gymflow-uiux`. Append newest at the top. Skip trivial
changes.

**Format**

```
## YYYY-MM-DD — <decision, one line>
Context   — what problem / screen / constraint
Chosen    — what we did
Rejected  — alternative(s) + the concrete reason each failed (often its
            "where it fails" from the direction exploration)
Trade-off — what we knowingly gave up
Evidence  — screenshots / score / who reviewed
```

---

## 2026-09-03 — Batch 3: the four legacy detail screens, redesigned not migrated

### `owner/incentives` leads with "who needs a decision", not a stat grid
Context — the screen was three equal tally tiles plus a per-trainer card with
an opaque `score` meter and a four-across mini-stat row. Nothing said what to
act on.
Chosen — sort review-first; a triage `StatRow` ("N/M eligible", the review
count toned caution) plus a caution `Banner` when any trainer needs a decision;
each row = verdict badge + a `score` bar toned by status + a one-line summary
of the *failing* checks.
Rejected — keeping the four-stat row: it showed the same four numbers for
every trainer whether or not they mattered.

### `owner/branch/[id]` and `owner/trainer/[id]` take the member-360 shape
Context — both used `BackLink` + a wall of 3–5 `StatTile`s + legacy `Meter`
cards + `✓/~/✕` incentive glyphs.
Chosen — `ScreenHeader` (title, subtitle, a trailing status badge on the
trainer), then `Section`s: a `ProgressCard` for the one proportion
(punctuality / occupancy), a `StatRow` for the accountability trio, incentive
checks as Pass/Near/Fail badges, a staggered history with travelling bars.
Same components and order as `owner/member/[id]`.
Rejected — a `HeroCard` at the top: the member-360 uses `ScreenHeader` +
`Section`, and a detail screen that is pushed already has a header's job to do.

### `trainer/pt/[id]` is the trainer's version of the member exercise screen
Context — legacy `components/ui`, `initials()` avatars, ALL-CAPS "CHECK IN" /
"COMPLETE SESSION", direct `Haptics`, no confirmation motion.
Chosen — design-system `Avatar`, `haptics` primitive, normal-case buttons, and
a `SuccessCheck` per side the instant an arrival is recorded (keyed so it
draws once) plus the positive verdict on completion. The split stays — it is
the point.
Rejected — collapsing the split into one list: "both present → complete" is
the gate, and it only reads if the two sides are shown apart.

### The Day-45 milestone is a `SuccessCheck` + a travelling bar, nothing more
Context — "General Training complete" was a plain `Card` with one line of copy,
duplicated inline on Home and Workout.
Chosen — a shared `JourneyCompleteCard`: member-accent `SuccessCheck` (draws
once), the workout count as a plain figure, the completion bar travelling to
full, an accent hairline border. It does not self-slide (the check is the
entrance) so it composes inside `Staggered`. A paused journey stays a plain
card — "on hold" is not a moment.
Rejected — confetti / a full-screen takeover: the motion rules allow milestone
delight "once, briefly, skippable", not a celebration to dismiss.

---

## 2026-09-03 — Batch 2: the foundation applied to the high-traffic screens

### `Staggered` staggers sections, not every row
Context — Member Home, Owner Dashboard, Trainer Desk, Member Progress all
appeared whole; they wanted the "screen arriving" entrance Batch 1 gave the
shift verdict.
Chosen — one `Staggered` primitive wrapping a screen's column of sections.
A section that is itself a list with per-row `index` stagger (Owner Attention,
Trainer "Today's sessions") is rendered *outside* `Staggered` so only one
animation scope applies to it.
Rejected — per-row `entrance` on every list inside a staggered body: the block
fade and the row fades both fire on mount and read as churn. Rejected — a
smarter `Staggered` that detects and skips already-animated children: fiddly,
and the explicit split is easier to read.
Trade-off — two `Staggered` blocks per screen where a list sits in the middle,
with a `from` offset to keep the delay count continuous.

### The megaphone / attention rows / week strip / today CTA get the shared press spring
Context — these were inline `Pressable`s with an ad-hoc `pressed` opacity or
surface swap, so they felt different from every design-system `Button`.
Chosen — routed through `usePressMotion` (scale spring + opacity step), same as
`Tappable`. Reduced motion drops the scale.
Rejected — leaving them: the point of Batch 2 is that a trainer or owner can't
tell which screen was built when.

### Directional step motion on onboarding, not a fade
Context — the fitness-journey questionnaire is a guided 1→2→3 sequence; a plain
fade between steps loses the sense of moving through it.
Chosen — `slide('forward'|'back')`: the incoming step enters from the edge you
moved toward; the progress bar (already `useTravel`) carries the continuity.
Rejected — `FadeInDown`/`Up` for forward/back: vertical motion doesn't map to
"next / previous". Reduced motion → the short fade is the right fallback.

### `SlideInLeft`/`SlideInRight` added to the reanimated jest mock
Context — the mock only listed `FadeIn*`; `slide()` uses the horizontal
entrances, which came back `undefined` under test.
Chosen — add them (and the `SlideOut*` pair) to `jest.setup.js` as inert
descriptors — the mock should cover what the app actually imports.

### The DM Mono slashed zero is the typeface, not a bug — left as is
Context — flagged as a "quirk": the big figure on stat tiles / hero metrics
renders `0` with a diagonal slash.
Finding — it is DM Mono's designed default zero (a legibility convention for
data type). Not a rendering fault and not a config: React Native cannot toggle
an OpenType stylistic set (`fontVariant` has no such value on Android), and DM
Mono's Google build ships no un-slashed alternate.
Chosen — keep it. It is consistent everywhere a figure is mono, and a slashed
zero in a data face is conventional. A plain zero would mean swapping the
numeral typeface app-wide — a real design decision, not a fix, and one for the
team to make deliberately if they want it.

---

## 2026-09-03 — Batch 1: motion foundation + the trainer's neglected core

### Reduced motion wired through the existing primitives, not per screen
Context — `AccessibilityInfo.isReduceMotionEnabled` appeared nowhere; the skill
names this the blocking prerequisite for any new motion.
Chosen — `useReducedMotion()` hook + `reduceMotionActive()` module flag in
`motion.tsx` (a flag as well as a hook because `entrance()` is a plain
function called inside `.map()` with no React context). `usePressMotion` /
`entrance` / `useTravel` / `usePulse` all consult it.
Rejected — a per-screen `AccessibilityInfo` check: four screens would drift on
what "reduced" means, and new screens would forget it.
Trade-off — one subscription lives for the app's lifetime.

### Trainer Scan and Shift moved onto `src/design`; verdict + scan get a moment
Context — the two most-used trainer screens were still on the legacy
`components/ui` + `src/theme`, so the trainer's core looked like an older app.
Scan also `setState`d on every rejected camera frame, had no torch, no scan
animation and no success state; Shift showed a shouty `✓ CHECKED IN` all-caps
verdict and entered its PIN in a centred `Modal`.
Chosen — both on the design system. Scan: throttled frame handling (no
`setState` on an ignored frame), an animated corner reticle + sweep (UI thread,
reduced-motion static), torch, and all states (permission / denied / scanning /
invalid / success / camera-error / PIN fallback). Shift: `SuccessCheck` +
plain-case "Checked in" / "Shift complete" verdict that settles in via
`entrance(0)`, PIN entry as the design-system `Sheet`.
Rejected — keeping the legacy components "since they work": they were the
single biggest source of whole-app inconsistency, and the scan frame loop was
the exact jank the motion layer exists to prevent.
Trade-off — the scan camera is still under the tab bar (a `_layout`-level
change deferred); text over a live camera needs a scrim chip, which scan now
carries.

### The animated success mark is reserved for a clean outcome
Context — a late / early-exit check-in is still "recorded", but a drawing
green tick over it reads as congratulation.
Chosen — `SuccessCheck` (animated draw) only for `on_time` / `completed`; every
other verdict gets a static `checkmark-circle-outline` in the status colour.
Rejected — one mark for all verdicts, colour-only to tell them apart: fails
"status is never colour alone" and mis-signals.

### Rest timer: a ring that travels, not a bigger number
Context — `RestBar` was a bare mono clock; the textbook `useTravel` case was
missing.
Chosen — `Countdown` ring depletes as the rest runs; the centre clock is the
real value and updates without counting. `haptics.notify('success')` once at
zero (hands are on a bar, not the screen). Set logged → `haptics.impact`; a
PR → `haptics.notify` (the one moment on that screen that earns the stronger
pattern — the quiet `RecordNote` visual is unchanged, no confetti).
Rejected — animating the digits; a celebratory sound/'+1' on every set.

---

## 2026-09-02 — Decisions already embodied in the codebase (seed)

Recorded so future work doesn't relitigate them. Sources: `src/design/tokens.ts`,
`src/design/motion.tsx`, `src/theme/index.ts`.

### Per-role accent, not a single brand colour
Context — one binary serves Owner, Trainer, Member; the app must be
recognisable per role.
Chosen — Member lime `#B4E052`, Owner violet `#7C6EF5`, Trainer gold `#D4A44C`,
Auth gold `#C9A84C`; theme-invariant.
Rejected — the earlier "one premium red `#EF2B3C`" (still in the stale README):
a single accent gave no per-role identity and collided with "red = act on
this". A per-theme accent: an identity that changes with the ground stops being
an identity.
Trade-off — four accents to keep legible on both themes; status hues must stay
muted so they never compete.

### Elevation is surface lightness, not shadow
Chosen — levels 0–2 carry no shadow (dark); `level3` shadow only for things
that truly float (modal, `Sheet`, tab bar).
Rejected — drop shadows on cards: near-invisible on a near-black ground; on
light, shadows-under-everything removes any elevation meaning.

### One border in the whole design
Chosen — a single translucent white/ink hairline (`ink5`).
Rejected — solid grey borders: on `#0A0A0A` every 1px line reads as a scratch.

### Fraunces for headlines, Inter for the machine, DM Mono for figures
Rejected — Inter everywhere: the product never gets a voice, and columns of
numbers don't align. Fraunces in UI labels/buttons: a control is read, not
admired.

### No count-up animation on numbers
Context — the reference designs animate a figure 0→N.
Chosen — meters/bars/rings travel (`useTravel`, native); numbers snap.
Rejected — animating `Text` 0→N: one `setState`/frame/figure → ~180 renders/s
on a 3-stat dashboard, the exact jank the motion layer exists to prevent.
Driving a disabled `TextInput` via `animatedProps`: stays on the UI thread but
swaps `Text`→`TextInput` and loses the typography and a11y role of every number.

### One critically-damped press spring, no overshoot
Rejected — a springy/bouncy press: reads as a toy on software someone uses
forty times a shift.

---

_(add real decisions above this line as UI work happens)_
