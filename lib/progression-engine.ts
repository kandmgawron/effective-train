import db from './database';
import { ExerciseProgressionConfig, ProgressionRecommendation } from '@/types';

interface SessionData {
  date: string;
  sets: { reps: number; weight: number }[];
}

type Result = {
  type: ProgressionRecommendation['type'];
  message: string;
  suggestedWeight?: number;
  suggestedReps?: number;
} | null;

/**
 * Get a realistic weight increment based on equipment type and current weight.
 * Dumbbells: +1kg up to 10kg, +2.5kg up to 25kg, +5kg above.
 * Machines: +5kg up to 30kg, +7.5kg above.
 * Barbell/cable/other: +2.5kg up to 60kg, +5kg above.
 */
export function getSmartIncrement(currentWeight: number, equipment: string): number {
  const w = Math.abs(currentWeight);
  const eq = equipment.toLowerCase();

  if (eq.includes('dumbbell')) {
    if (w < 10) return 1;
    if (w < 25) return 2.5;
    return 5;
  }
  if (eq.includes('machine') || eq.includes('leverage') || eq.includes('smith')) {
    if (w < 30) return 5;
    return 7.5;
  }
  // Barbell, cable, kettlebell, body weight, other
  if (w < 60) return 2.5;
  return 5;
}

/** Round to nearest 0.5kg */
export function roundWeight(w: number): number {
  return Math.round(w * 2) / 2;
}

/**
 * Calculate the rep target after a weight increase.
 * When weight goes up, reps should drop meaningfully:
 * - 12+ reps → drop to 8
 * - 10-11 reps → drop to 7
 * - 8-9 reps → drop to 6
 * - 6-7 reps → drop to 5
 * - 4-5 reps → drop to 3
 * - 1-3 reps → stay the same
 */
export function getRepDropTarget(currentTargetReps: number): number {
  if (currentTargetReps >= 12) return 8;
  if (currentTargetReps >= 10) return 7;
  if (currentTargetReps >= 8) return 6;
  if (currentTargetReps >= 6) return 5;
  if (currentTargetReps >= 4) return 3;
  return currentTargetReps;
}

/** Suffix for messages reminding user about gym-specific weights */
const CLOSEST_NOTE = ' Use closest weight available at your gym.';

/**
 * Evaluate an exercise's recent history against its progression config
 * and produce a recommendation.
 */
export function evaluateProgression(
  exerciseId: number,
  config: ExerciseProgressionConfig
): Result {
  const recentSessions = getRecentSessions(exerciseId, 10);
  if (recentSessions.length === 0) return null;

  // Look up equipment for smart increment
  const exRow = db.getFirstSync<{ equipment: string }>(
    "SELECT equipment FROM exercises WHERE id = ?", [exerciseId]
  );
  const equipment = exRow?.equipment ?? 'Other';

  const progressionType = config.progressionType || 'reps';

  if (progressionType === 'weight_only') {
    return evaluateWeightOnly(recentSessions, config, equipment);
  }
  if (progressionType === 'time') {
    return evaluateTimeBased(recentSessions, config, equipment);
  }

  // Default: reps-based progression
  const latestWeight = recentSessions[0].sets[0]?.weight ?? 0;
  const stagnationThreshold = config.sensitivity === 'aggressive' ? 2 : config.sensitivity === 'moderate' ? 3 : 5;

  if (config.progressionRule === 'double_progression') {
    return evaluateDoubleProgression(recentSessions, config, latestWeight, stagnationThreshold, equipment);
  }
  return evaluateLinearProgression(recentSessions, config, latestWeight, stagnationThreshold, equipment);
}

/**
 * Weight-only progression (e.g. Farmer's Walk, carries, sleds).
 * Fixed reps/distance — hit target = increase weight, miss = try again.
 * Never suggests more reps.
 */
