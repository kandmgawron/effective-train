import db from './database';
import { ExerciseProgressionConfig } from '@/types';
import { evaluateProgression } from './progression-engine';
import { format } from 'date-fns';

/**
 * Derive rep range from exercise category:
 * - Isolation exercises: 12-15 reps
 * - Machine/cable compound exercises: 8-12 reps
 * - Free-weight compound exercises: 6-8 reps
 */
function deriveRepRange(movementType: string, equipment: string): { min: number; max: number } {
  const eq = equipment.toLowerCase();
  const isIsolation = movementType === 'isolation';
  const isMachine = eq.includes('machine') || eq.includes('cable') || eq.includes('leverage') || eq.includes('smith');

  if (isIsolation) return { min: 12, max: 15 };
  if (isMachine) return { min: 8, max: 12 };
  return { min: 6, max: 8 };
}

/**
 * Auto-detect progression type from exercise name.
 * - weight_only: carries, walks, sleds — fixed distance/reps, progress via weight
 * - time: planks, holds, hangs — progress via duration
 * - reps: everything else — standard double progression
 */
function detectProgressionType(exerciseName: string): 'reps' | 'weight_only' | 'time' {
  const name = exerciseName.toLowerCase();
  if (name.includes('farmer') || name.includes('carry') || name.includes('sled') || name.includes('prowler')) {
    return 'weight_only';
  }
  if (name.includes('plank') || name.includes('hold') || name.includes('hang') || name.includes('wall sit') || name.includes('l-sit')) {
    return 'time';
  }
  return 'reps';
}

/**
 * Run progression engine for each exercise in a completed workout
 * and store recommendations.
 */
export function generateRecommendations(workoutLogId: number): void {
  const exercises = db.getAllSync<{ exerciseId: number }>(
    'SELECT DISTINCT exercise_id as exerciseId FROM set_logs WHERE workout_log_id = ?',
    [workoutLogId]
  );

  const now = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

  for (const { exerciseId } of exercises) {
    // Look up exercise info for category-based rep range
    const exInfo = db.getFirstSync<{ name: string; movementType: string; equipment: string }>(
      "SELECT name, COALESCE(movement_type, 'compound') as movementType, COALESCE(equipment, '') as equipment FROM exercises WHERE id = ?",
      [exerciseId]
    );
    const { min: repMin, max: repMax } = deriveRepRange(exInfo?.movementType ?? 'compound', exInfo?.equipment ?? '');
    const detectedType = detectProgressionType(exInfo?.name ?? '');

    // Get or create config
    let config = db.getFirstSync<any>(
      `SELECT id, exercise_id as exerciseId, progression_rule as progressionRule,
              progression_type as progressionType,
              rep_range_min as repRangeMin, rep_range_max as repRangeMax,
              weight_increment as weightIncrement, sensitivity
       FROM exercise_progression_config WHERE exercise_id = ?`,
      [exerciseId]
    );

    if (!config) {
      const defaultIncrement = exInfo?.movementType === 'isolation' ? 1.25 : 2.5;
      db.runSync(
        'INSERT INTO exercise_progression_config (exercise_id, weight_increment, rep_range_min, rep_range_max, progression_type) VALUES (?, ?, ?, ?, ?)',
        [exerciseId, defaultIncrement, repMin, repMax, detectedType]
      );
    } else {
      // Only sync progression_type if it was auto-detected as non-standard
      const needsTypeSync = (config.progressionType || 'reps') === 'reps' && detectedType !== 'reps';
      if (needsTypeSync) {
        db.runSync(
          'UPDATE exercise_progression_config SET progression_type = ? WHERE id = ?',
          [detectedType, config.id]
        );
      }
    }

    // Re-fetch config after potential update
    config = db.getFirstSync<any>(
      `SELECT id, exercise_id as exerciseId, progression_rule as progressionRule,
              progression_type as progressionType,
              rep_range_min as repRangeMin, rep_range_max as repRangeMax,
              weight_increment as weightIncrement, sensitivity
       FROM exercise_progression_config WHERE exercise_id = ?`,
      [exerciseId]
    );
    if (!config) continue;

    const result = evaluateProgression(exerciseId, config as ExerciseProgressionConfig);
    if (!result) continue;

    // Expire old active recommendations for this exercise
    db.runSync(
      `UPDATE progression_recommendations SET status = 'dismissed', dismissed_at = ? WHERE exercise_id = ? AND status = 'active'`,
      [now, exerciseId]
    );

    db.runSync(
      `INSERT INTO progression_recommendations (exercise_id, type, message, suggested_weight, suggested_reps, suggested_exercise_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [exerciseId, result.type, result.message, result.suggestedWeight ?? null, result.suggestedReps ?? null, null, now]
    );
  }
}
