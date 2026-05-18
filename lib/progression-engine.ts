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
 * Dumbbells: +1kg up to 10kg, +2kg up to 20kg, +2.5kg above.
 * Machines/cables: +5kg flat.
 * Barbell/other: +2.5kg up to 60kg, +5kg above.
 */
export function getSmartIncrement(currentWeight: number, equipment: string): number {
  const w = Math.abs(currentWeight);
  const eq = equipment.toLowerCase();

  if (eq.includes('dumbbell')) {
    if (w < 10) return 1;
    if (w < 20) return 2;
    return 2.5;
  }
  if (eq.includes('machine') || eq.includes('cable') || eq.includes('leverage') || eq.includes('smith')) {
    return 5;
  }
  // Barbell, kettlebell, body weight, other
  if (w < 60) return 2.5;
  return 5;
}

/** Round to nearest 0.5kg */
export function roundWeight(w: number): number {
  return Math.round(w * 2) / 2;
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

  // Require at least 2 sessions before generating any recommendation
  if (recentSessions.length < 2) return null;

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
  const stagnationThreshold = config.sensitivity === 'aggressive' ? 3 : config.sensitivity === 'moderate' ? 4 : 5;

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

  // Deload: no progress for 3 sessions
  if (sessions.length >= 3) {
    const last3 = sessions.slice(0, 3);
    const weights = last3.map(s => s.sets[0]?.weight ?? 0);
    const sameWeight = weights.every(w => w === weights[0]);
    const maxRepsNewest = Math.max(...last3[0].sets.map(s => s.reps));
    const maxRepsOldest = Math.max(...last3[2].sets.map(s => s.reps));

    if (sameWeight && maxRepsNewest <= maxRepsOldest) {
      const isCounterweight = currentWeight < 0;
      const deloadWeight = isCounterweight
        ? roundWeight(currentWeight - increment)
        : roundWeight(currentWeight - increment);
      const label = isCounterweight
        ? `No progress for 3 sessions. Increase assistance to ${Math.abs(deloadWeight)}kg.${CLOSEST_NOTE}`
        : `No progress for 3 sessions. Deload to ${deloadWeight}kg.${CLOSEST_NOTE}`;
      return { type: 'DELOAD', message: label, suggestedWeight: deloadWeight };
    }
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

/**
 * Double progression: increase reps within range, then increase weight and reset to repRangeMin.
 *
 * Rules:
 * 1. PROGRESS_WEIGHT: ≥ 2/3 of sets hit repRangeMax → increase weight, drop reps to repRangeMin
 * 2. DELOAD: same weight for 3 sessions AND max reps in newest ≤ max reps in oldest → drop weight, set reps to max
 * 3. CHANGE_EXERCISE: no progress for stagnationThreshold sessions (weight AND max reps identical)
 * 4. PROGRESS_REPS: only if reps are stagnant for 2+ sessions (not trending up already)
 */
function evaluateDoubleProgression(
  sessions: SessionData[],
  config: ExerciseProgressionConfig,
  currentWeight: number,
  stagnationThreshold: number,
  equipment: string
): Result {
  const latest = sessions[0];
  const increment = getSmartIncrement(currentWeight, equipment);

  // 1. Weight increase: ≥ 2/3 of sets hit repRangeMax
  const setsHittingMax = latest.sets.filter(s => s.reps >= config.repRangeMax).length;
  const threshold = Math.ceil(latest.sets.length * 2 / 3);

  if (setsHittingMax >= threshold) {
    const isCounterweight = currentWeight < 0;
    const newWeight = roundWeight(currentWeight + increment);
    const label = isCounterweight
      ? `${setsHittingMax}/${latest.sets.length} sets hit ${config.repRangeMax} reps. Reduce assistance to ${Math.abs(newWeight)}kg and aim for ${config.repRangeMin} reps.${CLOSEST_NOTE}`
      : `${setsHittingMax}/${latest.sets.length} sets hit ${config.repRangeMax} reps. Increase to ${newWeight}kg and aim for ${config.repRangeMin} reps.${CLOSEST_NOTE}`;
    return {
      type: 'PROGRESS_WEIGHT',
      message: label,
      suggestedWeight: newWeight,
      suggestedReps: config.repRangeMin,
    };
  }

  // 2. Deload: same weight for 3 sessions AND max reps not improving
  if (sessions.length >= 3) {
    const last3 = sessions.slice(0, 3);
    const weights = last3.map(s => s.sets[0]?.weight ?? 0);
    const sameWeight = weights.every(w => w === weights[0]);
    const maxRepsNewest = Math.max(...last3[0].sets.map(s => s.reps));
    const maxRepsOldest = Math.max(...last3[2].sets.map(s => s.reps));

    if (sameWeight && maxRepsNewest <= maxRepsOldest) {
      const isCounterweight = currentWeight < 0;
      const deloadWeight = isCounterweight
        ? roundWeight(currentWeight - increment)
        : roundWeight(currentWeight - increment);
      const label = isCounterweight
        ? `No progress for 3 sessions. Increase assistance to ${Math.abs(deloadWeight)}kg and aim for ${config.repRangeMax} reps.${CLOSEST_NOTE}`
        : `No progress for 3 sessions at ${currentWeight}kg. Deload to ${deloadWeight}kg and aim for ${config.repRangeMax} reps.${CLOSEST_NOTE}`;
      return { type: 'DELOAD', message: label, suggestedWeight: deloadWeight, suggestedReps: config.repRangeMax };
    }
  }

  // 3. Change exercise: no progress at all for stagnationThreshold sessions
  if (sessions.length >= stagnationThreshold) {
    const recent = sessions.slice(0, stagnationThreshold);
    const recentWeights = recent.map(s => s.sets[0]?.weight ?? 0);
    const recentMaxReps = recent.map(s => Math.max(...s.sets.map(set => set.reps)));
    const noProgress = recentWeights.every(w => w === recentWeights[0]) && recentMaxReps.every(r => r === recentMaxReps[0]);

    if (noProgress) {
      return {
        type: 'CHANGE_EXERCISE',
        message: `No progress in ${stagnationThreshold} sessions at ${currentWeight}kg. Consider swapping this exercise.`,
      };
    }
  }

  // 4. Progress reps: only suggest if reps are stagnant (not already trending up)
  const avgRepsLatest = latest.sets.reduce((sum, s) => sum + s.reps, 0) / latest.sets.length;
  const avgRepsPrev = sessions[1].sets.reduce((sum, s) => sum + s.reps, 0) / sessions[1].sets.length;

  // If reps are already trending up, no recommendation needed — user is progressing
  if (avgRepsLatest > avgRepsPrev) {
    return null;
  }

  // Reps are stagnant or declining — suggest aiming higher
  const targetReps = Math.min(Math.round(avgRepsLatest) + 1, config.repRangeMax);
  return {
    type: 'PROGRESS_REPS',
    message: `Keep at ${currentWeight}kg and aim for ${targetReps} reps per set.`,
    suggestedReps: targetReps,
  };
}

/**
 * Linear progression: hit target reps → increase weight.
 *
 * Rules:
 * 1. PROGRESS_WEIGHT: all sets hit repRangeMin → increase weight, drop reps to repRangeMin (reset)
 * 2. DELOAD: same weight for 3 sessions AND max reps not improving
 * 3. PROGRESS_REPS: only if stagnant
 */
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
    const label = isCounterweight
      ? `Hit target reps. Reduce assistance to ${Math.abs(newWeight)}kg next session.${CLOSEST_NOTE}`
      : `Hit target reps. Increase to ${newWeight}kg and aim for ${config.repRangeMin} reps.${CLOSEST_NOTE}`;
    return { type: 'PROGRESS_WEIGHT', message: label, suggestedWeight: newWeight, suggestedReps: config.repRangeMin };
  }

  // Deload: same weight for 3 sessions AND max reps not improving
  if (sessions.length >= 3) {
    const last3 = sessions.slice(0, 3);
    const weights = last3.map(s => s.sets[0]?.weight ?? 0);
    const sameWeight = weights.every(w => w === weights[0]);
    const maxRepsNewest = Math.max(...last3[0].sets.map(s => s.reps));
    const maxRepsOldest = Math.max(...last3[2].sets.map(s => s.reps));

    if (sameWeight && maxRepsNewest <= maxRepsOldest) {
      const isCounterweight = currentWeight < 0;
      const deloadWeight = isCounterweight
        ? roundWeight(currentWeight - increment)
        : roundWeight(currentWeight - increment);
      const label = isCounterweight
        ? `No progress for 3 sessions. Increase assistance to ${Math.abs(deloadWeight)}kg and aim for ${config.repRangeMax} reps.${CLOSEST_NOTE}`
        : `No progress for 3 sessions at ${currentWeight}kg. Deload to ${deloadWeight}kg and aim for ${config.repRangeMax} reps.${CLOSEST_NOTE}`;
      return { type: 'DELOAD', message: label, suggestedWeight: deloadWeight, suggestedReps: config.repRangeMax };
    }
  }

  // Progress reps: only if stagnant
  const avgRepsLatest = latest.sets.reduce((sum, s) => sum + s.reps, 0) / latest.sets.length;
  const avgRepsPrev = sessions[1].sets.reduce((sum, s) => sum + s.reps, 0) / sessions[1].sets.length;

  if (avgRepsLatest > avgRepsPrev) {
    return null; // Already progressing, no recommendation needed
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
