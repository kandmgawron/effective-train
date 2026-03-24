const Realm = require('realm');
const fs = require('fs');

const REALM_PATH = '/Users/kategawron/downloads/default.realm';

function csvEscape(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function main() {
  const realm = await Realm.open({
    path: REALM_PATH,
    readOnly: true,
    schemaVersion: 0,
  });

  const workouts = realm.objects('Workout');
  const rows = [];
  rows.push('Name,StartTime,EndTime,BodyWeight,Exercise,Equipment,Reps,Weight,Time,Distance,Status,IsWarmup,RPE,RIR,Categories,Note');

  let exportedSets = 0;
  let exportedWorkouts = 0;

  for (let w = 0; w < workouts.length; w++) {
    const workout = workouts[w];
    // Skip templates (no startTime)
    if (!workout.startTime) continue;

    exportedWorkouts++;
    const wName = workout.name || 'Workout';
    const startTime = new Date(workout.startTime).toISOString().replace('.000Z', 'Z');
    const endTime = workout.endTime ? new Date(workout.endTime).toISOString().replace('.000Z', 'Z') : '';

    // Get body weight from measurements
    let bodyWeight = '';
    for (let m = 0; m < workout.measurements.length; m++) {
      const meas = workout.measurements[m];
      if (meas.definition && meas.definition.name === 'Weight') {
        bodyWeight = String(meas.value);
        break;
      }
    }

    // Iterate superSets -> exercises -> setDetails
    for (let ss = 0; ss < workout.superSets.length; ss++) {
      const superSet = workout.superSets[ss];
      for (let e = 0; e < superSet.exercises.length; e++) {
        const exercise = superSet.exercises[e];
        const def = exercise.definition;
        const exName = def ? def.name : 'Unknown';
        const equipment = def && def.equipment ? def.equipment.name : 'None';
        const note = exercise.note || '';

        const cats = [];
        if (def && def.categories) {
          for (let c = 0; c < def.categories.length; c++) {
            cats.push(def.categories[c].name);
          }
        }
        const categories = cats.join(',');

        // Regular sets
        for (let s = 0; s < exercise.setDetails.length; s++) {
          const set = exercise.setDetails[s];
          const reps = set.primary || 0;
          const weight = set.secondary || 0;
          const status = set.statusId === 1 ? 'Done' : set.statusId === 2 ? 'Failed' : 'Pending';
          const rpe = set.rateOfPercievedExertion || '';
          const rir = set.repsInReserve || '';
          rows.push(`${csvEscape(wName)},${startTime},${endTime},${bodyWeight},${csvEscape(exName)},${csvEscape(equipment)},${reps},${weight},,,${status},false,${rpe},${rir},"${categories}",${csvEscape(note)}`);
          exportedSets++;
        }

        // Warmup sets
        for (let s = 0; s < exercise.warmupSetDetails.length; s++) {
          const set = exercise.warmupSetDetails[s];
          const reps = set.primary || 0;
          const weight = set.secondary || 0;
          const status = set.statusId === 1 ? 'Done' : set.statusId === 2 ? 'Failed' : 'Pending';
          rows.push(`${csvEscape(wName)},${startTime},${endTime},${bodyWeight},${csvEscape(exName)},${csvEscape(equipment)},${reps},${weight},,,${status},true,,,"${categories}",${csvEscape(note)}`);
          exportedSets++;
        }
      }
    }
  }

  const csvOutput = rows.join('\n') + '\n';
  fs.writeFileSync('assets/data/FitNotesWorkouts.csv', csvOutput);
  console.log(`Exported ${exportedSets} sets from ${exportedWorkouts} workouts`);

  realm.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
