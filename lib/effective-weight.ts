import db from './database';

/**
 * Get the user's latest bodyweight from bodyweight_log.
 * Returns 0 if no bodyweight has been logged.
 */
export function getLatestBodyweight(): number {
  const row = db.getFirstSync<{ weight: number }>(
    'SELECT weight FROM bodyweight_log ORDER BY date DESC LIMIT 1'
  );
  return row?.weight ?? 0;
}

/**
 * For counterweight exercises (negative weight values like assisted pull-ups),
 * the effective weight lifted = bodyweight - |counterweight|.
 * For normal exercises, returns the weight as-is.
 */
export function getEffectiveWeight(weight: number, bodyweight?: number): number {
  if (weight >= 0) return weight;
  // Negative weight = counterweight/assistance
  const bw = bodyweight ?? getLatestBodyweight();
  if (bw <= 0) return Math.abs(weight); // fallback: just use absolute value if no bodyweight logged
  return Math.max(0, bw - Math.abs(weight));
}

/**
 * Check if a weight value represents a counterweight exercise.
 */
export function isCounterweight(weight: number): boolean {
  return weight < 0;
}
