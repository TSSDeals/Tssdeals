// Cooperative, one-shot cancellation for long-running admin work (AI
// classification + deal syncs). An in-flight external API call can't be safely
// force-killed, so long loops capture the current "stop epoch" when they start
// and bail out as soon as the epoch advances (i.e. an admin pressed Stop while
// they were running). Work started AFTER a stop captures the new epoch and is
// therefore unaffected — this keeps the stop strictly one-shot.

let stopEpoch = 0;
let lastStopAt: number | null = null;

// Signal every currently-running cancellable loop to halt at its next checkpoint.
export function requestStopAll(): { stoppedAt: number } {
  stopEpoch += 1;
  lastStopAt = Date.now();
  return { stoppedAt: lastStopAt };
}

// Capture at the start of a cancellable unit of work.
export function getStopEpoch(): number {
  return stopEpoch;
}

// True if a stop was requested after `epoch` was captured.
export function stopRequestedSince(epoch: number): boolean {
  return stopEpoch > epoch;
}

export function getLastStopAt(): number | null {
  return lastStopAt;
}
