/**
 * Rule-based body part fixer for exercises.
 * Runs on startup to correct the many bad mappings in the seed data.
 * Uses exercise name patterns to determine the correct primary body part.
 */

interface FixRule {
  pattern: RegExp;
  bodyPart: string;
}

// Rules applied in order — first match wins
const rules: FixRule[] = [
  // === LATS (pulling movements) ===
  { pattern: /pull[\s-]*up|pullup|chin[\s-]*up|chinup/i, bodyPart: 'Lats' },
  { pattern: /pulldown|pull[\s-]*down/i, bodyPart: 'Lats' },
  { pattern: /lat\s/i, bodyPart: 'Lats' },
  { pattern: /\brow\b(?!.*rotation)/i, bodyPart: 'Lats' },
  { pattern: /muscle[\s-]*up/i, bodyPart: 'Lats' },
  { pattern: /inverted.*row/i, bodyPart: 'Lats' },

  // === CHEST ===
  { pattern: /bench\s*press/i, bodyPart: 'Chest' },
  { pattern: /chest\s*(press|fly|flye|push)/i, bodyPart: 'Chest' },
  { pattern: /push[\s-]*up|pushup/i, bodyPart: 'Chest' },
  { pattern: /\bfly\b|\bflye\b|\bflyes\b/i, bodyPart: 'Chest' },
  { pattern: /pec\s*deck|butterfly/i, bodyPart: 'Chest' },
  { pattern: /dip.*chest/i, bodyPart: 'Chest' },
  { pattern: /floor\s*press/i, bodyPart: 'Chest' },
  { pattern: /cable\s*cross/i, bodyPart: 'Chest' },
  { pattern: /iron\s*cross(?!.*stretch)/i, bodyPart: 'Chest' },
  { pattern: /pullover(?!.*row)/i, bodyPart: 'Chest' },

  // === DELTOIDS (shoulders) ===
  { pattern: /shoulder\s*press/i, bodyPart: 'Deltoids' },
  { pattern: /military\s*press/i, bodyPart: 'Deltoids' },
  { pattern: /overhead\s*press/i, bodyPart: 'Deltoids' },
  { pattern: /arnold.*press/i, bodyPart: 'Deltoids' },
  { pattern: /lateral\s*raise|side\s*lateral/i, bodyPart: 'Deltoids' },
  { pattern: /front.*raise/i, bodyPart: 'Deltoids' },
  { pattern: /rear\s*delt/i, bodyPart: 'Deltoids' },
  { pattern: /reverse\s*fly|reverse\s*flye/i, bodyPart: 'Deltoids' },
  { pattern: /upright\s*row/i, bodyPart: 'Deltoids' },
  { pattern: /handstand/i, bodyPart: 'Deltoids' },
  { pattern: /push\s*press/i, bodyPart: 'Deltoids' },
  { pattern: /scaption/i, bodyPart: 'Deltoids' },
  { pattern: /bradford/i, bodyPart: 'Deltoids' },
  { pattern: /cuban\s*press/i, bodyPart: 'Deltoids' },
  { pattern: /anti[\s-]*gravity\s*press/i, bodyPart: 'Deltoids' },
  { pattern: /around\s*the\s*world/i, bodyPart: 'Deltoids' },
  { pattern: /arm\s*circle/i, bodyPart: 'Deltoids' },
  { pattern: /band\s*pull\s*apart/i, bodyPart: 'Deltoids' },
  { pattern: /face\s*pull/i, bodyPart: 'Deltoids' },
  { pattern: /external\s*rotation|internal\s*rotation/i, bodyPart: 'Deltoids' },
  { pattern: /back\s*fly|back\s*flye/i, bodyPart: 'Deltoids' },
  { pattern: /elbow\s*circle/i, bodyPart: 'Deltoids' },

  // === QUADRICEPS ===
  { pattern: /squat(?!.*jump.*rope)/i, bodyPart: 'Quadriceps' },
  { pattern: /leg\s*press/i, bodyPart: 'Quadriceps' },
  { pattern: /leg\s*extension/i, bodyPart: 'Quadriceps' },
  { pattern: /lunge/i, bodyPart: 'Quadriceps' },
  { pattern: /step[\s-]*up/i, bodyPart: 'Quadriceps' },
  { pattern: /hack\s*squat/i, bodyPart: 'Quadriceps' },
  { pattern: /pistol/i, bodyPart: 'Quadriceps' },
  { pattern: /split\s*squat/i, bodyPart: 'Quadriceps' },
  { pattern: /box\s*jump|box\s*squat/i, bodyPart: 'Quadriceps' },
  { pattern: /prowler/i, bodyPart: 'Quadriceps' },
  { pattern: /sled(?!.*row)/i, bodyPart: 'Quadriceps' },
  { pattern: /thruster/i, bodyPart: 'Quadriceps' },

  // === HAMSTRINGS ===
  { pattern: /leg\s*curl|hamstring\s*curl/i, bodyPart: 'Hamstrings' },
  { pattern: /romanian\s*deadlift|rdl\b/i, bodyPart: 'Hamstrings' },
  { pattern: /stiff[\s-]*leg.*deadlift/i, bodyPart: 'Hamstrings' },
  { pattern: /good\s*morning/i, bodyPart: 'Hamstrings' },
  { pattern: /glute[\s-]*ham\s*raise/i, bodyPart: 'Hamstrings' },
  { pattern: /nordic\s*curl/i, bodyPart: 'Hamstrings' },
  { pattern: /\bdeadlift\b/i, bodyPart: 'Hamstrings' },

  // === GLUTEALS ===
  { pattern: /hip\s*thrust/i, bodyPart: 'Gluteals' },
  { pattern: /glute\s*bridge|barbell\s*bridge/i, bodyPart: 'Gluteals' },
  { pattern: /glute\s*kick/i, bodyPart: 'Gluteals' },
  { pattern: /sumo\s*deadlift/i, bodyPart: 'Gluteals' },
  { pattern: /hip\s*extension/i, bodyPart: 'Gluteals' },
  { pattern: /hip\s*lift/i, bodyPart: 'Gluteals' },
  { pattern: /butt\s*lift|bridge/i, bodyPart: 'Gluteals' },
  { pattern: /reverse\s*hyper/i, bodyPart: 'Gluteals' },
  { pattern: /cable\s*kickback/i, bodyPart: 'Gluteals' },
  { pattern: /flutter\s*kick/i, bodyPart: 'Gluteals' },

  // === TRICEPS ===
  { pattern: /tricep|skull\s*crush/i, bodyPart: 'Triceps' },
  { pattern: /pushdown|push[\s-]*down(?!.*chest)/i, bodyPart: 'Triceps' },
  { pattern: /close[\s-]*grip.*bench/i, bodyPart: 'Triceps' },
  { pattern: /bench\s*dip|dip.*tricep/i, bodyPart: 'Triceps' },
  { pattern: /kickback(?!.*cable.*glute)/i, bodyPart: 'Triceps' },

  // === BICEPS ===
  { pattern: /\bcurl\b(?!.*leg|.*ham|.*wrist|.*calf)/i, bodyPart: 'Biceps' },
  { pattern: /preacher(?!.*bench)/i, bodyPart: 'Biceps' },
  { pattern: /concentration/i, bodyPart: 'Biceps' },

  // === TRAPEZIUS ===
  { pattern: /shrug/i, bodyPart: 'Trapezius' },

  // === OBLIQUES ===
  { pattern: /russian\s*twist/i, bodyPart: 'Obliques' },
  { pattern: /side\s*bend/i, bodyPart: 'Obliques' },
  { pattern: /oblique/i, bodyPart: 'Obliques' },
  { pattern: /woodchop|wood\s*chop/i, bodyPart: 'Obliques' },
  { pattern: /windmill/i, bodyPart: 'Obliques' },
  { pattern: /plate\s*twist/i, bodyPart: 'Obliques' },
  { pattern: /landmine\s*180/i, bodyPart: 'Obliques' },
  { pattern: /heel\s*toucher/i, bodyPart: 'Obliques' },
  { pattern: /side\s*plank/i, bodyPart: 'Obliques' },

  // === ABDOMINALS (UPPER) ===
  { pattern: /crunch(?!.*reverse|.*oblique|.*cross)/i, bodyPart: 'Abdominals (Upper)' },
  { pattern: /sit[\s-]*up/i, bodyPart: 'Abdominals (Upper)' },
  { pattern: /ab\s*roll/i, bodyPart: 'Abdominals (Upper)' },
  { pattern: /\bplank\b(?!.*side)/i, bodyPart: 'Abdominals (Upper)' },
  { pattern: /dead\s*bug/i, bodyPart: 'Abdominals (Upper)' },

  // === ABDOMINALS (LOWER) ===
  { pattern: /leg\s*raise|hanging.*raise/i, bodyPart: 'Abdominals (Lower)' },
  { pattern: /reverse\s*crunch/i, bodyPart: 'Abdominals (Lower)' },
  { pattern: /hanging\s*pike/i, bodyPart: 'Abdominals (Lower)' },
  { pattern: /knee.*raise.*parallel/i, bodyPart: 'Abdominals (Lower)' },
  { pattern: /mountain\s*climber/i, bodyPart: 'Abdominals (Lower)' },
  { pattern: /scissor\s*kick/i, bodyPart: 'Abdominals (Lower)' },

  // === CALVES ===
  { pattern: /calf\s*raise|calf\s*press/i, bodyPart: 'Calves' },
  { pattern: /donkey\s*calf/i, bodyPart: 'Calves' },

  // === CARDIO ===
  { pattern: /treadmill|elliptical|stationary|bike\s*ride|bicycling|rowing.*machine|stair|step\s*mill|jogging|walking|running|sprint(?!.*bench)/i, bodyPart: 'Cardio' },
  { pattern: /battling\s*rope|battle\s*rope|jump\s*rope|rope\s*jump/i, bodyPart: 'Cardio' },

  // === ADDUCTORS ===
  { pattern: /adduct(?!.*ab)/i, bodyPart: 'Adductors' },
  { pattern: /hip\s*adduct/i, bodyPart: 'Adductors' },
  { pattern: /cable\s*hip\s*adduct/i, bodyPart: 'Adductors' },

  // === ABDUCTORS ===
  { pattern: /abduct/i, bodyPart: 'Abductors' },
  { pattern: /hip\s*abduct/i, bodyPart: 'Abductors' },
];

// Exercises that should NOT be auto-fixed (keep their current mapping)
const skipExercises = new Set([
  'calf press',
  'calf press on the leg press machine',
  'calf raise on a dumbbell',
  'calf raises - with bands',
  'donkey calf raises',
  'barbell seated calf raise',
  'rocking standing calf raise',
  'seated calf raise',
  'standing calf raises',
  'smith machine calf raise',
  'dumbbell seated one-leg calf raise',
]);

/**
 * Determine the correct body part for an exercise based on its name.
 * Returns null if no rule matches (keep existing value).
 */
export function getCorrectBodyPart(exerciseName: string): string | null {
  if (skipExercises.has(exerciseName.toLowerCase())) return null;

  for (const rule of rules) {
    if (rule.pattern.test(exerciseName)) {
      return rule.bodyPart;
    }
  }
  return null;
}
