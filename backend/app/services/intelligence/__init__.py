"""GymFlow's intelligence layer.

Operational data → deterministic signals (:mod:`.signals`) → structured insights
(:mod:`.member`) → an optional one-line rephrasing (:mod:`.narrator`) → the typed
contract in :mod:`.schemas`. The product works with every part of this switched
off: no signal is a prediction, no figure comes from a language model, and the
narration degrades to a template sentence whenever a provider is absent, slow or
off-brief.

Business thresholds live in :mod:`.thresholds` and nowhere else.
"""

from __future__ import annotations

from app.services.intelligence.member import build_member_intelligence
from app.services.intelligence.narrator import build_narrator
from app.services.intelligence.schemas import (
    IntelligenceInsight,
    MemberIntelligence,
)
from app.services.intelligence.signals import MemberSignals, member_signals
from app.services.intelligence.thresholds import THRESHOLDS

__all__ = [
    "THRESHOLDS",
    "IntelligenceInsight",
    "MemberIntelligence",
    "MemberSignals",
    "build_member_intelligence",
    "build_narrator",
    "member_signals",
]