function evaluateWeightOnly(
  sessions: SessionData[],
  config: ExerciseProgressionConfig,
  equipment: string
): Result {
  const latest = sessions[0];
  const currentWeight = latest.sets[0]?.weight ?? 0;
  const targetReps = config.repRangeMax;
  const increment = getSmartIncrement(currentWeight, equipment);

  const allHitTarget = latest.sets.every(s => s.reps >= targetReps);

  if (allHitTarget) {
    const isCounterweight = currentWeight < 0;
    const newWeight = roundWeight(currentWeight + increment);
    const label = isCounterweight
      ? `Hit target. Reduce assistance to ${Math.abs(newWeight)}kg.${CLOSEST_NOTE}`
      : `Hit target at ${currentWeight}kg. Increase to ${newWeight}kg.${CLOSEST_NOTE}`;
    return { type: 'PROGRESS_WEIGHT', message: label, suggestedWeight: newWeight };
  }

  const stagnationThreshold = config.sensitivity === 'aggressive' ? 2 : config.sensitivity === 'moderate' ? 3 : 5;
  const failCount = sessions.slice(0, stagnationThreshold).filter(s =>
    s.sets.some(set => set.reps < targetReps)
  ).length;

  if (failCount >= stagnationThreshold) {
    const isCounterweight = currentWeight < 0;
    const deloadWeight = isCounterweight
      ? roundWeight(currentWeight - increment)
      : roundWeight(currentWeight - increment);
    const label = isCounterweight
      ? `Missed target for ${failCount} sessions. Increase assistance to ${Math.abs(deloadWeight)}kg.${CLOSEST_NOTE}`
      : `Missed target for ${failCount} sessions. Deload to ${deloadWeight}kg.${CLOSEST_NOTE}`;
    return { type: 'DELOAD', message: label, suggestedWeight: deloadWeight };
  }

  return {
    type: 'PROGRESS_WEIGHT',
    message: `Keep at ${currentWeight}kg and aim to complete all sets at target.`,
    suggestedWeight: currentWeight,
  };
}

/**
 * Time-based progression (e.g. planks, holds, hangs).
 * "Reps" represent seconds. Progress by increasing hold time,
 * then add weight once time target is hit.
 */
function evaluateTimeBased(
  sessions: SessionData[],
  config: ExerciseProgressionConfig,
  equipment: string
): Result {
  const latest = sessions[0];
  const currentWeight = latest.sets[0]?.weight ?? 0;
  const targetTime = config.repRangeMax;
  const increment = getSmartIncrement(currentWeight, equipment);

  const allHitTarget = latest.sets.every(s => s.reps >= targetTime);

  if (allHitTarget && currentWeight > 0) {
    const newWeight = roundWeight(currentWeight + increment);
    return {
      type: 'PROGRESS_WEIGHT',
      message: `Held ${targetTime}s at ${currentWeight}kg. Increase to ${newWeight}kg and aim for ${config.repRangeMin}s.${CLOSEST_NOTE}`,
      suggestedWeight: newWeight,
      suggestedReps: config.repRangeMin,
    };
  }

  if (allHitTarget) {
    return {
      type: 'PROGRESS_WEIGHT',
      message: `Held ${targetTime}s on all sets. Add ${increment}kg and aim for ${config.repRangeMin}s.${CLOSEST_NOTE}`,
      suggestedWeight: increment,
      suggestedReps: config.repRangeMin,
    };
  }

  const avgTime = Math.round(latest.sets.reduce((sum, s) => sum + s.reps, 0) / latest.sets.length);
  const nextTarget = Math.min(avgTime + 5, targetTime);
  return {
    type: 'PROGRESS_REPS',
    message: currentWeight > 0
      ? `Keep at ${currentWeight}kg and aim for ${nextTarget}s holds.`
      : `Aim for ${nextTarget}s holds per set.`,
    suggestedReps: nextTarget,
  };
}

