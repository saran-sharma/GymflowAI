# GymFlow Intelligence

The intelligence layer turns operational data GymFlow already stores into a
short, explained read of what is going well and what needs attention — for a
member on their Progress screen, a trainer on a member's detail, and an owner on
the dashboard.

It is **not** a chatbot and **not** a predictive model. Every number is computed
by GymFlow code from stored rows; the only non-deterministic thing anywhere in
the pipeline is one headline sentence, which a narration provider may rephrase
and which always has a deterministic fallback.

```
stored rows ─▶ deterministic signals ─▶ structured insights ─▶ (optional) headline rephrasing ─▶ typed contract ─▶ native UI
 (models)        signals.py               member.py               narrator.py                     schemas.py
```

---

## 1. Data-model audit (what GymFlow already stores)

| Concern | Source of truth | Notes |
| --- | --- | --- |
| Actual performance (weight, reps, RPE) | `workout_sets` | The **only** place real load exists. Everything strength-related is derived from here on read; nothing is cached. |
| Prescribed work | `workout_session_items` (`sets`, `reps`, `rest_seconds`) | Separate from performance by design — a recommendation must never overwrite this. |
| Own workouts | `workout_sessions` (`status`, `session_date`, `split`, `journey_id`) | `COMPLETED` sessions are "training". |
| Coached sessions | `pt_sessions` (`status`, `session_date`) | Also "training" for consistency / inactivity. |
| Gym visits | `attendance_events` (`event_type=CHECK_IN`, `work_date`) | A visit is not a training session; it only feeds "last seen". |
| Journey / programme | `journeys` (`status`, `start_date`, `end_date`, `duration_days`, `pt_converted`), `journey_days` (`status`) | `journey_service.progress()` already computes day/phase/completion. |
| Membership | `memberships` (`status`, `ends_on`) | Expiry window. |
| PR rules | `app/domain/records.py` | Reused conceptually: a PR always means *something was beaten*. |
| Existing owner rule-observations | `app/integrations/intelligence/provider.py` (`RuleBasedIntelligenceProvider`) | Left in place; the new layer does not duplicate its branch-attendance observations. |

### Signals derivable now (implemented)

- **Training consistency** — completed own-workout + PT sessions per week over a
  trailing 4-week window, against the 3/week the journey cadence assumes.
- **Inactivity** — days since the last completed training session; days since
  the last gym visit.
- **Personal records** — genuine heaviest-weight PRs (chronological replay per
  lift; a tie is not a record; a first session sets none) achieved in the last
  30 days.
- **Training trend** — total volume (Σ weight×reps) and session frequency for
  the last 28 days vs the 28 before; reported only when both windows have ≥3
  sessions.
- **Plateau** — one lift, the most-trained; top-set weight flat within 1 kg
  across ≥4 recent sessions spanning ≥21 days, with no PR in that time. Returns
  the evidence and the reason it did or did not fire.
- **Journey / programme status** — phase, current day, days remaining, missed
  days, completion %, PT conversion.
- **Membership** — ends within 14 days.

### Signals that need additional persisted state (not built)

- **Weekly intelligence summary as a stored artefact** — currently every read
  recomputes. A `member_weekly_summaries` table would let "since last week"
  language and week-over-week deltas be stable. (P1)
- **Nudge candidates / events with dedupe + cooldown** — needs its own tables to
  avoid re-sending. (P2)
- **Adaptive-workout recommendations as first-class rows** — the recommendation
  must be stored *next to*, never in, `workout_session_items`. (P1/P2)

### Signals not yet supportable

- Churn / renewal-risk probability — no model, and the honest answer is not a
  number. `RuleBasedIntelligenceProvider.churn_risk` already returns `{}` for
  this reason.
- Revenue / LTV insight — GymFlow has no billing model; `/reports/renewals`
  already notes this.
- Sleep / nutrition / bodyweight-load context — not collected.

---

## 2. The contract (`app/services/intelligence/schemas.py`)

