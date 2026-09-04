# GymFlow AI — Visual QA Log

One entry per `/gymflow-uiux` review that reaches a ship decision. Newest at the
top. Skip trivial UI changes.

**Format**

```
## YYYY-MM-DD — <screen / component> — <ship | iterate>

Direction     — the chosen direction (1 line); link DESIGN-DECISIONS.md if new
Level         — L1 fast-UI / L2 interaction / L3 native
Rendered on   — Pixel 6a (Fast Refresh)   [+ Expo web @<width> for L1 feedback only]
States shot   — initial, loading, loaded, empty, error, offline, permission-denied,
                success, partial, long-content, font_scale 1.3, …  (list what you captured)
Device evidence — adb screenshots: /tmp/gf-<screen>-<state>.png ;
                  screen recording (L2 motion/gesture): /tmp/gf-<screen>.mp4
Interaction   — what you drove on the device (nav / gesture / form / keyboard / scroll / sheet)
Animation     — tested on device? smoothness / dropped frames / interruption / reduced-motion

Findings (self-critique, ≥3 real):
  1. …
  2. …
  3. …

Adversarial findings (by persona):
  - trainer mid-shift: …
  - screen reader: …
  - slow network: …
  - small phone + font scale: …

Fixes applied:
  - …

Before / after:
  - improved: …
  - regressed: … (fixed | justified: …)

Score:  UX 0/20 · Hierarchy 0/15 · Brand 0/15 · Type 0/10 · Layout 0/10 ·
        Interaction 0/10 · Motion 0/10 · A11y 0/5 · Responsive 0/5  →  TOTAL 0/100

Stop-conditions: [ ] all ticked   (list any not ticked and why → iterate)
```

---

## 2026-09-04 — Intelligence QA + validation pass (no device) — partial

Direction     — no visual redesign; validation/hardening of the shipped intelligence layer
Level         — L1 (code + API), not L2/L3
Rendered on   — **not rendered.** The physical Pixel 6a was not connected this
                session (`adb devices` empty across kill-server/start-server, USB
                rescan, `-e`); no emulator installed. Member/Trainer/Owner device
                walkthroughs, font-scale 1.3, reduced-motion and cold-launch
                checks from the mission's Phases 6/7/8/14/17 are **not done** and
                remain the open item.
API evidence  — live backend (`localhost:8000`, seeded `gymflow_main_dev`):
                intelligence `/me`, `/ask` (member/trainer/owner), authorization
                matrix, adversarial Ask prompts — all via curl, logged in-session.

What was verified without a device:
  - **Ask GymFlow adversarial** — "what was my bench press last year" → honest
    `unrecognised`, no invented history. "tell me my friend's progress" and
    `member_id` spoofing → answers only about the caller's own data. "ignore your
    instructions…" → `unrecognised` (there is no LLM in the Ask path, so prompt
    injection is structurally impossible). Trainer "what does this member pay" /
    "revenue" and owner "give me revenue" → `unrecognised`, no financial field.
  - **Authorization matrix** — member→other-member intelligence 403 (ids 2–8);
    member→trainer/owner endpoints 403; member→own `/brief` 403 (staff view);
    trainer→owner brief 403; owner→`nudges/sweep` 403; trainer brief 200 for
    same-branch members, 403 for other-branch; no/garbage token 401.
  - **Signal boundaries** — 6 new frozen-clock tests: consistency "steady" band
    and its bounds, tie-is-not-a-PR, escalating-set-is-a-PR, ±12% inclusive,
    zero previous volume → insufficient (not "improving"), one day short of the
    plateau span → not yet a plateau. All pass — no boundary defect found.
  - **LLM failure chaos** — the existing 21 narrator tests plus 2 new ones (403,
    unreachable host) cover timeout / 401 / 403 / malformed JSON / non-string
    headline / oversized headline / markup / links / empty content / provider
    exception; every path degrades to the deterministic template. A real
    end-to-end run over a live local socket confirmed the wire shape: key only
    in the `Authorization` header, unlisted context keys stripped, `json_object`
    response format, key absent from logs. No hosted-model call was made — the
    ambient `OPENAI_API_KEY` is unrelated tooling config, GymFlow itself is
    `INTELLIGENCE_NARRATOR=template`.
  - **Performance** — cold query counts on the seeded DB: member intelligence 36,
    owner daily brief 14, owner weekly 8, trainer attention queue 285 for a
    nine-client trainer (warm cache: 1). Cut the queue from ~400 by computing
    `recent_records` once per member instead of twice.

