const { execSync } = require('child_process');
const fs = require('fs');

const CSV_PATH = 'fitnotes_exercises_standardized_plus_missing.csv';
const DB_PATH = 'assets/gymtracker.db';

// Remove old DB if exists
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

// Read and parse CSV
const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
const lines = csvContent.split('\n');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}

function mapEquipment(equipment) {
  const lower = equipment.toLowerCase();
  if (lower.includes('bodyweight') || lower.includes('none')) return 'Bodyweight';
  if (lower.includes('barbell')) return 'Barbell';
  if (lower.includes('dumbbell')) return 'Dumbbell';
  if (lower.includes('machine')) return 'Machine';
  if (lower.includes('cable')) return 'Cable';
  if (lower.includes('kettlebell')) return 'Kettlebells';
  if (lower.includes('band')) return 'Resistance Band';
  if (lower.includes('medicine ball')) return 'Medicine Ball';
  if (lower.includes('exercise ball') || lower.includes('stability ball')) return 'Exercise Ball';
  if (lower.includes('foam roll')) return 'Foam Roller';
  if (lower.includes('e-z curl')) return 'EZ Bar';
  return equipment || 'Other';
}

function generateInstructions(name, bodyPart, equipment) {
  const lower = name.toLowerCase();
  if (lower.includes('press')) return `Press the ${equipment.toLowerCase()} with controlled movement, focusing on ${bodyPart.toLowerCase()}. Lower slowly and repeat.`;
  if (lower.includes('curl')) return `Curl the ${equipment.toLowerCase()} towards your body, contracting ${bodyPart.toLowerCase()}. Lower with control.`;
  if (lower.includes('squat')) return `Lower your body by bending knees and hips, keeping back straight. Push through heels to return to start.`;
  if (lower.includes('deadlift')) return `Lift the weight by extending hips and knees, keeping back straight. Lower with control to starting position.`;
  if (lower.includes('row')) return `Pull the ${equipment.toLowerCase()} towards your body, squeezing shoulder blades together. Lower with control.`;
  if (lower.includes('raise') || lower.includes('lateral')) return `Raise the ${equipment.toLowerCase()} to shoulder height, focusing on ${bodyPart.toLowerCase()}. Lower slowly.`;
  if (lower.includes('pull')) return `Pull the ${equipment.toLowerCase()} with controlled movement, engaging ${bodyPart.toLowerCase()}. Return to start.`;
  if (lower.includes('extension')) return `Extend fully, focusing on ${bodyPart.toLowerCase()} contraction. Return to starting position with control.`;
  if (lower.includes('fly') || lower.includes('flye')) return `Move arms in an arc motion, focusing on ${bodyPart.toLowerCase()} stretch and contraction.`;
  if (lower.includes('crunch') || lower.includes('sit-up')) return `Contract abdominals to lift upper body. Lower with control, maintaining tension throughout.`;
  if (lower.includes('plank')) return `Hold body in straight line, engaging core. Maintain position for prescribed duration.`;
  if (lower.includes('lunge')) return `Step forward and lower body until both knees are bent at 90 degrees. Push back to start.`;
  return `Perform ${name} with proper form, focusing on ${bodyPart.toLowerCase()}. Control the movement throughout.`;
}

// Build SQL
let sql = `
PRAGMA journal_mode = WAL;

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
`;

// Parse exercises and generate INSERT statements
let count = 0;
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const values = parseCSVLine(line);
  if (values.length < 9) continue;
  const name = values[2];
  const equipment = mapEquipment(values[4]);
  const categories = values[7];
  if (!name || name === 'standardized_exercise_name') continue;
  const bodyParts = categories.split(',').map(c => c.trim());
  const bodyPart = bodyParts[0] || 'Other';
  const instructions = generateInstructions(name, bodyPart, equipment);

  const esc = (s) => s.replace(/'/g, "''");
  sql += `INSERT INTO exercises (name, body_part, equipment, instructions, is_custom) VALUES ('${esc(name)}', '${esc(bodyPart)}', '${esc(equipment)}', '${esc(instructions)}', 0);\n`;
  count++;
}

// Write SQL file and execute
const sqlPath = '/tmp/gymtracker_build.sql';
fs.writeFileSync(sqlPath, sql);
execSync(`sqlite3 "${DB_PATH}" < "${sqlPath}"`);

// Verify
const verifyOutput = execSync(`sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM exercises;"`).toString().trim();
console.log(`Built ${DB_PATH} with ${verifyOutput} exercises (expected ${count})`);