```
IntelligenceInsight = {
  id, type, severity: "positive"|"info"|"attention"|"critical",
  title, summary,
  evidence: {label, value}[],          # value is preformatted ("62.5 kg", "11 days")
  action?: {label, route?}             # always a route the caller may open
}

MemberIntelligence = {
  member_id, generated_at,
  state: "ok"|"insufficient_data",
  headline,                            # one sentence; empty-state copy when insufficient
  insights: IntelligenceInsight[],     # ordered critical → attention → positive → info
  next_action?: InsightAction,
  narration_source: "deterministic"|"llm",
  coverage: { completed_sessions, weeks_of_history, analysed_through }
}
```

The mobile app has one `IntelligenceInsight` renderer; member / trainer / owner
surfaces differ only in which subset they show.

---

## 3. AI safety boundaries

- **AI is never the source of a metric.** Signals, scores, classifications,
  evidence and actions are all computed in `signals.py` / `member.py`. The
  narrator receives a normalized dict of already-computed figures and returns
  one sentence.
- **AI output is validated before display** (`narrator.validate_headline`):
  non-empty, ≤180 chars, no markup / links / code fences, ≤3 sentences.
  Anything else is discarded and the template sentence is used.
- **The product works with no LLM.** `INTELLIGENCE_NARRATOR` defaults to
  `template`. No provider package ships in V1; `llm` currently logs and behaves
  as `template`. Live-provider verification is **pending** a real key.
- **No medical claims.** Insights describe training patterns; they never
  diagnose, and the plateau signal is explicitly "a normal phase", severity
  `info`.
- **No invented history.** Insufficient data (`< 3` completed sessions) returns
  `state: "insufficient_data"` with the empty-state sentence and no insights —
  it never fabricates a trend.
- **Trainer programming is not touched.** This layer only reads. Progression
  recommendations (P1) will be stored separately and labelled as
  recommendations.
- **Authorization is the journey/workout rule.** `assert_can_read_member`:
  member → self only; trainer → members at their branch; management → branches
  in scope. No arbitrary-id path.
- **Minimal PII to a provider.** The narration context is figures and
  classification strings only — no name, email, or member id.

---

## 4. Endpoints

| Method | Path | Who | Returns |
| --- | --- | --- | --- |
| GET | `/api/v1/intelligence/me` | any member | their own `MemberIntelligence` |
| GET | `/api/v1/intelligence/members/{id}` | member (self), trainer (same branch), management (in scope) | that member's `MemberIntelligence` |
| GET | `/api/v1/intelligence/members/{id}/brief` | **staff only** (trainer same branch, management in scope) | `TrainerBrief` — Today / Watch / Progress / Suggested focus, same insights framed for a coach; no owner-only figure |
| GET | `/api/v1/intelligence/trainer/attention` | trainer | `TrainerAttentionQueue` — the caller's assigned members ranked by a transparent weight table, each with the reason and a deep link |
| GET | `/api/v1/intelligence/owner/daily-brief` | management (`?branch_id=`) | `OwnerDailyBrief` — aggregate attention issues (punctuality, absence, quiet members, renewals, PT-ready, branch lag); no revenue |
| GET | `/api/v1/intelligence/{me,members/{id}}/exercises/{exercise}/recommendation` | member (self), staff (same read rule) | `ProgressionRecommendation` — conservative next-weight advice for one lift; `?before_session_id=` excludes the open session |
| GET | `/api/v1/intelligence/{me,members/{id}}/weekly`, `/owner/weekly` | member / staff / management | `WeeklySummary` — one reusable shape, member or owner metrics, `?week_ending=` |
| POST | `/api/v1/intelligence/ask` | any role (`{question, member_id?}`) | `AskAnswer` — one intent-matched deterministic answer + the data behind it |
| GET | `/api/v1/intelligence/ask/suggestions` | any role (`?member_id=`) | `AskSuggestions` — role-aware starter chips |
| POST | `/api/v1/intelligence/nudges/sweep` | member (own) / trainer (own assigned); owner 403 | `{raised, keys}` — evaluate and raise the caller's contextual nudges; idempotent + cooldown-guarded |

