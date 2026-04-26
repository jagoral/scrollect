import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Pin to a low-traffic UTC hour so the schedule doesn't drift across redeploys
// and ops can correlate cleanup spikes with the same wall-clock window each day.
crons.daily(
  "cleanup stale push tokens",
  { hourUTC: 4, minuteUTC: 0 },
  internal.notifications.tokens.cleanupStalePushTokens,
);

export default crons;
