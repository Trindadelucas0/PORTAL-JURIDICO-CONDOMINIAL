export const LIVE_POLL_MS = 3000;

/** Poll a cada 3s; staleTime 0 fura o default de 15s do QueryClient. */
export const livePollQuery = {
  staleTime: 0,
  refetchInterval: LIVE_POLL_MS,
  refetchIntervalInBackground: true,
} as const;
