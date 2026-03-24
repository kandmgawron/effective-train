/**
 * FitNotes Workout Import Script
 * 
 * Run this to generate SQL that imports FitNotes workout history.
 * Usage: node scripts/import-fitnotes.js < FitNotesWorkouts.csv
 * 
 * The output SQL can be run against the app's SQLite database.
 */

const fs = require('fs');
const readline = require('readline');

async function main() {
  const csvPath = process.argv[2] || 'assets/data/FitNotesWorkouts.csv';
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');
  
  // Parse CSV
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (values.length < 8) continue;
    rows.push({
      workoutName: values[0],
      startTime: values[1],
      endTime: values[2],
      exercise: values[4],
      reps: parseInt(values[6]) || 0,
      weight: parseFloat(values[7]) || 0
    });
  }

  // Group by workout (unique startTime)
  const workouts = new Map();
  for (const row of rows) {
    const key = row.startTime;
    if (!workouts.has(key)) {
      workouts.set(key, {
        name: row.workoutName,
        startTime: row.startTime,
        endTime: row.endTime,
        sets: []
      });
    }
    workouts.get(key).sets.push(row);
  }

  // Generate import data as JSON (to be used by the app)
  const importData = [];
  for (const [key, workout] of workouts) {
    const startDate = new Date(workout.startTime);
    const endDate = new Date(workout.endTime);
    const duration = Math.round((endDate - startDate) / 1000); // seconds
    
    // Group sets by exercise to assign set numbers
    const exerciseSets = new Map();
    for (const set of workout.sets) {
      if (!exerciseSets.has(set.exercise)) {
        exerciseSets.set(set.exercise, []);
      }
      exerciseSets.get(set.exercise).push(set);
    }

    const sets = [];
    for (const [exerciseName, exerciseSetList] of exerciseSets) {
      exerciseSetList.forEach((s, idx) => {
        sets.push({
          exercise: s.exercise,
          setNumber: idx + 1,
          reps: s.reps,
          weight: s.weight
        });
      });
    }

    importData.push({
      name: workout.name,
      date: startDate.toISOString().split('T')[0],
      duration,
      sets
    });
  }

  // Output as JSON
  fs.writeFileSync('lib/fitnotes-import.json', JSON.stringify(importData, null, 2));
  console.log(`Parsed ${workouts.size} workouts with ${rows.length} total sets`);
  console.log('Generated lib/fitnotes-import.json');
}

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

main().catch(console.error);
