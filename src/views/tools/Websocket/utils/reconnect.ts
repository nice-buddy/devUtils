export const MAX_RECONNECT_DELAY = 30000

export function nextReconnectDelay(attempt: number): number {
  const safe = Math.max(0, Math.floor(attempt))
  return Math.min(1000 * 2 ** safe, MAX_RECONNECT_DELAY)
}

export function shouldReconnect(state: { manualClose: boolean; autoReconnect: boolean }): boolean {
  return state.autoReconnect && !state.manualClose
}
