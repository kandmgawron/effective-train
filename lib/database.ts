import * as SQLite from 'expo-sqlite';
import exercises from './exercises.json';
import { getSpecificEquipment } from './equipment-mapping';
import { getCorrectBodyPart } from './body-part-fixer';
import { getExerciseDescription } from './exercise-descriptions';
import { getStandardizedName } from './exercise-name-fixer';

const db = SQLite.openDatabaseSync('gymtracker.db');

export const initDatabase = () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      body_part TEXT NOT NULL,
      equipment TEXT NOT NULL,
      instructions TEXT,
      is_custom INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workout_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      estimated_duration INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS template_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      sets INTEGER NOT NULL,
      target_reps INTEGER NOT NULL,
      rest_time INTEGER NOT NULL,
      exercise_order INTEGER NOT NULL,
      superset_group INTEGER,
      FOREIGN KEY (template_id) REFERENCES workout_templates(id),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS workout_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER,
      date TEXT NOT NULL,
      duration INTEGER,
      FOREIGN KEY (template_id) REFERENCES workout_templates(id)
    );

    CREATE TABLE IF NOT EXISTS set_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_log_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      set_number INTEGER NOT NULL,
      reps INTEGER NOT NULL,
      weight REAL NOT NULL,
      is_drop_set INTEGER DEFAULT 0,
      FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS gym_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      equipment TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      is_travel_mode INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON workout_logs(date);
    CREATE INDEX IF NOT EXISTS idx_set_logs_exercise ON set_logs(exercise_id);
  `);

  // New tables for Phase 2+
  db.execSync(`
    CREATE TABLE IF NOT EXISTS personal_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL,
      record_type TEXT NOT NULL,
      value REAL NOT NULL,
      date TEXT NOT NULL,
      workout_log_id INTEGER,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS exercise_progression_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL UNIQUE,
      progression_rule TEXT DEFAULT 'double_progression',
      rep_range_min INTEGER DEFAULT 8,
      rep_range_max INTEGER DEFAULT 12,
      weight_increment REAL DEFAULT 2.5,
      sensitivity TEXT DEFAULT 'moderate',
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS progression_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      suggested_weight REAL,
      suggested_reps INTEGER,
      suggested_exercise_id INTEGER,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      dismissed_at TEXT,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bodyweight_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weight REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_personal_records_exercise ON personal_records(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_progression_recs_exercise ON progression_recommendations(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_progression_recs_status ON progression_recommendations(status);
  `);

  // Migrations: add columns if missing
  const migrations = [
    'ALTER TABLE template_exercises ADD COLUMN superset_group INTEGER',
    'ALTER TABLE workout_templates ADD COLUMN is_active INTEGER DEFAULT 1',
    'ALTER TABLE exercises ADD COLUMN movement_type TEXT DEFAULT \'compound\'',
    'ALTER TABLE set_logs ADD COLUMN notes TEXT',
    "ALTER TABLE exercise_progression_config ADD COLUMN progression_type TEXT DEFAULT 'reps'",
    "ALTER TABLE exercises ADD COLUMN exercise_type TEXT DEFAULT 'standard'",
    "ALTER TABLE exercises ADD COLUMN specific_equipment TEXT",
  ];
  for (const sql of migrations) {
    try { db.runSync(sql); } catch (_) { /* column already exists */ }
  }

  // Clean up orphaned superset groups (groups with fewer than 2 members)
  // Run unconditionally on every startup to fix stale data
  const allTemplateIds = db.getAllSync<{ id: number }>('SELECT id FROM workout_templates');
  for (const t of allTemplateIds) {
    const rows = db.getAllSync<{ id: number; superset_group: number | null }>(
      'SELECT id, superset_group FROM template_exercises WHERE template_id = ?',
      [t.id]
    );
    const groupCounts: Record<number, number> = {};
    for (const r of rows) {
      if (r.superset_group != null) {
        groupCounts[r.superset_group] = (groupCounts[r.superset_group] || 0) + 1;
      }
    }
    for (const r of rows) {
      if (r.superset_group != null && (groupCounts[r.superset_group] || 0) < 2) {
        db.runSync('UPDATE template_exercises SET superset_group = NULL WHERE id = ?', [r.id]);
      }
    }
  }

  // Recalculate estimated_duration for all templates using current formula
  for (const t of allTemplateIds) {
    const exs = db.getAllSync<{ sets: number; rest_time: number; superset_group: number | null }>(
      'SELECT sets, rest_time, superset_group FROM template_exercises WHERE template_id = ? ORDER BY exercise_order',
      [t.id]
    );
    const groupSets: Record<number, number> = {};
    let totalTime = 0;
    for (const ex of exs) {
      if (ex.superset_group != null) {
        if (!groupSets[ex.superset_group]) groupSets[ex.superset_group] = 0;
        groupSets[ex.superset_group] = Math.max(groupSets[ex.superset_group], ex.sets);
      } else {
        totalTime += ex.sets * (90 + ex.rest_time);
      }
    }
    const groupIds = Object.keys(groupSets);
    for (const g of groupIds) {
      const gn = Number(g);
      const members = exs.filter(e => e.superset_group === gn);
      const maxRest = Math.max(...members.map(e => e.rest_time));
      totalTime += groupSets[gn] * (members.length * 90 + maxRest);
    }
    db.runSync('UPDATE workout_templates SET estimated_duration = ? WHERE id = ?', [totalTime, t.id]);
  }

  // Set movement_type defaults for existing exercises
  try {
    // Isolation exercises: curls, raises, extensions, flyes, kickbacks, shrugs, calf raises, adductors, abductors
    db.runSync(`UPDATE exercises SET movement_type = 'isolation' WHERE movement_type = 'compound' AND (
      LOWER(name) LIKE '%curl%' OR LOWER(name) LIKE '%raise%' OR LOWER(name) LIKE '%extension%' OR
      LOWER(name) LIKE '%fly%' OR LOWER(name) LIKE '%flye%' OR LOWER(name) LIKE '%kickback%' OR
      LOWER(name) LIKE '%shrug%' OR LOWER(name) LIKE '%calf%' OR LOWER(name) LIKE '%adduct%' OR
      LOWER(name) LIKE '%abduct%' OR LOWER(name) LIKE '%pulldown%' OR LOWER(name) LIKE '%pushdown%' OR
      LOWER(name) LIKE '%face pull%' OR LOWER(name) LIKE '%wood chop%' OR LOWER(name) LIKE '%leg curl%' OR
      LOWER(name) LIKE '%leg extension%'
    )`);
  } catch (_) { /* already set */ }

  // Set exercise_type for known weight-only and time-based exercises
  try {
    db.runSync(`UPDATE exercises SET exercise_type = 'weight_only' WHERE exercise_type = 'standard' AND (
      LOWER(name) LIKE '%farmer%' OR LOWER(name) LIKE '%carry%' OR LOWER(name) LIKE '%sled%' OR LOWER(name) LIKE '%prowler%'
    )`);
    db.runSync(`UPDATE exercises SET exercise_type = 'time' WHERE exercise_type = 'standard' AND (
      LOWER(name) LIKE '%plank%' OR LOWER(name) LIKE '%hold%' OR LOWER(name) LIKE '%hang%' OR
      LOWER(name) LIKE '%wall sit%' OR LOWER(name) LIKE '%l-sit%'
    )`);
  } catch (_) { /* already set */ }

  // Migrate Band Assisted Pull-Up → Machine Assisted Pull-Up with negative weights
  try {
    const bandPullUp = db.getFirstSync<{ id: number }>(
      "SELECT id FROM exercises WHERE LOWER(name) = 'band assisted pull-up'"
    );
    if (bandPullUp) {
      db.runSync(
        "UPDATE exercises SET name = 'Machine Assisted Pull-Up', equipment = 'Machine' WHERE id = ?",
        [bandPullUp.id]
      );
      // Negate all positive weights for this exercise (counterweight)
      db.runSync(
        "UPDATE set_logs SET weight = -weight WHERE exercise_id = ? AND weight > 0",
        [bandPullUp.id]
      );
    }
  } catch (_) { /* already migrated */ }

  // Fix body_part assignments — the CSV had multiple body parts for compound exercises
  // but only the first (often wrong) one was used. This corrects the primary muscle group.
  const bodyPartFixes: [string, string][] = [
    // Legs — squats, presses, lunges
    ['Leg Press', 'Quadriceps'],
    ['Hack Squat', 'Quadriceps'],
    ['Goblet Squat', 'Quadriceps'],
    ['Front Squat (Clean Grip)', 'Quadriceps'],
    ['Front Squats with Two Kettlebells', 'Quadriceps'],
    ['Olympic Squat', 'Quadriceps'],
    ['Squat', 'Quadriceps'],
    ['Squat with Bands', 'Quadriceps'],
    ['Squat with Chains', 'Quadriceps'],
    ['Narrow Stance Hack Squats', 'Quadriceps'],
    ['Narrow Stance Leg Press', 'Quadriceps'],
    ['Narrow Stance Squats', 'Quadriceps'],
    ['Smith Machine Leg Press', 'Quadriceps'],
    ['Smith Machine Squat', 'Quadriceps'],
    ['Smith Machine Pistol Squat', 'Quadriceps'],
    ['Smith Single-Leg Split Squat', 'Quadriceps'],
    ['Lying Machine Squat', 'Quadriceps'],
    ['Weighted Squat', 'Quadriceps'],
    ['Weighted Sissy Squat', 'Quadriceps'],
    ['Wide Stance Barbell Squat', 'Quadriceps'],
    ['Zercher Squats', 'Quadriceps'],
    ['Speed Box Squat', 'Quadriceps'],
    ['Speed Squats', 'Quadriceps'],
    ['Jefferson Squats', 'Quadriceps'],
    ['Kettlebell Pistol Squat', 'Quadriceps'],
    ['One Leg Barbell Squat', 'Quadriceps'],
    ['One-Arm Overhead Kettlebell Squats', 'Quadriceps'],
    ['Kneeling Jump Squat', 'Quadriceps'],
    ['Kneeling Squat', 'Quadriceps'],
    ['Split Squats', 'Quadriceps'],
    ['Squat Jerk', 'Quadriceps'],
    ['Snatch Balance', 'Quadriceps'],
    ['Weighted Jump Squat', 'Quadriceps'],
    ['Lunge', 'Quadriceps'],
    ['Lunge Pass Through', 'Quadriceps'],
    ['Lunge Sprint', 'Quadriceps'],
    // Leg curl = hamstrings not calves
    ['Leg Curl', 'Hamstrings'],
    ['Lying Hamstring', 'Hamstrings'],
    // Glute ham raise = hamstrings/glutes not calves
    ['Glute Ham Raise', 'Hamstrings'],
    ['Natural Glute Ham Raise', 'Hamstrings'],
    // Hip lift = glutes not calves
    ['Hip Lift with Band', 'Gluteals'],
    // Reverse hyperextension = glutes not calves
    ['Reverse Hyperextension', 'Gluteals'],
    // Rows — should be lats/back not biceps
    ['Seated Cable Rows', 'Lats'],
    ['Seated Row', 'Lats'],
    ['Bent-Over Barbell Row', 'Lats'],
    ['Bent Over Two-Dumbbell Row', 'Lats'],
    ['One-Arm Dumbbell Row', 'Lats'],
    ['One-Arm Long Bar Row', 'Lats'],
    ['T-Bar Row with Handle', 'Lats'],
    ['Lying T-Bar Row', 'Lats'],
    ['Reverse Grip Bent-Over Rows', 'Lats'],
    ['Smith Machine Bent Over Row', 'Lats'],
    ['Lying Cambered Barbell Row', 'Lats'],
    ['Straight Bar Bench Mid Rows', 'Lats'],
    ['Seated One-Arm Cable Pulley Rows', 'Lats'],
    ['Kneeling High Pulley Row', 'Lats'],
    ['Kneeling Single-Arm High Pulley Row', 'Lats'],
    ['Low Pulley Row to Neck', 'Lats'],
    ['Shotgun Row', 'Lats'],
    ['Leverage Iso Row', 'Lats'],
    ['One-Arm Kettlebell Row', 'Lats'],
    ['Two-Arm Kettlebell Row', 'Lats'],
    ['Sled Row', 'Lats'],
    ['Suspended Row', 'Lats'],
    ['Inverted Row with Straps', 'Lats'],
    // Pulldowns/pull-ups = lats not biceps
    ['Wide-Grip Lat Pulldown', 'Lats'],
    ['Wide-Grip Pulldown Behind the Neck', 'Lats'],
    ['V-Bar Pulldown', 'Lats'],
    ['V-Bar Pull-Up', 'Lats'],
    ['Underhand Cable Pulldowns', 'Lats'],
    ['Full Range-of-Motion Lat Pulldown', 'Lats'],
    ['One Arm Lat Pulldown', 'Lats'],
    ['Rocky Pull-Ups/Pulldowns', 'Lats'],
    ['Wide-Grip Rear Pull-Up', 'Lats'],
    ['Weighted Pull Ups', 'Lats'],
    ['Gironda Sternum Chins', 'Lats'],
    ['Mixed Grip Chin', 'Lats'],
    ['One Arm Chin-Up', 'Lats'],
    ['Side to Side Chins', 'Lats'],
    ['Pull-Up', 'Lats'],
    ['Pulldown', 'Lats'],
    // Shoulder presses = deltoids not trapezius
    ['Seated Dumbbell Press', 'Deltoids'],
    ['Standing Dumbbell Press', 'Deltoids'],
    ['Standing Military Press', 'Deltoids'],
    ['Seated Barbell Military Press', 'Deltoids'],
    ['Machine Shoulder (Military) Press', 'Deltoids'],
    ['Leverage Shoulder Press', 'Deltoids'],
    ['Smith Machine Overhead Shoulder Press', 'Deltoids'],
    ['Standing Bradford Press', 'Deltoids'],
    ['Standing Barbell Press Behind Neck', 'Deltoids'],
    ['Standing Alternating Dumbbell Press', 'Deltoids'],
    ['Standing Palm-in One-Arm Dumbbell Press', 'Deltoids'],
    ['Standing Palms-in Dumbbell Press', 'Deltoids'],
    ['Seated Cable Shoulder Press', 'Deltoids'],
    ['Kettlebell Arnold Press', 'Deltoids'],
    ['Kettlebell Seated Press', 'Deltoids'],
    ['Kettlebell Seesaw Press', 'Deltoids'],
    ['Two-Arm Kettlebell Military Press', 'Deltoids'],
    ['One-Arm Kettlebell Military Press to the Side', 'Deltoids'],
    ['One-Arm Kettlebell Para Press', 'Deltoids'],
    ['Shoulder Press - with Bands', 'Deltoids'],
    // Lateral raises = deltoids not trapezius
    ['Side Lateral Raise', 'Deltoids'],
    ['Seated Side Lateral Raise', 'Deltoids'],
    ['Side Laterals to Front Raise', 'Deltoids'],
    ['Lateral Raise - with Bands', 'Deltoids'],
    ['One-Arm Side Laterals', 'Deltoids'],
    ['One-Arm Incline Lateral Raise', 'Deltoids'],
    ['Lying One-Arm Lateral Raise', 'Deltoids'],
    ['Standing Low-Pulley Deltoid Raise', 'Deltoids'],
    ['Standing Dumbbell Straight-Arm Front Delt Raise Above Head', 'Deltoids'],
    ['Standing Front Barbell Raise Over Head', 'Deltoids'],
    ['Front Cable Raise', 'Deltoids'],
    ['Front Dumbbell Raise', 'Deltoids'],
    ['Front Incline Dumbbell Raise', 'Deltoids'],
    ['Front Plate Raise', 'Deltoids'],
    ['Front Two-Dumbbell Raise', 'Deltoids'],
    // Rear delt = deltoids
    ['Reverse Flyes', 'Deltoids'],
    ['Reverse Flyes with External Rotation', 'Deltoids'],
    ['Reverse Machine Flyes', 'Deltoids'],
    ['Lying Rear Delt Raise', 'Deltoids'],
    ['Seated Bent-Over Rear Delt Raise', 'Deltoids'],
    // Upright rows = deltoids not biceps/trapezius
    ['Upright Barbell Row', 'Deltoids'],
    ['Upright Cable Row', 'Deltoids'],
    ['Standing Dumbbell Upright Row', 'Deltoids'],
    ['Smith Machine Upright Row', 'Deltoids'],
    ['Smith Machine One-Arm Upright Row', 'Deltoids'],
    ['Upright Row - with Bands', 'Deltoids'],
    // Push-up = chest not deltoids/abs
    ['Push-Up', 'Chest'],
    ['Push-Up Wide', 'Chest'],
    ['Incline Push-Up Medium', 'Chest'],
    ['Incline Push-Up Reverse Grip', 'Chest'],
    ['Incline Push-Up Wide', 'Chest'],
    // Deadlifts = hamstrings/glutes not back (lower)
    ['Barbell Deadlift', 'Hamstrings'],
    ['Romanian Deadlift', 'Hamstrings'],
    ['Romanian Deadlift from Deficit', 'Hamstrings'],
    ['Stiff-Legged Barbell Deadlift', 'Hamstrings'],
    ['Stiff-Legged Dumbbell Deadlift', 'Hamstrings'],
    ['Sumo Deadlift', 'Gluteals'],
    ['Trap Bar Deadlift', 'Quadriceps'],
    // Shrugs = trapezius not forearms
    ['Leverage Shrug', 'Trapezius'],
    ['Snatch Shrug', 'Trapezius'],
    // Pendlay row = lats not other
    ['Pendlay Row', 'Lats'],
    // Handstand push-ups = deltoids
    ['Handstand Push-Ups', 'Deltoids'],
    // Good morning = hamstrings
    ['Good Morning', 'Hamstrings'],
    ['Good Morning Off Pins', 'Hamstrings'],
    ['Stiff Leg Barbell Good Morning', 'Hamstrings'],
    // Chin-ups = lats not biceps
    ['Chin-Up', 'Lats'],
    ['Close-Grip Front Lat Pulldown', 'Lats'],
    // Band assisted pull-up = lats not abs
    ['Band Assisted Pull-Up', 'Lats'],
    // Bench press = chest not deltoids
    ['Bench Press', 'Chest'],
    ['Bench Press - Powerlifting', 'Chest'],
    ['Bench Press - with Bands', 'Chest'],
    // Cable rows = lats
    ['Cable Rope Rear-Delt Rows', 'Lats'],
    ['Cable Deadlifts', 'Hamstrings'],
    // Cable crossover = chest not deltoids
    ['Cable Crossover', 'Chest'],
    // Bent over low pulley = deltoids not back
    ['Bent Over Low-Pulley Side Lateral', 'Deltoids'],
    // Cable rear delt fly = deltoids
    ['Cable Rear Delt Fly', 'Deltoids'],
    // Back extension = back (lower) — already correct but confirm
    ['Back Extension', 'Back (Lower)'],
    // Bent over barbell row = lats not biceps
    ['Bent Over Barbell Row', 'Lats'],
    // Close-grip push-up = triceps not abs
    ['Close-Grip Push-Up Off of A Dumbbell', 'Triceps'],
    // Alternating cable shoulder press = deltoids not trapezius
    ['Alternating Cable Shoulder Press', 'Deltoids'],
    // Alternating deltoid raise = deltoids not trapezius
    ['Alternating Deltoid Raise', 'Deltoids'],
    // Bent over dumbbell rear delt raise = deltoids not trapezius
    ['Bent Over Dumbbell Rear Delt Raise with Head on Bench', 'Deltoids'],
    // Cable internal rotation = deltoids not trapezius
    ['Cable Internal Rotation', 'Deltoids'],
    // Chin to chest stretch = neck not trapezius
    // Scapular pull-up = lats
    ['Scapular Pull-Up', 'Lats'],
    // Push press = deltoids not quadriceps
    ['Push Press', 'Deltoids'],
    // Clean = back (lower) is ok but could be hamstrings
    // Prowler sprint = quadriceps not calves
    ['Prowler Sprint', 'Quadriceps'],
    // Ball leg curl = hamstrings not calves
    ['Ball Leg Curl', 'Hamstrings'],
    // Bicycling stationary = quadriceps not calves
    ['Bicycling, Stationary', 'Quadriceps'],
    // Walking treadmill = cardio
    ['Walking, Treadmill', 'Cardio'],
    // Bench jump = quadriceps not calves
    ['Bench Jump', 'Quadriceps'],
    // Rocket jump = quadriceps not calves
    ['Rocket Jump', 'Quadriceps'],
    // Scissors jump = quadriceps not gluteals
    ['Scissors Jump', 'Quadriceps'],
    // Cable hammer curls = biceps (already correct)
    // Cable preacher curl = biceps (already correct)
    // Dumbbell triceps extension = triceps not chest
    ['Lying Dumbbell Tricep Extension', 'Triceps'],
    ['Standing One-Arm Dumbbell Triceps Extension', 'Triceps'],
    ['Standing Overhead Barbell Triceps Extension', 'Triceps'],
    ['Standing Bent-Over One-Arm Dumbbell Triceps Extension', 'Triceps'],
    ['Incline Barbell Triceps Extension', 'Triceps'],
    ['Standing Low-Pulley One-Arm Triceps Extension', 'Triceps'],
    // Around the worlds / round the world = deltoids (shoulder rotation)
    ['Around the Worlds', 'Deltoids'],
    ['Round the World Shoulder Stretch', 'Deltoids'],
    // Arnold press = deltoids not trapezius
    ['Arnold Dumbbell Press', 'Deltoids'],
    // Arm circles = deltoids not trapezius
    ['Arm Circles', 'Deltoids'],
    // === Ab exercises: split into Upper Abs, Lower Abs, Obliques ===
    // Upper abs (crunches, sit-ups, cable crunches)
    ['3/4 Sit-Up', 'Abdominals (Upper)'],
    ['Ab Crunch Machine', 'Abdominals (Upper)'],
    ['Cable Crunch', 'Abdominals (Upper)'],
    ['Cable Reverse Crunch', 'Abdominals (Lower)'],
    ['Crunch', 'Abdominals (Upper)'],
    ['Crunch - Hands Overhead', 'Abdominals (Upper)'],
    ['Crunch - Legs on Exercise Ball', 'Abdominals (Upper)'],
    ['Cross Crunch', 'Obliques'],
    ['Cross-Body Crunch', 'Obliques'],
    ['Crunches', 'Abdominals (Upper)'],
    ['Decline Crunch', 'Abdominals (Upper)'],
    ['Exercise Ball Crunch', 'Abdominals (Upper)'],
    ['Weighted Crunches', 'Abdominals (Upper)'],
    ['Sit-Up', 'Abdominals (Upper)'],
    ['Weighted Sit-Ups - with Bands', 'Abdominals (Upper)'],
    ['BOSU Ball Cable Crunch with Side Bends', 'Obliques'],
    // Lower abs (leg raises, reverse crunches, hanging)
    ['Flat Bench Lying Leg Raise', 'Abdominals (Lower)'],
    ['Hanging Leg Raise', 'Abdominals (Lower)'],
    ['Hanging Pike', 'Abdominals (Lower)'],
    ['Jackknife Sit-Up', 'Abdominals (Lower)'],
    ['Knee/Hip Raise on Parallel Bars', 'Abdominals (Lower)'],
    ['Knee Raise on Parallel Bars', 'Abdominals (Lower)'],
    ['Lying Leg Raise', 'Abdominals (Lower)'],
    ['Reverse Crunch', 'Abdominals (Lower)'],
    ['Scissors', 'Abdominals (Lower)'],
    ['Scissor Kick', 'Abdominals (Lower)'],
    ['Flutter Kicks', 'Abdominals (Lower)'],
    ['Bottoms Up', 'Abdominals (Lower)'],
    ['Butt-Ups', 'Abdominals (Lower)'],
    ['Mountain Climbers', 'Abdominals (Lower)'],
    // Obliques (twists, side bends, woodchops)
    ['Russian Twist', 'Obliques'],
    ['Cable Russian Twists', 'Obliques'],
    ['Barbell Side Bend', 'Obliques'],
    ['Dumbbell Side Bend', 'Obliques'],
    ['Oblique Crunches', 'Obliques'],
    ['Oblique Crunches - on the Floor', 'Obliques'],
    ['Cable Judo Flip', 'Obliques'],
    ['Spell Caster', 'Obliques'],
    ['Wind Sprints', 'Obliques'],
    ['Alternate Heel Touchers', 'Obliques'],
    // Ab rollouts = full core
    ['Ab Roller', 'Abdominals (Upper)'],
    ['Barbell Ab Rollout', 'Abdominals (Upper)'],
    ['Barbell Ab Rollout - on Knees', 'Abdominals (Upper)'],
    ['Barbell Rollout from Bench', 'Abdominals (Upper)'],
    // Planks = full core
    ['Plank', 'Abdominals (Upper)'],
    ['Side Plank', 'Obliques'],
    // === Exercises wrongly tagged as abs ===
    ['Alternating Floor Press', 'Chest'],
    ['Alternating Renegade Row', 'Lats'],
    ['Atlas Stones', 'Back (Lower)'],
    ['Advanced Kettlebell Windmill', 'Obliques'],
    ['Air Bike', 'Abdominals (Upper)'],
    ['Close-Grip Push-Up Off of A Dumbbell', 'Triceps'],
    ['Sandbag Load', 'Back (Lower)'],
    ['Alternating Kettlebell Row', 'Lats'],
    ['Alternating Kettlebell Press', 'Deltoids'],
    // Bent-Over Row (dumbbell) = lats not back lower
    ['Bent-Over Row', 'Lats'],
    // Barbell Row = lats not back lower
    ['Barbell Row', 'Lats'],
    // Barbell rear delt row = deltoids not biceps
    ['Barbell Rear Delt Row', 'Deltoids'],
  ];
  for (const [name, bodyPart] of bodyPartFixes) {
    db.runSync('UPDATE exercises SET body_part = ? WHERE LOWER(name) = LOWER(?) AND is_custom = 0', [bodyPart, name]);
  }

  // Seed built-in exercises on first launch
  const result = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM exercises WHERE is_custom = 0'
  );

  if (result?.count === 0) {
    for (const ex of exercises) {
      const [name, bodyPart, equip, instructions] = ex as [string, string, string, string];
      const specific = getSpecificEquipment(name, equip);
      db.runSync(
        'INSERT INTO exercises (name, body_part, equipment, instructions, is_custom, specific_equipment) VALUES (?, ?, ?, ?, 0, ?)',
        [name, bodyPart, equip, instructions, specific]
      );
    }
  }
  // Sync exercise_progression_config rep ranges and progression_type from exercise category
  // Rep ranges: free-weight compounds 6-8, machine compounds 8-12, isolations 12-15
  // Users can override via the exercise config screen
  try {
    const allConfigs = db.getAllSync<{ id: number; exerciseId: number; repRangeMin: number; repRangeMax: number; progressionType: string }>(
      'SELECT id, exercise_id as exerciseId, rep_range_min as repRangeMin, rep_range_max as repRangeMax, progression_type as progressionType FROM exercise_progression_config'
    );
    for (const cfg of allConfigs) {
      const exInfo = db.getFirstSync<{ name: string; movementType: string; equipment: string }>(
        "SELECT name, COALESCE(movement_type, 'compound') as movementType, COALESCE(equipment, '') as equipment FROM exercises WHERE id = ?",
        [cfg.exerciseId]
      );
      if (!exInfo) continue;

      const name = exInfo.name.toLowerCase();
      const eq = exInfo.equipment.toLowerCase();
      const isIsolation = exInfo.movementType === 'isolation';
      const isMachine = eq.includes('machine') || eq.includes('cable') || eq.includes('leverage') || eq.includes('smith');

      let min: number, max: number;
      if (isIsolation) {
        // Isolation exercises: 12-15 reps
        min = 12; max = 15;
      } else if (isMachine) {
        // Machine/cable compound exercises: 8-12 reps
        min = 8; max = 12;
      } else {
        // Free-weight compound exercises (barbell, dumbbell, bodyweight): 6-8 reps
        min = 6; max = 8;
      }

      // Auto-detect progression_type from exercise name
      const exNameLower = name;
      let detectedType = cfg.progressionType || 'reps';
      if (exNameLower.includes('farmer') || exNameLower.includes('carry') || exNameLower.includes('sled') || exNameLower.includes('prowler')) {
        detectedType = 'weight_only';
      } else if (exNameLower.includes('plank') || exNameLower.includes('hold') || exNameLower.includes('hang') || exNameLower.includes('wall sit') || exNameLower.includes('l-sit')) {
        detectedType = 'time';
      }

      const needsRepUpdate = cfg.repRangeMin !== min || cfg.repRangeMax !== max;
      const needsTypeUpdate = cfg.progressionType !== detectedType;
      if (needsRepUpdate || needsTypeUpdate) {
        db.runSync(
          'UPDATE exercise_progression_config SET rep_range_min = ?, rep_range_max = ?, progression_type = ? WHERE id = ?',
          [min, max, detectedType, cfg.id]
        );
      }
    }
    // One-time: regenerate recommendations after rep-range migration
    const recMigDone = db.getFirstSync<{ value: string }>(
      "SELECT value FROM user_settings WHERE key = 'rec_regen_v6'"
    );
    if (!recMigDone) {
      db.runSync("DELETE FROM progression_recommendations WHERE status = 'active'");
      db.runSync(
        "INSERT OR REPLACE INTO user_settings (key, value) VALUES ('rec_regen_v6', '1')"
      );
      // Flag so initDatabase caller can regenerate after import completes
      (db as any).__needsRecRegen = true;
    }

    // One-time: fix template_exercises target_reps based on exercise category
    // Free-weight compounds: 8, machine compounds: 12, isolations: 15
    const templateRepFixDone = db.getFirstSync<{ value: string }>(
      "SELECT value FROM user_settings WHERE key = 'template_reps_fix_v1'"
    );
    if (!templateRepFixDone) {
      const allTemplateExercises = db.getAllSync<{ id: number; exerciseId: number; targetReps: number }>(
        'SELECT te.id, te.exercise_id as exerciseId, te.target_reps as targetReps FROM template_exercises te'
      );
      for (const te of allTemplateExercises) {
        const exInfo = db.getFirstSync<{ movementType: string; equipment: string }>(
          "SELECT COALESCE(movement_type, 'compound') as movementType, COALESCE(equipment, '') as equipment FROM exercises WHERE id = ?",
          [te.exerciseId]
        );
        if (!exInfo) continue;
        const eq = exInfo.equipment.toLowerCase();
        const isIsolation = exInfo.movementType === 'isolation';
        const isMachine = eq.includes('machine') || eq.includes('cable') || eq.includes('leverage') || eq.includes('smith');
        const correctReps = isIsolation ? 15 : isMachine ? 12 : 8;
        if (te.targetReps !== correctReps) {
          db.runSync('UPDATE template_exercises SET target_reps = ? WHERE id = ?', [correctReps, te.id]);
        }
      }
      db.runSync(
        "INSERT OR REPLACE INTO user_settings (key, value) VALUES ('template_reps_fix_v1', '1')"
      );
    }

    // Clean up orphaned workout logs (cancelled workouts with no sets) — runs every startup
    db.runSync(
      "DELETE FROM workout_logs WHERE id NOT IN (SELECT DISTINCT workout_log_id FROM set_logs)"
    );

    // Ensure at least one default gym profile exists
    const gymCount = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM gym_profiles');
    if (!gymCount || gymCount.c === 0) {
      db.runSync(
        "INSERT INTO gym_profiles (name, equipment, is_active, is_travel_mode) VALUES ('My Gym', '[]', 1, 0)"
      );
    }

    // One-time: assign freestyle workouts to matching templates
    const freestyleFixDone = db.getFirstSync<{ value: string }>(
      "SELECT value FROM user_settings WHERE key = 'freestyle_fix_v1'"
    );
    if (!freestyleFixDone) {
      const freestyleWorkouts = db.getAllSync<{ id: number }>(
        'SELECT id FROM workout_logs WHERE template_id IS NULL'
      );
      for (const fw of freestyleWorkouts) {
        // Get exercise IDs from this workout
        const exIds = db.getAllSync<{ exerciseId: number }>(
          'SELECT DISTINCT exercise_id as exerciseId FROM set_logs WHERE workout_log_id = ?',
          [fw.id]
        );
        if (exIds.length === 0) continue;
        const exIdSet = new Set(exIds.map(e => e.exerciseId));

        // Find the template with the best overlap
        const templates = db.getAllSync<{ id: number }>(
          'SELECT DISTINCT template_id as id FROM template_exercises'
        );
        let bestTemplate: number | null = null;
        let bestScore = 0;
        for (const t of templates) {
          const templateExIds = db.getAllSync<{ exerciseId: number }>(
            'SELECT exercise_id as exerciseId FROM template_exercises WHERE template_id = ?',
            [t.id]
          );
          const overlap = templateExIds.filter(te => exIdSet.has(te.exerciseId)).length;
          const score = overlap / Math.max(exIdSet.size, templateExIds.length);
          if (overlap > 0 && score > bestScore) {
            bestScore = score;
            bestTemplate = t.id;
          }
        }
        // Assign if at least 50% overlap
        if (bestTemplate && bestScore >= 0.5) {
          db.runSync('UPDATE workout_logs SET template_id = ? WHERE id = ?', [bestTemplate, fw.id]);
        }
      }
      db.runSync(
        "INSERT OR REPLACE INTO user_settings (key, value) VALUES ('freestyle_fix_v1', '1')"
      );
    }

    // One-time: populate default gym profile equipment from workout history
    const gymEquipFixDone = db.getFirstSync<{ value: string }>(
      "SELECT value FROM user_settings WHERE key = 'gym_equip_fix_v1'"
    );
    if (!gymEquipFixDone) {
      const activeProfile = db.getFirstSync<{ id: number; equipment: string }>(
        'SELECT id, equipment FROM gym_profiles WHERE is_active = 1 LIMIT 1'
      );
      if (activeProfile) {
        const current: string[] = JSON.parse(activeProfile.equipment);
        const currentSet = new Set(current.map(e => e.toLowerCase()));
        const allEquipment = db.getAllSync<{ equipment: string }>(
          `SELECT DISTINCT e.equipment FROM set_logs sl
           JOIN exercises e ON sl.exercise_id = e.id
           WHERE e.equipment IS NOT NULL AND e.equipment != ''`
        );
        for (const { equipment } of allEquipment) {
          if (!currentSet.has(equipment.toLowerCase())) {
            current.push(equipment);
            currentSet.add(equipment.toLowerCase());
          }
        }
        db.runSync('UPDATE gym_profiles SET equipment = ? WHERE id = ?', [JSON.stringify(current), activeProfile.id]);
      }
      db.runSync(
        "INSERT OR REPLACE INTO user_settings (key, value) VALUES ('gym_equip_fix_v1', '1')"
      );
    }

    // One-time: populate specific_equipment for all exercises
    const specEquipDone = db.getFirstSync<{ value: string }>(
      "SELECT value FROM user_settings WHERE key = 'specific_equip_v1'"
    );
    if (!specEquipDone) {
      const allExercises = db.getAllSync<{ id: number; name: string; equipment: string }>(
        "SELECT id, name, COALESCE(equipment, '') as equipment FROM exercises"
      );
      for (const ex of allExercises) {
        const specific = getSpecificEquipment(ex.name, ex.equipment);
        db.runSync('UPDATE exercises SET specific_equipment = ? WHERE id = ?', [specific, ex.id]);
      }

      // Update all gym profiles to use specific equipment names
      const allProfiles = db.getAllSync<{ id: number; equipment: string }>(
        'SELECT id, equipment FROM gym_profiles'
      );
      for (const profile of allProfiles) {
        // Get specific equipment from exercises the user has actually logged
        const loggedEquip = db.getAllSync<{ specificEquipment: string }>(
          `SELECT DISTINCT e.specific_equipment as specificEquipment
           FROM set_logs sl
           JOIN exercises e ON sl.exercise_id = e.id
           WHERE e.specific_equipment IS NOT NULL AND e.specific_equipment != ''`
        );
        const equipSet = new Set<string>();
        for (const { specificEquipment } of loggedEquip) {
          equipSet.add(specificEquipment);
        }
        db.runSync('UPDATE gym_profiles SET equipment = ? WHERE id = ?', [JSON.stringify([...equipSet]), profile.id]);
      }

      db.runSync(
        "INSERT OR REPLACE INTO user_settings (key, value) VALUES ('specific_equip_v1', '1')"
      );
    }

    // One-time: fix body part mappings using rule-based fixer
    const bodyPartFixDone = db.getFirstSync<{ value: string }>(
      "SELECT value FROM user_settings WHERE key = 'body_part_fix_v1'"
    );
    if (!bodyPartFixDone) {
      const allExercises = db.getAllSync<{ id: number; name: string }>(
        'SELECT id, name FROM exercises WHERE is_custom = 0'
      );
      for (const ex of allExercises) {
        const correct = getCorrectBodyPart(ex.name);
        if (correct) {
          db.runSync('UPDATE exercises SET body_part = ? WHERE id = ?', [correct, ex.id]);
        }
      }
      db.runSync(
        "INSERT OR REPLACE INTO user_settings (key, value) VALUES ('body_part_fix_v1', '1')"
      );
    }

    // One-time: improve exercise descriptions
    const descFixDone = db.getFirstSync<{ value: string }>(
      "SELECT value FROM user_settings WHERE key = 'desc_fix_v1'"
    );
    if (!descFixDone) {
      const allExercises = db.getAllSync<{ id: number; name: string; instructions: string }>(
        'SELECT id, name, COALESCE(instructions, \'\') as instructions FROM exercises WHERE is_custom = 0'
      );
      for (const ex of allExercises) {
        const desc = getExerciseDescription(ex.name);
        if (desc) {
          db.runSync('UPDATE exercises SET instructions = ? WHERE id = ?', [desc, ex.id]);
        }
      }
      db.runSync(
        "INSERT OR REPLACE INTO user_settings (key, value) VALUES ('desc_fix_v1', '1')"
      );
    }

    // One-time: standardize exercise names
    const nameFixDone = db.getFirstSync<{ value: string }>(
      "SELECT value FROM user_settings WHERE key = 'name_fix_v3'"
    );
    if (!nameFixDone) {
      const allExercises = db.getAllSync<{ id: number; name: string }>(
        'SELECT id, name FROM exercises WHERE is_custom = 0'
      );
      for (const ex of allExercises) {
        const newName = getStandardizedName(ex.name);
        if (newName && newName !== ex.name) {
          // Check no duplicate exists
          const exists = db.getFirstSync<{ id: number }>(
            'SELECT id FROM exercises WHERE LOWER(name) = LOWER(?) AND id != ?', [newName, ex.id]
          );
          if (!exists) {
            db.runSync('UPDATE exercises SET name = ? WHERE id = ?', [newName, ex.id]);
          }
        }
      }
      db.runSync(
        "INSERT OR REPLACE INTO user_settings (key, value) VALUES ('name_fix_v3', '1')"
      );
    }
  } catch (_) { /* no-op */ }
};

export default db;
