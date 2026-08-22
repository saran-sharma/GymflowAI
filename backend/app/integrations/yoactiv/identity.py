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

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Member
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


__all__ = ["find_member_by_external_ref", "link_member"]