Bugs found and fixed (committed):
  1. `_member_next_weight` deep link pointed at `/(member)/progress-exercise`
     with no `?exercise=` — the screen needs it and renders "Could not load
     this exercise" without one. Now encodes the lift.
  2. `member_signals` scanned `recent_records` twice (directly + inside
     `plateau`). Threaded the computed signal through. (perf, not user-visible)

Considered, not changed:
  - Owner "N members have gone quiet" counts a brand-new zero-activity member as
    "quiet". The copy is literally accurate ("no workout, PT or visit in 14
    days") and excluding just-registered members risks masking failed
    onboarding. Left as-is deliberately.

Local hygiene (not a repo change): `gymflow_main_dev` was one migration behind
(`c8f2a1d0b7e3`, additive `users` columns); ran `alembic upgrade head` so the
dev server and query-count probes matched the branch schema.

Stop-conditions: [ ] device render — blocked, not connected. Everything not
requiring a device is done.

---

## 2026-09-03 — Batch 1: motion foundation · Trainer Scan · Trainer Shift · Rest timer · Auth role-select — ship (with follow-ups)

Direction     — "GymFlow Next" = the existing brief executed everywhere, not a reskin: finish
                the design-system consolidation, complete the motion layer, spend motion only at
                the moments the app currently leaves silent. (DESIGN-DECISIONS.md 2026-09-03.)
Level         — L1 (role-select, tokens) + L2 (scanner camera/animation, shift verdict/sheet,
                rest-timer ring). No native change → no build.
Rendered on   — Pixel 6a (33181JEGR09774), Fast Refresh, portrait, its own width; second pass at
                `font_scale 1.3`; reduced motion toggled via `animator_duration_scale 0`.
Device evidence — adb screenshots in the session scratchpad: role-select before/after;
                scan (permission · live scanning + reticle/sweep · invalid-code · caption-scrim fix);
                shift (baseline · migrated hero · PIN Sheet · check-in verdict + SuccessCheck ·
                error banner · checkout verdict, flagged mark); rest timer (full ring · depleted arc ·
                "REST OVER" green terminal) at normal + reduced motion; ErrorState @ 1.3.
                Recordings: gf-verdict.mp4, gf-verdict2.mp4.
Interaction   — real check-in / check-out via PIN against the live backend (trainer Meera Shetty,
                open shift); real set logging across two exercises (member Suresh Kumar) driving the
                rest ring start → deplete → zero; nav via deep links + `adb input`.
Animation     — on device: reticle sweep holds frame rate; verdict `SuccessCheck` draws (circle then
                tick) and re-animates on the check-in→complete transition (keyed); Countdown ring
                travels smoothly as the timer runs down and turns positive at zero. Reduced motion:
                app renders correctly, ring snaps instead of sweeping, no scale/slide.

Findings (self-critique, real):
  1. Scan caption ("Point at the branch code" + sub-line) was `textSecondary` grey over a live
     camera — invisible on a bright background. → fixed: dark rounded scrim chip + text shadow.
  2. The animated `SuccessCheck` over a *late* verdict read as congratulation. → fixed: animated
     draw only for `on_time`/`completed`; static outline mark for flagged verdicts.
  3. On the check-in→complete transition the `SuccessCheck` did not redraw (same node, `entering`
     fires on mount only). → fixed: `key={complete ? 'complete' : 'in'}`.
  4. PIN Sheet subtitle "The time is taken from the server, not your phone." truncated at one line.
     → shortened to "Server time, not your phone".
  5. Scan camera still renders under the trainer tab bar (pre-existing; a `_layout`-level
     `tabBarStyle` change deferred to Batch 2).

Adversarial findings (by persona):
  - trainer mid-shift: verdict is now readable at a glance (plain case, one status line, mono
    figures) rather than a shouty all-caps block; PIN keypad is in the thumb zone.
  - screen reader: `SuccessCheck` / `Countdown` carry `accessibilityRole` + label; verdict rows
    are label + mono value; reticle is decorative.
  - slow network: shift error path shown on device — `Banner tone="critical"` keeps the sheet open
    and the PIN preserved; "already closed" server refusal renders as designed.
  - reduced motion: actually toggled — meters snap, no press scale, entrances are plain fades.
  - small phone + font scale: `ErrorState` at `font_scale 1.3` — no clipping, safe areas hold.

Fixes applied: items 1–4 above, on device, re-rendered.

Before / after:
  - improved: trainer Scan and Shift now read as one system with the rest of the app; the check-in
    verdict is a designed moment instead of a silent state change; rest has a visual "draining"
    quality; role-select lost its emoji-as-UI / centred-everything / three-identical-buttons tells.
  - regressed: none observed vs the baseline device screenshots. Scan-under-tab-bar is unchanged
    from the legacy screen (not a regression; tracked as a follow-up).

Score:  UX 18/20 · Hierarchy 13/15 · Brand 14/15 · Type 9/10 · Layout 9/10 ·
        Interaction 9/10 · Motion 9/10 · A11y 5/5 · Responsive 5/5  →  TOTAL 91/100

Stop-conditions: all ticked except — scanner *success* animation confirmed only via the shared
`SuccessCheck` on the shift verdict (no physical way to put a live `GFQ1.` QR in front of the
device this session); camera-error state reasoned, not forced. Both carried to Batch 2.

---

## 2026-09-03 — Batch 2: Member Home · Owner Dashboard · Trainer Desk · Member Progress · Onboarding · legacy migration (Attendance, Trainers) — ship

> Device pass completed after the first write-up: every screen below was rendered on the Pixel 6a
> once it was unlocked. Member Home ×2 (rahul, ayesha), Member Progress + the BarChart draw
> (`gf-prog.mp4`), Owner Dashboard with the Attention rows populated and staggered
> (`gf-own-stag.mp4`), Owner Trainers, Trainer Desk, Trainer Attendance, Onboarding step
> transitions (`gf-onb-slide.mp4`). Reduced motion (`animator_duration_scale 0`) and
> `font_scale 1.3` spot-checked on Trainer Desk / Attendance and Onboarding — no clipping, no
> broken layout, meters snap. One non-issue seen: Owner Dashboard's Attention/insights endpoints
> are slow on a cold session, so the section holds its `SkeletonCard` for ~15s before the rows
> populate — the skeleton is the correct state and unrelated to the Batch-2 changes.
> Still open: scanner real-camera success (no live GFQ1 QR available).


Direction     — the Batch-1 foundation applied to the high-traffic screens; preserve what is
                strong, add only motion that carries state/continuity/hierarchy.
Level         — L1 (tokens, `Staggered`, `slide`) + L2 (chart draw, step transitions, press).
                No native change → no build. Pre-Batch-2: scanner tab bar (route/layout fix,
                not a visual workaround); DM Mono `0` investigated (typeface, not a bug — kept).
Rendered on   — Pixel 6a (33181JEGR09774). **Member Home + the scanner tab-bar fix were
                validated on device** (screenshots + a mount recording, press, `font_scale 1.3`).
                The device then auto-locked behind a fingerprint; `adb input` cannot pass a
                biometric or surface the PIN pad, so **Owner Dashboard, Trainer Desk, Member
                Progress, Onboarding, Trainer Attendance and Owner Trainers were not device-
                rendered this batch** — they are typecheck + full-suite (544) green and
                code-reviewed against primitives already device-proven in Batch 1 / P1.
Device evidence — gf-b2-home-after.png, gf-home-stagger.mp4, gf-home-fs13.png (Member Home);
                gf-b2-scan-tabfix.png (full-screen scanner, no tab bar).

Findings (self-critique, real):
  1. `Staggered` wrapping a section that is itself a per-row-staggered list double-animates.
     → resolved: those sections (Owner Attention, Trainer "Today's sessions") render outside
     `Staggered`; a second block with `from` offset continues the delay count.
  2. Stale Metro transform errors kept replaying on HMR after an intermediate save, leaving a
     dark screen. → `expo start --clear` + relaunch; no code fault (babel-preset-expo parses
     all touched files clean).
  3. `MetricTile` `index` inside a `Staggered` row would compound-animate. → removed; the row
     is one staggered unit.
  4. Chart bar animation: `useAnimatedStyle` returning a `%` height would read `"0%"` in the
     jest mock (worklet runs once, pre-effect). → animate `scaleY` from a bottom origin over a
     static `%` height instead; the value stays test-readable and the reveal still plays.

Adversarial findings (by persona):
  - owner, 20s between meetings: attention rows now stagger in as the panel populates; the
    three-timescale IA is untouched; metric bars still travel on a period switch.
  - trainer mid-shift: Desk now shares the shift/scan entrance language; sessions list keeps
    its own row stagger.
  - reduced motion: `Staggered`/`slide`/chart all route through `entrance`/`reduceMotionActive`
    — verified by code path; on-device toggle deferred with the rest (device locked).
  - small phone + font scale: Member Home checked at `font_scale 1.3` — no clipping.

Fixes applied: findings 1, 3, 4 above.

Before / after:
  - improved: the four highest-traffic screens now "arrive" the way the shift verdict does;
    the consistency chart draws itself; onboarding steps move in the direction of travel; two
    more legacy screens (`trainer/attendance`, `owner/trainers`) are off `components/ui` /
    `src/theme` with real gains (proper font families, travelling bars, design-system Badges,
    owner background). The scanner is now genuinely full-screen.
  - regressed: none in tests or typecheck. On-device confirmation for P2–P6 is outstanding.

Score (Member Home + tab-bar fix, the device-validated parts):
        UX 18/20 · Hierarchy 13/15 · Brand 14/15 · Type 9/10 · Layout 9/10 ·
        Interaction 9/10 · Motion 9/10 · A11y 5/5 · Responsive 5/5  →  TOTAL 91/100
The rest (P2–P6) is not scored to the ship gate until it has been seen on the device.

Stop-conditions: NOT all ticked. Device render is done for Member Home + the tab-bar fix only;
P2–P6 need an on-device pass (Owner Dashboard, Trainer Desk, Member Progress chart, Onboarding
slide, Trainer Attendance, Owner Trainers) at device width, `font_scale 1.3`, and reduced
motion. Scanner real-camera success path still unvalidated (no way to present a live GFQ1 QR).

---

## 2026-09-03 — Batch 3: owner/incentives · owner/branch/[id] · owner/trainer/[id] · trainer/pt/[id] · JourneyCompleteCard · progress-compare — ship

Direction     — redesign the four legacy detail screens to the member/trainer hierarchy (not a
                mechanical import swap); add the deferred Day-45 milestone treatment.
                (DESIGN-DECISIONS.md 2026-09-03 batch 3.)
Level         — L1 (layout, tokens, `Staggered`) + L2 (PT arrival/complete flow, chart-free
                travelling meters, `SuccessCheck`). No native change.
Rendered on   — Pixel 6a (33181JEGR09774), Fast Refresh, real backend over `adb reverse`.
Device evidence — trainer PT: split → member "Mark present" → `SuccessCheck` + green tint
                (`gf-pt-mark.mp4`, `gf-b3-pt-marked.png`) → both present → "Complete session" →
                COMPLETED + "Session recorded" (`gf-pt-done.mp4`, `gf-b3-pt-done.png`).
                owner/incentives (`gf-b3-incentives.png` — triage StatRow, sorted rows, per-row
                failing-check summary). owner/trainer/[id] (`gf-b3-trainer-detail.png` — ScreenHeader
                + status badge, ProgressCard, StatRow, Pass/Fail badges, staggered history).
                owner/branch/[id] (`gf-b3-branch.png` — ProgressCard hero, travelling occupancy,
                staggered roster). JourneyCompleteCard on Home + Workout (`gf-b3-ritu-home2.png`,
                `gf-b3-ritu-workout.png` — SuccessCheck draws, lime bar travels to full).
Interaction   — real PT arrival recording + session completion against the live backend (trainer
                Vikas Menon, session 96); nav via deep links + `adb input`.
Animation     — on device: PT `SuccessCheck` draws per side on "Mark present" and again on the
                checked-in→complete transition (keyed); JourneyCompleteCard `SuccessCheck` + lime
                bar travel. Reduced motion (`animator_duration_scale 0`) + `font_scale 1.3` checked
                on JourneyCompleteCard — mark draws complete, bar snaps, copy wraps, no clipping.

Findings (self-critique, real):
  1. `Staggered` wrapping a section whose rows also stagger (incentives list, trainer-detail
     history) would double-animate. → those sections render outside `Staggered`; a second block
     with `from` offset carries the delay count.
  2. `JourneyCompleteCard` self-wrapping in `Motion.View` would double up inside Home's
     `Staggered`. → the `SuccessCheck` is the entrance; the card doesn't also slide.
  3. Chart-height animation via `useAnimatedStyle` `%` reads `"0%"` in the jest mock (worklet
     runs pre-effect) — already solved in batch 2 (`scaleY` from a bottom origin); no chart
     touched here, but the same rule applied to `ProgressCard`/`ProgressBar` (real style props,
     travel natively, fine under test).
  4. PT `Avatar accent` ring is the trainer gold while the checked-in card + `SuccessCheck` are
     positive green — mild colour mismatch. Left: `Avatar`'s accent is a design-system prop and
     "this is the subject" reads fine; the green card + check carry the state.

Adversarial findings (by persona):
  - owner between meetings: incentives now answers "who needs a decision" first; branch/trainer
    detail lead with one proportion, not a tile wall.
  - trainer mid-shift: PT arrivals buzz and draw a check; "Complete" is gated and gives a verdict —
    same feel as the shift screen and the member exercise screen.
  - first-time member after finishing GT: the milestone is a quiet mark + a full bar, not a
    takeover; the paused-journey case stays a plain card.
  - reduced motion / small phone + font scale: JourneyCompleteCard holds at `font_scale 1.3` with
    animations off.

Fixes applied: findings 1 and 2 above.

Before / after:
  - improved: the four owner/trainer detail screens now read as one system with member 360 —
    `ScreenHeader`, `Section`s, travelling `ProgressCard`s, Pass/Fail badges; incentives is
    triage-first; PT recording is tactile and gated; Day-45 has a moment.
  - regressed: none in tests, typecheck, or the device passes.

Score (device-validated set):
        UX 18/20 · Hierarchy 14/15 · Brand 14/15 · Type 9/10 · Layout 9/10 ·
        Interaction 9/10 · Motion 9/10 · A11y 5/5 · Responsive 5/5  →  TOTAL 92/100

Stop-conditions: all ticked for the redesigned screens except — `progress-compare`'s result-card
`entrance` is code-only (the `entrance` primitive is device-proven; the change is one keyed
wrapper). Scanner real-camera GFQ1 success still unvalidated — a live rotating QR is now served
(auto-refreshing page in the dev machine's browser); it needs the Pixel physically pointed at it.

---

## 2026-09-03 — Viewport / edge-to-edge audit + targeted correction — ship

Scope         — bounded viewport optimization, not a redesign. Audited the shared layout infra
                (`Screen`, `Body`, `Section`, `ScreenHeader`, `AnimatedTabBar`, `Sheet`,
                `ScreenBackground`, `app.json`) and ~18 representative screens on the physical
                Pixel 6a. The edge-to-edge architecture (SDK 57 default-on, backgrounds bleed
                under insets, camera true full-screen) was found already correct.

Findings implemented:
  P1 — `Body` bottom padding was a hardcoded 48dp; the custom `AnimatedTabBar` never reported
       its real height, so `useBottomTabBarHeight()` returned a stale 64 and fully-scrolled
       content jammed against / could hide behind the floating bar (worse on 3-button nav /
       font-scale 1.3). → `AnimatedTabBar` now reports its measured height via
       `BottomTabBarHeightCallbackContext`; `Body` reads `BottomTabBarHeightContext` and pads
       `height + space.md`, falling back to 48dp outside a tab navigator. Shared root fix.
  P1 — `trainer/shift`: the 128dp check-in hero was top-anchored with ~60% of the viewport
       empty below it, contradicting the brief ("128dp, bottom-anchored, thumb-reachable"). →
       `Body contentContainerStyle={{flexGrow:1}}` + a `<Spacer/>` before the action block.
  P1 — `auth/role-select`: a `<Spacer/>` created an artefact void between the role list and the
       footnote. → removed; the editorial photo fills the lower viewport.
  P2 — `ScreenHeader` had no horizontal padding; the back chevron and trailing action hugged
       the physical edge, misaligned with the 16dp body gutter. → `paddingHorizontal: space.lg`
       on the header row (shared, ~9 detail screens).
  P2 — `trainer/pt/[id]` used `edges={['top','bottom']}` inside the tab navigator; the bottom
       edge added a redundant `insets.bottom`. → `edges={['top']}` (matches every other
       tab-nested screen; `scan` keeps `['top','bottom']` — its bar is hidden).

Left unchanged (verified correct): Member Home/Progress/Workout(active), Owner
Dashboard/Incentives/Branch/Trainer detail, Scan, Trainer Attendance, `Screen` default
`edges={['top']}`, `Body` 16dp page padding, `Sheet`, `ScreenBackground`, `app.json` edge-to-edge.
Short-content voids on naturally-sparse screens (completed-journey Workout, empty Sessions) are
data-dependent, not layout bugs — no change.

Device evidence — `audit/` screenshots: before (`t-shift.png`, `t-pt.png`, `auth-roleselect.png`,
`t-desk-bottom.png`) and after (`after-shift.png`, `after-shift-fs13.png`, `after-pt-header.png`,
`after-desk-scrolled.png`). Shift hero bottom-anchored at normal + 1.3× font scale; long Clients
list clears the tab bar with a ~12dp margin; `ScreenHeader` chevron + badge now sit on the 16dp
gutter.

Validation — `tsc --noEmit` clean; `jest --ci` 48 suites / 544 tests pass (no change — the new
context reads `undefined` under test and falls back to the prior 48dp). No regressions to any
screen. role-select's Spacer removal is test-validated (5/5) + code review; not device-rendered
this pass (unreachable while signed in) — deterministic one-line change.

Stop-conditions: all ticked for the five fixes. No P0 found.

## 2026-09-04 — Intelligence completion + production hardening (device pass)

Scope — the intelligence surfaces added since the overnight build: owner daily
brief contextual entry points, owner + member weekly summary cards, the
progression recommendation card, Ask GymFlow (all three roles), and a font
scale 1.3 / reduced-motion pass on the member Progress intelligence section.

Rendered on — Pixel 6a (33181JEGR09774), real backend over `adb reverse`.

Verified live end-to-end:
  - Owner Dashboard — "This morning" issue cards now carry a quiet "Tell me more"
    beside the deep link; tapping it opens the Ask GymFlow sheet pre-seeded with
    "Tell me more about: <issue title>" and auto-answers (explain intent, evidence
    rows, "Open trainers" link). "Ask about your gyms" row + "Last week"
    WeeklySummaryCard (date range, Ahead/Steady/Behind badge, metrics with
    previous + arrow) render below the brief.
  - Member Progress — WeeklySummaryCard, and the full RecommendationCard on a
    lift's detail (ADD LOAD badge, "80 kg × 12" → "82.5 kg", "+2.5 kg · 12-15
    reps", the why, and "A suggestion from your logged sets — not a change to
    your programme."). Ask GymFlow: chip → answer with data rows + deep link.
  - Font scale 1.3 + OS reduced-motion — the "What stands out" section, its
    insight cards, evidence rows and deep-link buttons all scale and wrap with
    no clipping, no horizontal scroll; entrances render without stagger. No JS
    errors in logcat across the session.

Fixes from this pass:
  P2 — Owner weekly headline "No shifts recorded last week." sat above a
       "(was 81.8%)" metric. → "No trainer shifts recorded last week, down from
       81.8% on time the week before." + moves to "Behind".
  P2 — Member weekly "Total load" row read "0 kg (was 22.1 t)" — mixed units.
       → `_load_pair` formats both sides in one unit (the larger of the two).
  P2 — Ask GymFlow "How am I progressing?" answered with headline + three bullets
       each repeating a title AND its full summary, over data rows carrying the
       same numbers — a chatbot wall. → bullets are titles only; detail stays in
       the rows.
  P2 — info-severity insight used a bare outline circle. → information icon.
  P2 — owner punctuality issue fired on a 1-shift sample. → min-shift guard (10).

Also this pass (not device-driven): the UTC-vs-branch-local date defect —
`progress_photo_service` "future date" check and the program-day rotation anchor
both compared a UTC date against a branch-local one, failing in the ~5.5h window
where the IST calendar day is ahead of UTC. Both fixed to `branch_today(tz)`;
deterministic frozen-clock regression tests added. Backend suite: 1204 pass / 0
fail (was 1132 / 21). Mobile: 54 suites / 583 tests. tsc + ruff clean.

Stop-conditions: ticked for the fixes above. No P0 found.

---

_(newest entry goes above this line)_
