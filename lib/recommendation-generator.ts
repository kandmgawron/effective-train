import db from './database';
import { ExerciseProgressionConfig } from '@/types';
import { evaluateProgression } from './progression-engine';
import { format } from 'date-fns';

/**
 * Derive rep range from a template's target_reps.
 * e.g. target 8 → range 6-8, target 12 → range 10-12, target 4 → range 3-5
 */
function deriveRepRange(targetReps: number): { min: number; max: number } {
  if (targetReps <= 5) return { min: Math.max(1, targetReps - 1), max: targetReps + 1 };
  if (targetReps <= 8) return { min: targetReps - 2, max: targetReps };
  return { min: targetReps - 2, max: targetReps };
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
    // Look up exercise name and template target_reps
    const exInfo = db.getFirstSync<{ name: string; movementType: string }>(
      "SELECT name, COALESCE(movement_type, 'compound') as movementType FROM exercises WHERE id = ?",
      [exerciseId]
    );
    const templateEx = db.getFirstSync<{ targetReps: number }>(
      'SELECT target_reps as targetReps FROM template_exercises WHERE exercise_id = ? LIMIT 1',
      [exerciseId]
    );
    const targetReps = templateEx?.targetReps ?? 10;
    const { min: repMin, max: repMax } = deriveRepRange(targetReps);
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
      // Sync rep range if still on old defaults
      const needsRepSync = config.repRangeMin === 8 && config.repRangeMax === 12 && (repMin !== 8 || repMax !== 12);
      const needsTypeSync = (config.progressionType || 'reps') === 'reps' && detectedType !== 'reps';
      if (needsRepSync || needsTypeSync) {
        db.runSync(
          'UPDATE exercise_progression_config SET rep_range_min = ?, rep_range_max = ?, progression_type = ? WHERE id = ?',
          [needsRepSync ? repMin : config.repRangeMin, needsRepSync ? repMax : config.repRangeMax, needsTypeSync ? detectedType : config.progressionType, config.id]
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
