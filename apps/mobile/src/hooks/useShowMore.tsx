import { useState } from 'react';

import { LinkButton } from '../design';

/**
 * The shared progressive-disclosure pattern: show the first `initialCount`
 * items, with a "Show N more" toggle that expands to everything already
 * fetched, and "Show less" to collapse back. Nothing here re-fetches or
 * paginates — it bounds what renders from a list the caller already has, so
 * a long history never means a long initial screen.
 */
export function useShowMore<T>(items: T[], initialCount = 3) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, initialCount);
  const remaining = items.length - visible.length;

  const toggle =
    remaining > 0 ? (
      <LinkButton title={`Show ${remaining} more`} onPress={() => setExpanded(true)} />
    ) : expanded && items.length > initialCount ? (
      <LinkButton title="Show less" onPress={() => setExpanded(false)} />
    ) : undefined;

  return { visible, remaining, expanded, toggle };
}
