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

`?on=YYYY-MM-DD` overrides "today" for deterministic tests.

---

## 5. Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `INTELLIGENCE_NARRATOR` | `template` | `template` or `llm`. `llm` needs a provider (none in V1). |
| `INTELLIGENCE_LLM_MODEL` | `""` | Provider model id. Server-side only. |
| `INTELLIGENCE_LLM_API_KEY` | `""` | Provider credential. **Server-side only — never sent to mobile.** |
| `INTELLIGENCE_LLM_TIMEOUT_SECONDS` | `6.0` | Per-narration timeout; on breach → template. |
| `INTELLIGENCE_LLM_MAX_OUTPUT_TOKENS` | `400` | Output ceiling. |

All business thresholds live in `app/services/intelligence/thresholds.py`
(`IntelligenceThresholds`) and nowhere else.

---

## 6. Tests

- `test_intelligence_signals.py` — each calculator's classification boundaries
  and insufficient-data paths, deterministic dates.
- `test_intelligence_member.py` — insight assembly, severity ordering, empty
  state, evidence-on-every-insight.
- `test_intelligence_narrator.py` — template pass-through; LLM used when valid;
  fallback on provider error / timeout / markup / empty / off-brief.
- `test_intelligence_api.py` — authorization matrix (self / cross-member /
  cross-branch / unauth / 404), insufficient-data over HTTP, no-PII check.

---

## 7. Remaining / pending

- Live LLM provider wiring + verification (no key available).
- Weekly summary as a stored artefact (P1).
- Trainer Copilot brief + Needs-Attention triage (P0.5) — in progress.
- Owner GymFlow Intelligence + Daily Brief (P0.6) — in progress.
- Progression recommendation engine, Ask GymFlow, nudges (P1/P2).
