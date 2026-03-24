import * as SQLite from 'expo-sqlite';
import exercises from './exercises.json';
import fitnotesData from './fitnotes-import.json';

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
    // Dumbbell triceps extension = triceps not chest
    ['Lying Dumbbell Tricep Extension', 'Triceps'],
    ['Standing One-Arm Dumbbell Triceps Extension', 'Triceps'],
    ['Standing Overhead Barbell Triceps Extension', 'Triceps'],
    ['Standing Bent-Over One-Arm Dumbbell Triceps Extension', 'Triceps'],
    ['Incline Barbell Triceps Extension', 'Triceps'],
    ['Standing Low-Pulley One-Arm Triceps Extension', 'Triceps'],
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
      db.runSync(
        'INSERT INTO exercises (name, body_part, equipment, instructions, is_custom) VALUES (?, ?, ?, ?, 0)',
        ex as [string, string, string, string]
      );
    }
  }
  // One-time import of FitNotes workout history
  const importCheck = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM workout_logs'
  );

  if (importCheck?.count === 0) {
    const exerciseCache = new Map<string, number>();
    
    const getOrCreateExercise = (name: string): number => {
      const lowerName = name.toLowerCase();
      if (exerciseCache.has(lowerName)) return exerciseCache.get(lowerName)!;
      
      const existing = db.getFirstSync<{ id: number }>(
        'SELECT id FROM exercises WHERE LOWER(name) = ?', [lowerName]
      );
      if (existing) { exerciseCache.set(lowerName, existing.id); return existing.id; }
      
      const ins = db.runSync(
        'INSERT INTO exercises (name, body_part, equipment, instructions, is_custom) VALUES (?, ?, ?, ?, 1)',
        [name, 'Other', 'Other', '']
      );
      const newId = Number(ins.lastInsertRowId);
      exerciseCache.set(lowerName, newId);
      return newId;
    };

    for (const workout of fitnotesData as any[]) {
      const durationMin = Math.round(workout.duration / 60);
      const wRes = db.runSync(
        'INSERT INTO workout_logs (template_id, date, duration) VALUES (?, ?, ?)',
        [null, workout.date, durationMin]
      );
      const wId = Number(wRes.lastInsertRowId);
      for (const set of workout.sets) {
        const exId = getOrCreateExercise(set.exercise);
        db.runSync(
          'INSERT INTO set_logs (workout_log_id, exercise_id, set_number, reps, weight, is_drop_set) VALUES (?, ?, ?, ?, ?, 0)',
          [wId, exId, set.setNumber, set.reps, set.weight]
        );
      }
    }
    console.log('FitNotes import complete');
  }

  // Seed workout templates (Monday / Thursday / Friday)
  const templateCheck = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM workout_templates'
  );

  if (templateCheck?.count === 0) {
    const findExercise = (name: string): number | null => {
      const row = db.getFirstSync<{ id: number }>(
        'SELECT id FROM exercises WHERE LOWER(name) = ?', [name.toLowerCase()]
      );
      return row?.id ?? null;
    };

    const templates: { name: string; duration: number; exercises: { name: string; sets: number; reps: number; rest: number }[] }[] = [
      {
        name: 'Monday - Upper Body',
        duration: 75,
        exercises: [
          { name: 'Machine Assisted Pull-Up', sets: 4, reps: 10, rest: 90 },
          { name: 'Dumbbell Bench Press', sets: 4, reps: 10, rest: 90 },
          { name: 'Bent-over Row', sets: 6, reps: 12, rest: 60 },
          { name: 'Dumbbell Shoulder Press', sets: 3, reps: 12, rest: 60 },
          { name: 'Standing Cable Wood Chop', sets: 3, reps: 12, rest: 60 },
          { name: 'Lateral Raise', sets: 3, reps: 12, rest: 60 },
          { name: 'Face Pull', sets: 3, reps: 8, rest: 60 },
        ],
      },
      {
        name: 'Thursday - Legs',
        duration: 80,
        exercises: [
          { name: 'Leg Press', sets: 3, reps: 8, rest: 120 },
          { name: 'Barbell Deadlift', sets: 4, reps: 8, rest: 120 },
          { name: 'Barbell Hip Thrust', sets: 3, reps: 9, rest: 90 },
          { name: 'Lying Leg Curls', sets: 3, reps: 12, rest: 60 },
          { name: 'Single-Leg Leg Extension', sets: 4, reps: 8, rest: 60 },
          { name: 'Standing Calf Raise', sets: 4, reps: 12, rest: 60 },
          { name: 'Thigh Adductor', sets: 2, reps: 12, rest: 60 },
          { name: 'Thigh Abductor', sets: 2, reps: 12, rest: 60 },
        ],
      },
      {
        name: 'Friday - Pull & Arms',
        duration: 70,
        exercises: [
          { name: 'Wide-Grip Lat Pulldown', sets: 3, reps: 9, rest: 90 },
          { name: 'Seated Cable Rows', sets: 3, reps: 9, rest: 90 },
          { name: 'Barbell Incline Bench Press - Medium Grip', sets: 3, reps: 8, rest: 90 },
          { name: 'Lying Rear Delt Raise', sets: 3, reps: 8, rest: 60 },
          { name: 'Dumbbell Alternate Bicep Curl', sets: 2, reps: 11, rest: 60 },
          { name: 'Triceps Pushdown - Rope Attachment', sets: 2, reps: 11, rest: 60 },
          { name: "Farmer's Walk", sets: 2, reps: 4, rest: 60 },
          { name: 'Around The Worlds', sets: 3, reps: 12, rest: 60 },
        ],
      },
    ];

    for (const tmpl of templates) {
      const tRes = db.runSync(
        'INSERT INTO workout_templates (name, estimated_duration) VALUES (?, ?)',
        [tmpl.name, tmpl.duration * 60]
      );
      const tId = Number(tRes.lastInsertRowId);

      tmpl.exercises.forEach((ex, idx) => {
        const exId = findExercise(ex.name);
        if (exId) {
          db.runSync(
            'INSERT INTO template_exercises (template_id, exercise_id, sets, target_reps, rest_time, exercise_order) VALUES (?, ?, ?, ?, ?, ?)',
            [tId, exId, ex.sets, ex.reps, ex.rest, idx]
          );
        }
      });
    }
    console.log('Workout templates seeded');
  }

  // Sync exercise_progression_config rep ranges and progression_type from template target_reps
  // Fixes configs that still have the old 8/12 defaults when the template says otherwise
  // Also auto-detects progression_type for known exercise patterns
  try {
    const allConfigs = db.getAllSync<{ id: number; exerciseId: number; repRangeMin: number; repRangeMax: number; progressionType: string }>(
      'SELECT id, exercise_id as exerciseId, rep_range_min as repRangeMin, rep_range_max as repRangeMax, progression_type as progressionType FROM exercise_progression_config'
    );
    for (const cfg of allConfigs) {
      const tmplEx = db.getFirstSync<{ targetReps: number }>(
        'SELECT target_reps as targetReps FROM template_exercises WHERE exercise_id = ? LIMIT 1',
        [cfg.exerciseId]
      );
      if (!tmplEx) continue;
      const t = tmplEx.targetReps;
      let min: number, max: number;
      if (t <= 5) { min = Math.max(1, t - 1); max = t + 1; }
      else if (t <= 8) { min = t - 2; max = t; }
      else { min = t - 2; max = t; }

      // Auto-detect progression_type from exercise name
      const exName = db.getFirstSync<{ name: string }>(
        'SELECT name FROM exercises WHERE id = ?', [cfg.exerciseId]
      );
      const name = (exName?.name ?? '').toLowerCase();
      let detectedType = cfg.progressionType || 'reps';
      if (name.includes('farmer') || name.includes('carry') || name.includes('sled') || name.includes('prowler')) {
        detectedType = 'weight_only';
      } else if (name.includes('plank') || name.includes('hold') || name.includes('hang') || name.includes('wall sit') || name.includes('l-sit')) {
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
      "SELECT value FROM user_settings WHERE key = 'rec_regen_v5'"
    );
    if (!recMigDone) {
      db.runSync("DELETE FROM progression_recommendations WHERE status = 'active'");
      db.runSync(
        "INSERT OR REPLACE INTO user_settings (key, value) VALUES ('rec_regen_v5', '1')"
      );
      // Flag so initDatabase caller can regenerate after import completes
      (db as any).__needsRecRegen = true;
    }

    // One-time: clean up orphaned workout logs (cancelled workouts with no sets)
    const orphanCleanDone = db.getFirstSync<{ value: string }>(
      "SELECT value FROM user_settings WHERE key = 'orphan_cleanup_v1'"
    );
    if (!orphanCleanDone) {
      db.runSync(
        "DELETE FROM workout_logs WHERE id NOT IN (SELECT DISTINCT workout_log_id FROM set_logs)"
      );
      db.runSync(
        "INSERT OR REPLACE INTO user_settings (key, value) VALUES ('orphan_cleanup_v1', '1')"
      );
    }
  } catch (_) { /* no-op */ }
};

export default db;