function evaluateDoubleProgression(
  sessions: SessionData[],
  config: ExerciseProgressionConfig,
  currentWeight: number,
  stagnationThreshold: number,
  equipment: string
): Result {
  const latest = sessions[0];
  const increment = getSmartIncrement(currentWeight, equipment);

  const allHitMax = latest.sets.every(s => s.reps >= config.repRangeMax);
  if (allHitMax) {
    const isCounterweight = currentWeight < 0;
    const newWeight = roundWeight(currentWeight + increment);
    const dropReps = getRepDropTarget(config.repRangeMax);
    const label = isCounterweight
      ? `All sets hit ${config.repRangeMax} reps. Reduce assistance to ${Math.abs(newWeight)}kg.${CLOSEST_NOTE}`
      : `All sets hit ${config.repRangeMax} reps. Increase to ${newWeight}kg and aim for ${dropReps} reps.${CLOSEST_NOTE}`;
    return {
      type: 'PROGRESS_WEIGHT',
      message: label,
      suggestedWeight: newWeight,
      suggestedReps: dropReps,
    };
  }

  const belowMinCount = sessions.slice(0, stagnationThreshold).filter(s =>
    s.sets.some(set => set.reps < config.repRangeMin)
  ).length;

  if (belowMinCount >= 3) {
    const isCounterweight = currentWeight < 0;
    const deloadWeight = isCounterweight
      ? roundWeight(currentWeight - increment)
      : roundWeight(currentWeight - increment);
    const label = isCounterweight
      ? `Struggling below ${config.repRangeMin} reps for ${belowMinCount} sessions. Increase assistance to ${Math.abs(deloadWeight)}kg.${CLOSEST_NOTE}`
      : `Struggling below ${config.repRangeMin} reps for ${belowMinCount} sessions. Deload to ${deloadWeight}kg.${CLOSEST_NOTE}`;
    return { type: 'DELOAD', message: label, suggestedWeight: deloadWeight };
  }

  if (sessions.length >= stagnationThreshold) {
    const recentWeights = sessions.slice(0, stagnationThreshold).map(s => s.sets[0]?.weight);
    const recentMaxReps = sessions.slice(0, stagnationThreshold).map(s => Math.max(...s.sets.map(set => set.reps)));
    const noProgress = recentWeights.every(w => w === recentWeights[0]) && recentMaxReps.every(r => r === recentMaxReps[0]);

    if (noProgress) {
      return {
        type: 'CHANGE_EXERCISE',
        message: `No progress in ${stagnationThreshold} sessions at ${currentWeight}kg. Consider swapping this exercise.`,
      };
    }
  }

  const avgReps = Math.round(latest.sets.reduce((sum, s) => sum + s.reps, 0) / latest.sets.length);
  return {
    type: 'PROGRESS_REPS',
    message: `Keep at ${currentWeight}kg and aim for ${Math.min(avgReps + 1, config.repRangeMax)} reps per set.`,
    suggestedReps: Math.min(avgReps + 1, config.repRangeMax),
  };
}

function evaluateLinearProgression(
  sessions: SessionData[],
  config: ExerciseProgressionConfig,
  currentWeight: number,
  stagnationThreshold: number,
  equipment: string
): Result {
  const latest = sessions[0];
  const increment = getSmartIncrement(currentWeight, equipment);
  const allHitTarget = latest.sets.every(s => s.reps >= config.repRangeMin);

  if (allHitTarget) {
    const isCounterweight = currentWeight < 0;
    const newWeight = roundWeight(currentWeight + increment);
    const dropReps = getRepDropTarget(config.repRangeMin);
    const label = isCounterweight
      ? `Hit target reps. Reduce assistance to ${Math.abs(newWeight)}kg next session.${CLOSEST_NOTE}`
      : `Hit target reps. Increase to ${newWeight}kg and aim for ${dropReps} reps.${CLOSEST_NOTE}`;
    return { type: 'PROGRESS_WEIGHT', message: label, suggestedWeight: newWeight, suggestedReps: dropReps };
  }

  if (sessions.length >= stagnationThreshold) {
    const recentWeights = sessions.slice(0, stagnationThreshold).map(s => s.sets[0]?.weight);
    if (recentWeights.every(w => w === recentWeights[0])) {
      const isCounterweight = currentWeight < 0;
      const deloadWeight = isCounterweight
        ? roundWeight(currentWeight - increment)
        : roundWeight(currentWeight - increment);
      const label = isCounterweight
        ? `Stuck at ${Math.abs(currentWeight)}kg assistance for ${stagnationThreshold} sessions. Try increasing assistance to ${Math.abs(deloadWeight)}kg.${CLOSEST_NOTE}`
        : `Stuck at ${currentWeight}kg for ${stagnationThreshold} sessions. Try deloading to ${deloadWeight}kg.${CLOSEST_NOTE}`;
      return { type: 'DELOAD', message: label, suggestedWeight: deloadWeight };
    }
  }

  return {
    type: 'PROGRESS_REPS',
    message: `Keep working at ${currentWeight}kg until you hit ${config.repRangeMin} reps on all sets.`,
  };
}

function getRecentSessions(exerciseId: number, limit: number): SessionData[] {
  const rows = db.getAllSync<{ date: string; reps: number; weight: number }>(
    `SELECT wl.date, sl.reps, sl.weight
     FROM set_logs sl
     JOIN workout_logs wl ON sl.workout_log_id = wl.id
     WHERE sl.exercise_id = ? AND sl.is_drop_set = 0
     ORDER BY wl.date DESC, sl.set_number`,
    [exerciseId]
  );

  const sessionMap = new Map<string, { reps: number; weight: number }[]>();
  for (const row of rows) {
    const arr = sessionMap.get(row.date) || [];
    arr.push({ reps: row.reps, weight: row.weight });
    sessionMap.set(row.date, arr);
  }

  return Array.from(sessionMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
    .map(([date, sets]) => ({ date, sets }));
}
