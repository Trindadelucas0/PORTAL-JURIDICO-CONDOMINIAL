export const LIVE_POLL_MS = 3000;

export const livePollQuery = {
  refetchInterval: LIVE_POLL_MS,
  refetchIntervalInBackground: false,
} as const;