`?on=YYYY-MM-DD` overrides "today" for deterministic tests.

### Contextual nudges (`nudges.py`)

A nudge is a small factual prompt from the signals, raised through the existing
`Alert` table (`raise_alert`, `target_user_id`), so it lands in the recipient's
own `GET /alerts` feed with the same audit trail — no new channel, no push
infra. On top of that: **deterministic source** (every candidate from
`signals.member_signals`), **dedup** (`dedupe_key` carries a period bucket —
ISO week / date / milestone), **cooldown** (`cooldown_days` per `dedupe_base`,
measured against `payload["raised_at"]` so it uses the one freezable clock).
Candidates — member: inactivity, fresh PR, journey milestone (day 15/30/complete);
trainer: assigned-member-inactive, journey-days-missed. The mobile alert centre
calls the sweep on open for members/trainers.

### Live narration provider (`prompts.py`, `narrator.HttpNarrationProvider`)

`INTELLIGENCE_NARRATOR=llm` + `INTELLIGENCE_LLM_API_KEY` + `INTELLIGENCE_LLM_MODEL`
turns on `LLMNarrator` over `HttpNarrationProvider` — an OpenAI-compatible
chat-completions client on the stdlib (no new dependency; point
`INTELLIGENCE_LLM_BASE_URL` at OpenAI, Azure, a proxy or a local server). The
key rides only the `Authorization` header, never a body or a log. The model
gets only `prompts.minimal_context` (an allow-list of scalar figures — no
member record, email, id, credential, revenue or incentive). It must return
`{headline, reason?, action?}` JSON; `parse_structured` validates the headline
(≤180 chars, no markup/links, ≤3 sentences, string only) and screens
reason/action; anything malformed, over-long, off-brief, timed-out, empty or
`401` falls to the template. **No key in this environment → live end-to-end
verification pending**; the wire format, parsing, auth, timeout and every
fallback are covered by tests against a fake provider and a stubbed `urlopen`.

### Performance (`_cache.py`)

`build_owner_daily_brief` and `build_attention_queue` fan out per member/branch
and are read on every dashboard load (mount + focus). A 45s process-local TTL
cache keyed on `(scope, date[, limit])` de-dupes that; deterministic, self-
pruning, never load-bearing (cold cache just recomputes). Everything else is
one member's ~8 signal queries or a bounded aggregate — no N+1, no AI call per
render (narration is one call per payload, template by default).

### Workout progression rule (`progression.py`, thresholds centralised)

Nothing until two logged sessions of the lift. Add load (`+2.5 kg`, or `+5 kg`
for compound lower-body) only when the last top set met its rep target and RPE
(if recorded) was `≤ progression_rpe_ok` (8). Hold when reps were short, or hit
but hard. Back off `−10%` only when reps were `≥ 3` under target or RPE was 10.
Never a jump over `progression_max_increase_pct` (5%) of the last top weight.
It is advice — workout items carry a rep target, not a weight, so there is
nothing to overwrite.

### Weekly summary

`WeeklySummary` (audience, week, headline, `movement: ahead|steady|behind`, a
list of `WeeklyMetric` with `previous` + `direction`). Member metrics: sessions,
total load, gym visits, PRs — movement follows sessions, then load. Owner
metrics: trainer punctuality week-over-week, unworked shifts, new members.
"Last week" is the most recent completed Mon–Sun.

### Ask GymFlow

Intent match → the same builder the screens use → a short answer + its data.
Member intents: overview, consistency, last-trained, records, last-week,
next-weight (needs the lift named). Trainer (client in context): how-is-X,
focus, who-needs-attention. Owner: attention, punctuality, last-week.
Unrecognised → "here is what you can ask". No model; `source` is always
`deterministic`. A member's `member_id` is ignored; staff must pass one they
can read.

### Trainer attention weights (auditable, in `trainer._ATTENTION_WEIGHTS`)

`inactive` 100 · `membership_expiring` 80 · `journey_missed` 70 · `inactivity_slipping` 60 · `consistency_low` 55 · `trend_declining` 45 · `plateau` 25. The highest-scoring signal owns the row's reason; a member scoring 0 is not listed.

