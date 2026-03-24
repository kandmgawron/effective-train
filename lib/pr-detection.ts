import db from './database';
import { PersonalRecord } from '@/types';
import { getEffectiveWeight, getLatestBodyweight } from './effective-weight';

interface SetData {
  exerciseId: number;
  exerciseName: string;
  reps: number;
  weight: number;
}

/**
 * Detect personal records from a completed workout.
 * Checks max_weight, max_volume (reps × weight), and estimated_1rm (Epley).
 * Returns array of new PRs that were inserted.
 */
export function detectPersonalRecords(workoutLogId: number, date: string): PersonalRecord[] {
  const sets = db.getAllSync<SetData>(
    `SELECT sl.exercise_id as exerciseId, e.name as exerciseName, sl.reps, sl.weight
     FROM set_logs sl
     JOIN exercises e ON sl.exercise_id = e.id
     WHERE sl.workout_log_id = ? AND sl.is_drop_set = 0`,
    [workoutLogId]
  );

  if (sets.length === 0) return [];

  // Group sets by exercise
  const byExercise = new Map<number, SetData[]>();
  for (const s of sets) {
    const arr = byExercise.get(s.exerciseId) || [];
    arr.push(s);
    byExercise.set(s.exerciseId, arr);
  }

  const newPRs: PersonalRecord[] = [];
  const bodyweight = getLatestBodyweight();

  for (const [exerciseId, exSets] of byExercise) {
    const exerciseName = exSets[0].exerciseName;
    const hasCounterweight = exSets.some(s => s.weight < 0);

    // Use effective weight for counterweight exercises
    const effectiveSets = exSets.map(s => ({
      ...s,
      effectiveWeight: hasCounterweight ? getEffectiveWeight(s.weight, bodyweight) : s.weight,
    }));

    // Max weight (heaviest single set — effective weight)
    const maxWeight = Math.max(...effectiveSets.map(s => s.effectiveWeight));
    // Max volume (highest reps × effective weight single set)
    const maxVolume = Math.max(...effectiveSets.map(s => s.reps * s.effectiveWeight));
    // Estimated 1RM (Epley: weight × (1 + reps/30)), best across sets
    const max1RM = Math.max(...effectiveSets.filter(s => s.effectiveWeight > 0).map(s =>
      s.reps === 1 ? s.effectiveWeight : s.effectiveWeight * (1 + s.reps / 30)
    ));

    const checks: { type: PersonalRecord['recordType']; value: number }[] = [
      { type: 'max_weight', value: maxWeight },
      { type: 'max_volume', value: maxVolume },
      { type: 'estimated_1rm', value: Math.round(max1RM * 10) / 10 },
    ];

    for (const check of checks) {
      if (check.value <= 0) continue;

      const existing = db.getFirstSync<{ value: number }>(
        'SELECT value FROM personal_records WHERE exercise_id = ? AND record_type = ? ORDER BY value DESC LIMIT 1',
        [exerciseId, check.type]
      );

      if (!existing || check.value > existing.value) {
        const result = db.runSync(
          'INSERT INTO personal_records (exercise_id, record_type, value, date, workout_log_id) VALUES (?, ?, ?, ?, ?)',
          [exerciseId, check.type, check.value, date, workoutLogId]
        );
        newPRs.push({
          id: Number(result.lastInsertRowId),
          exerciseId,
          exerciseName,
          recordType: check.type,
          value: check.value,
          date,
          workoutLogId,
        });
      }
    }
  }

  return newPRs;
}
