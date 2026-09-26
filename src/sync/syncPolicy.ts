export type BackgroundSyncMode = 'manual' | 'onFocus';

export function shouldRunBackgroundSync(
  mode: BackgroundSyncMode,
  lastSyncAt: number,
  now: number,
  intervalMinutes: number,
): boolean {
  if (mode === 'manual') { return false; }
  const safeInterval = Math.max(1, intervalMinutes) * 60_000;
  return now - lastSyncAt >= safeInterval;
}
