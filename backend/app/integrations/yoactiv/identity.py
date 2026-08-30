"""Identity mapping between a Yoactiv record and a GymFlow ``Member`` row.

``Member.external_ref`` exists specifically for this: "Set when the record
originates in an external system of record (Yoactiv)" (see
``backend/app/db/models.py``). This module is the one place that resolves an
``ExternalMember`` (the transport dataclass every member provider speaks) to
GymFlow's own row, so there is a single, tested answer to "how do we find our
copy of this Yoactiv member" rather than each caller writing its own query
against ``external_ref``.

Nothing here calls Yoactiv or invents a sync. It only defines what happens to
an ``ExternalMember`` once one exists — today that means tests construct one
by hand; later it will mean a real sync run producing one per Yoactiv row.

See ``docs/INTEGRATIONS.md`` for what is still missing before a real sync can
run at all.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.auth import normalise_phone
from app.db.models import Member, User
from app.integrations.base import ExternalMember


def find_member_by_external_ref(db: Session, external_member: ExternalMember) -> Member | None:
    """Look up the GymFlow member linked to this Yoactiv record, if any.

    Three outcomes, all legitimate:

    * No match — the GymFlow member has not been linked to Yoactiv yet (or
      never will be, e.g. it predates the integration). Returns ``None``;
      this is not an error and callers must not treat it as one.
    * Exactly one match — the normal case. ``Member.external_ref`` carries a
      unique constraint (see migration ``b4e6bbcca127``), so this is the only
      case a successful query can return.
    * More than one match can never happen given that constraint; a duplicate
      write is rejected by the database, not filtered out here.
    """
    return db.scalar(select(Member).where(Member.external_ref == external_member.external_id))


def link_member(db: Session, member: Member, external_member: ExternalMember) -> Member:
    """Record that ``member`` is GymFlow's copy of ``external_member``.

    This only stamps the column; it does not create, update or overwrite any
    other field on ``member`` and it does not commit. Callers own the
    transaction. Raises whatever the database raises (an ``IntegrityError``,
    via the unique constraint) if ``external_member`` is already linked to a
    different GymFlow member.
    """
    member.external_ref = external_member.external_id
    db.flush()
    return member


@dataclass(frozen=True)
class MemberMatch:
    """The outcome of resolving one Yoactiv record to a GymFlow ``Member``.

    ``method`` is how the link was made, in descending order of trust:

    * ``external_ref`` — this Yoactiv ``Member_ID`` is already stamped on a
      GymFlow member. Definitive.
    * ``email`` — exact, case-normalised match on ``User.email`` (unique in
      GymFlow). Safe to auto-link.
    * ``phone_unique`` — exactly one active GymFlow member's phone normalises
      to the same 10 digits. Safe *because it is unique*; two members sharing
      a phone is ``ambiguous``, not this.
    * ``ambiguous`` — more than one active member matched by phone. Never
      linked automatically; a human decides.
    * ``none`` — nothing matched.

    A name is **never** a match key. It is carried in ``detail`` for a human
    reading the dead-letter queue, nothing more.
    """

    member: Member | None
    method: str
    detail: str


def resolve_member(
    db: Session,
    *,
    yoactiv_member_id: int | str,
    email: str | None = None,
    phone: str | None = None,
    name: str | None = None,
) -> MemberMatch:
    external_id = str(yoactiv_member_id)

    linked = db.scalar(select(Member).where(Member.external_ref == external_id))
    if linked is not None:
        return MemberMatch(linked, "external_ref", f"already linked to {linked.member_code}")

    if email:
        by_email = db.scalar(
            select(Member)
            .join(User, Member.user_id == User.id)
            .where(User.email == email.strip().lower(), User.is_active.is_(True))
        )
        if by_email is not None:
            return MemberMatch(by_email, "email", f"exact email match ({by_email.member_code})")

    if phone:
        wanted = normalise_phone(phone)
        if len(wanted) == 10:
            candidates = [
                member
                for member, user in db.execute(
                    select(Member, User)
                    .join(User, Member.user_id == User.id)
                    .where(
                        Member.is_active.is_(True),
                        User.is_active.is_(True),
                        User.phone.isnot(None),
                    )
                ).all()
                if normalise_phone(user.phone or "") == wanted
            ]
            if len(candidates) == 1:
                return MemberMatch(
                    candidates[0],
                    "phone_unique",
                    f"unique active phone match ({candidates[0].member_code})",
                )
            if len(candidates) > 1:
                codes = ", ".join(sorted(m.member_code for m in candidates))
                return MemberMatch(
                    None, "ambiguous", f"{len(candidates)} active members share this phone: {codes}"
                )

    hint = f" (Yoactiv name {name!r})" if name else ""
    return MemberMatch(None, "none", f"no GymFlow member linked, by email or by unique phone{hint}")


__all__ = ["MemberMatch", "find_member_by_external_ref", "link_member", "resolve_member"]
