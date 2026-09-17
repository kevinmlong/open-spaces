// Postgres raises these from the RPCs; the room should never see a raw error.
const MESSAGES = {
  already_voted: "You've already voted — thanks!",
  voting_not_open: 'Voting just closed.',
  proposals_not_open: 'Proposals are closed.',
  invalid_topic: 'One of those topics is no longer available.',
  not_authenticated: 'Lost your session — refresh the page.',
  forbidden: "You don't have permission to do that.",
  session_archived: 'That session has been archived.',
  close_voting_first: 'Close voting before generating the schedule.',
  bad_dimensions: 'Rounds and rooms must both be at least 1.',
  pin_out_of_range: 'An override falls outside the grid — clear it or add rounds/rooms.',
  duplicate_pin: 'Each slot and each topic can only be overridden once.',
  pin_topic_not_active: 'An overridden topic is no longer active — clear it and try again.',
  bad_pins: 'The overrides could not be read — refresh and try again.',
  cannot_merge_into_self: "A topic can't be merged into itself.",
  source_must_be_active: 'That topic is no longer active.',
  target_must_be_active_same_session: 'Pick an active topic to merge into.',
}

export function humanError(error) {
  if (!error) return null
  const raw = error.message || String(error)

  for (const [code, text] of Object.entries(MESSAGES)) {
    if (raw.includes(code)) return text
  }
  if (/pick_between_1_and_(\d+)_topics/.test(raw)) {
    const n = raw.match(/pick_between_1_and_(\d+)_topics/)[1]
    return `Pick between 1 and ${n} topics.`
  }
  if (/illegal_transition_(\w+)_to_(\w+)/.test(raw)) {
    return "That phase change isn't allowed from here."
  }
  // Anonymous sign-in rate limiting -- the #1 launch risk. Say so explicitly
  // rather than spinning, so an organizer finds out in seconds.
  if (/rate limit|too many requests/i.test(raw)) {
    return 'Too many sign-ins from this network — tell an organizer.'
  }
  // A bare RLS rejection is the shape a late write takes. Almost always it means
  // the window shut between opening the form and pressing the button.
  if (/row-level security/i.test(raw)) {
    return "That window just closed — you're a moment too late."
  }
  if (/failed to fetch|networkerror/i.test(raw)) {
    return "Can't reach the server — check your connection."
  }
  return raw
}

/** True when a failed write is worth retrying from the outbox. */
export function isRetryable(error) {
  const raw = error?.message || ''
  return /failed to fetch|networkerror|timeout|503|504/i.test(raw)
}
