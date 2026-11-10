/** Why a conversation is in «Archivadas»: the server's rule, in the worker's words. */
export function archiveRuleText(days) {
  if (!days) return ''
  return days === 1
    ? __(
        'A conversation with no activity for a day is archived here on its own. Restore it to bring it back.',
      )
    : __(
        'A conversation with no activity for {0} days is archived here on its own. Restore it to bring it back.',
        [days],
      )
}