### Owner issue thresholds (in `thresholds.py`)

Trainer punctuality: MTD on-time `< owner_punctuality_floor_pct` (85), but only past `owner_punctuality_min_shifts` (10) shifts. Absence: any unworked shift, critical past two. Quiet members: no workout/PT/visit in `owner_inactive_member_days` (14) as a share of the active roster, attention past 15%, critical past 30%. Renewals: active memberships ending within `owner_renewal_horizon_days` (14). Branch lag: a branch `owner_branch_lag_points` (8) below the group average.

---

## 5. Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `INTELLIGENCE_NARRATOR` | `template` | `template` or `llm`. `llm` also needs a key **and** a model, or it logs once and stays template. |
| `INTELLIGENCE_LLM_MODEL` | `""` | Provider model id (e.g. `gpt-4o-mini`). Server-side only. |
| `INTELLIGENCE_LLM_API_KEY` | `""` | Provider credential. **Server-side only — header-only, never a body, never a log, never sent to mobile.** |
| `INTELLIGENCE_LLM_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible chat-completions root (OpenAI, Azure, proxy, local). |
| `INTELLIGENCE_LLM_TIMEOUT_SECONDS` | `6.0` | Per-narration timeout; on breach → template. |
| `INTELLIGENCE_LLM_MAX_OUTPUT_TOKENS` | `400` | Output ceiling. |

All business thresholds live in `app/services/intelligence/thresholds.py`
(`IntelligenceThresholds`) and nowhere else.

---

## 6. Tests (`tests/backend/`)

- `test_intelligence_signals.py` — each calculator's classification boundaries
  and insufficient-data paths, deterministic dates. Includes the consistency
  "steady" band, tie-is-not-a-PR, an escalating top set within one session,
  ±12% trend inclusivity, zero-previous-volume → insufficient, and a stretch one
  day short of the plateau span.
- `test_intelligence_member.py` — insight assembly, severity ordering, empty
  state, evidence-on-every-insight, and that a broken narrator does not take the
  read down.
- `test_intelligence_narrator.py` — template pass-through; LLM used when valid;
  fallback on provider error / timeout / 401 / 403 / unreachable host / markup /
  empty / off-brief; the HTTP provider sends the key only in the header;
  `safe_narrate`.
- `test_intelligence_api.py` — authorization matrix (self / cross-member /
  cross-branch / unauth / 404), insufficient-data over HTTP, no-PII check.
- `test_intelligence_trainer.py` — brief progress/watch split, specific
  suggested-focus, thin-history, no owner-only field; attention-queue ranking,
  visible reason, deep link, empty-when-healthy; staff-only + branch-scope
  gates; attention endpoint needs a trainer account.
- `test_intelligence_owner.py` — each issue's threshold (incl. the small-sample
  punctuality guard), the calm empty brief, management-only gate, scope label,
  branch-manager scoping.
- `test_intelligence_progression.py` — every rule branch, the 5% cap, the
  open-session exclusion, the read-rule on the endpoint.
- `test_intelligence_weekly.py` — member ahead/behind/steady/zero, default-week
  resolution, owner punctuality movement + counts, the endpoint gates.
- `test_intelligence_ask.py` — each member/trainer/owner intent (incl. the
  slowdown, focus-today, branch and explain intents), unrecognised fallback,
  `member_id` ignored for a member, cross-branch 403, branch-manager-scoped
  "explain", role-aware suggestion chips.
- `test_intelligence_prompts.py` — `minimal_context` drops every non-allow-listed
  key (member id, email, name, credential, revenue, incentive, nested objects),
  truncates long strings, and the user message carries no PII.
- `test_intelligence_nudges.py` — each candidate, dedup on a same-day re-sweep,
  cooldown expiry across a period, healthy-member silence, trainer scope, the
  endpoint role gate, and that a nudge lands only in the recipient's own feed.
- `test_intelligence_cache.py` — TTL hit/miss/expiry/clear, and the attention
  queue served from cache.
- `test_progress_photos.py` / `test_todays_workout_schedule.py` — deterministic
  UTC/branch-local date-boundary regression tests (clock frozen straddling
  midnight UTC).

Mobile: `__tests__/{member-intelligence,trainer-copilot,owner-daily-brief,
progression-recommendation,weekly-summary,ask-gymflow,alert-centre}.test.tsx` —
loading / insufficient-data / provider-error / calm / normal states, evidence
rendering, action deep-linking, list caps, Ask chip→answer / type→answer /
initialQuestion flows, the owner "Tell me more" wiring, compact recommendation
"Use" (prefill only), and the nudge sweep on alert-centre open.

---

## 7. Device QA (Pixel 6a, serial 33181JEGR09774)

- **Member Progress** — "What stands out" section verified end-to-end: real
  `/intelligence/me` data (inactivity 16 d, volume −57%, 12 PRs), headline,
  three insight cards with evidence rows and working actions, provider-error
  banner seen and recovered.
- **Owner Dashboard** — "This morning" section verified: scope, headline, three
  issue cards (critical absence, renewals, PT-ready) with evidence and deep
  links; the small-sample punctuality issue correctly suppressed after the fix.
- **Owner Dashboard** (second pass) — the daily brief with per-issue "Tell me
  more" opening Ask GymFlow pre-seeded, the "Ask about your gyms" row, and the
  "Last week" `WeeklySummaryCard` all verified live end-to-end.
- **Member** (second pass) — the weekly recap card, the full
  `RecommendationCard` on a lift's detail ("ADD LOAD", 80 kg × 12 → 82.5 kg,
  with the "not a change to your programme" line), and Ask GymFlow (chip →
  answer with data rows + deep link) all verified live. Font scale 1.3 +
  OS reduced-motion pass: no clipping, text wraps, deep-link buttons intact,
  entrances render without stagger. No JS errors in logcat.
- **Trainer** — brief + Needs Attention + the new "Ask about your clients" /
  "Ask about <first name>" rows render through the same components validated on
  the member and owner surfaces; endpoints verified via authenticated curl.

---

## 8. Remaining / pending

- **Live LLM provider verification** — the real `HttpNarrationProvider` client,
  prompts, minimisation, structured-output validation, timeout/auth handling,
  fallback, config and tests are all in place. GymFlow is not configured for a
  hosted model (`INTELLIGENCE_NARRATOR=template`, no `INTELLIGENCE_LLM_API_KEY`),
  so no call to a real provider has been made. The wire path *was* exercised
  end-to-end over a live local socket (2026-09-04): `source="llm"`, structured
  JSON parsed, key only in the `Authorization` header, unlisted context keys
  stripped, `response_format=json_object`, key absent from logs. To go live: set
  `INTELLIGENCE_NARRATOR=llm` + `INTELLIGENCE_LLM_API_KEY` + `_MODEL`.
- **On-device QA of the intelligence surfaces** — the 2026-09-04 validation pass
  could not render on the Pixel 6a (not connected, no emulator). Member /
  Trainer / Owner device walkthroughs, font-scale 1.3, reduced-motion and
  cold-launch checks are still owed. Everything not needing a device (signal
  boundaries, authorization matrix, adversarial Ask, LLM chaos, performance) was
  covered.
- **Weekly summary as a stored artefact** — today every read recomputes (the
  45s cache covers the double-load). A `*_weekly_summaries` table would make
  "since last week" language stable and let a digest be pushed.
- **Trainer on-device screenshot pass** — brief / Needs Attention / the trainer
  Ask entry points were verified via the shared components + curl, not a
  dedicated device capture this session.
- **Adaptive workout, fuller version** (P2) — the progression recommendation
  (compact card mid-workout, full card on the lift's detail; "Use" prefills
  only) is the safe first version. A dedicated CURRENT / RECENT / RECOMMENDED /
  WHY panel with Accept / Keep / Ask-trainer actions is the next step, and
  "Accept" as a real programme mutation only if a member gains programme-edit
  permission (they do not today).
