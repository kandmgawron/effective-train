/**
 * Maps exercise names to their specific equipment.
 * Used to populate the specific_equipment column on exercises.
 * Rules applied in order — first match wins.
 */

interface EquipmentRule {
  pattern: RegExp;
  equipment: string;
}

const rules: EquipmentRule[] = [
  // Cardio machines
  { pattern: /treadmill/i, equipment: 'Treadmill' },
  { pattern: /stationary|bike.*machine|cycling.*machine/i, equipment: 'Stationary Bike' },
  { pattern: /elliptical/i, equipment: 'Elliptical' },
  { pattern: /rowing.*machine|ergometer|erg\b/i, equipment: 'Rowing Machine' },
  { pattern: /stair.*master|stair.*climb|step.*mill/i, equipment: 'Stair Climber' },

  // Cable machines
  { pattern: /cable|pulley|lat.*pull/i, equipment: 'Cable Machine' },
  { pattern: /crossover/i, equipment: 'Cable Machine' },

  // Specific machines — legs
  { pattern: /leg\s*press/i, equipment: 'Leg Press Machine' },
  { pattern: /leg\s*extension/i, equipment: 'Leg Extension Machine' },
  { pattern: /leg\s*curl|hamstring\s*curl/i, equipment: 'Leg Curl Machine' },
  { pattern: /hack\s*squat/i, equipment: 'Hack Squat Machine' },
  { pattern: /hip\s*abduct/i, equipment: 'Hip Abduction Machine' },
  { pattern: /hip\s*adduct/i, equipment: 'Hip Adduction Machine' },
  { pattern: /calf\s*raise.*machine|standing\s*calf|seated\s*calf/i, equipment: 'Calf Raise Machine' },
  { pattern: /glute.*machine|hip\s*thrust.*machine/i, equipment: 'Glute Machine' },
  { pattern: /pendulum\s*squat/i, equipment: 'Pendulum Squat Machine' },

  // Specific machines — upper body
  { pattern: /chest\s*press.*machine|machine.*chest\s*press/i, equipment: 'Chest Press Machine' },
  { pattern: /pec\s*deck|pec\s*fly|butterfly/i, equipment: 'Pec Deck Machine' },
  { pattern: /shoulder\s*press.*machine|machine.*shoulder/i, equipment: 'Shoulder Press Machine' },
  { pattern: /lat\s*pull\s*down/i, equipment: 'Lat Pulldown Machine' },
  { pattern: /seated\s*row.*machine|machine.*row/i, equipment: 'Seated Row Machine' },
  { pattern: /rear\s*delt.*machine/i, equipment: 'Rear Delt Machine' },
  { pattern: /assisted.*pull.*up|assisted.*dip|gravitron/i, equipment: 'Assisted Pull-Up/Dip Machine' },
  { pattern: /smith/i, equipment: 'Smith Machine' },
  { pattern: /preacher.*machine/i, equipment: 'Preacher Curl Machine' },
  { pattern: /tricep.*push\s*down.*machine/i, equipment: 'Tricep Pushdown Machine' },

  // Specific machines — core/back
  { pattern: /ab\s*crunch.*machine|crunch.*machine/i, equipment: 'Ab Crunch Machine' },
  { pattern: /back\s*extension.*machine|hyperextension.*machine/i, equipment: 'Back Extension Machine' },
  { pattern: /torso\s*rotation/i, equipment: 'Torso Rotation Machine' },

  // Free weight equipment
  { pattern: /trap\s*bar|hex\s*bar/i, equipment: 'Trap Bar' },
  { pattern: /ez[\s-]*bar|ez[\s-]*curl/i, equipment: 'EZ Curl Bar' },
  { pattern: /safety\s*squat\s*bar|ssb/i, equipment: 'Safety Squat Bar' },
  { pattern: /landmine/i, equipment: 'Landmine' },

  // Benches & racks
  { pattern: /preacher/i, equipment: 'Preacher Curl Bench' },
  { pattern: /incline.*bench|bench.*incline/i, equipment: 'Adjustable Bench' },
  { pattern: /decline.*bench|bench.*decline/i, equipment: 'Decline Bench' },
  { pattern: /flat.*bench|bench\s*press/i, equipment: 'Flat Bench' },

  // Other
  { pattern: /dip\s*station|dip\s*bar|parallel\s*bar/i, equipment: 'Dip Station' },
  { pattern: /pull[\s-]*up\s*bar|chin[\s-]*up\s*bar/i, equipment: 'Pull-Up Bar' },
  { pattern: /roman\s*chair|ghd|glute.*ham/i, equipment: 'GHD / Roman Chair' },
  { pattern: /suspension|trx/i, equipment: 'TRX / Suspension Trainer' },
  { pattern: /battle\s*rope/i, equipment: 'Battle Ropes' },
  { pattern: /sled|prowler/i, equipment: 'Sled' },
  { pattern: /plyo.*box|box\s*jump/i, equipment: 'Plyo Box' },
];

// Fallback: derive from the generic equipment column + exercise name
const genericFallbacks: Record<string, string> = {
  'barbell': 'Barbell',
  'dumbbell': 'Dumbbells',
  'kettlebells': 'Kettlebells',
  'resistance band': 'Resistance Bands',
  'bodyweight': 'Bodyweight',
  'exercise ball': 'Exercise Ball',
  'foam roller': 'Foam Roller',
  'medicine ball': 'Medicine Ball',
  'bosu ball': 'BOSU Ball',
};

/**
 * Determine the specific equipment for an exercise.
 * @param exerciseName The exercise name
 * @param genericEquipment The current generic equipment value (e.g. "Machine", "Barbell")
 * @returns The specific equipment string
 */
export function getSpecificEquipment(exerciseName: string, genericEquipment: string): string {
  // Try name-based rules first
  for (const rule of rules) {
    if (rule.pattern.test(exerciseName)) {
      return rule.equipment;
    }
  }

  // For "Machine" equipment, derive from exercise name
  if (genericEquipment.toLowerCase() === 'machine') {
    // Try to extract the machine type from the exercise name
    const name = exerciseName.toLowerCase();

    if (name.includes('pushdown') || name.includes('push down')) return 'Cable Machine';
    if (name.includes('fly') || name.includes('flye')) return 'Cable Machine';
    if (name.includes('curl') && name.includes('cable')) return 'Cable Machine';
    if (name.includes('row') && !name.includes('barbell') && !name.includes('dumbbell')) return 'Cable Machine';
    if (name.includes('press') && name.includes('chest')) return 'Chest Press Machine';
    if (name.includes('press') && name.includes('shoulder')) return 'Shoulder Press Machine';
    if (name.includes('press') && name.includes('leg')) return 'Leg Press Machine';
    if (name.includes('extension') && name.includes('leg')) return 'Leg Extension Machine';
    if (name.includes('extension') && name.includes('back')) return 'Back Extension Machine';
    if (name.includes('curl') && name.includes('leg')) return 'Leg Curl Machine';
    if (name.includes('curl') && name.includes('ham')) return 'Leg Curl Machine';
    if (name.includes('abduction')) return 'Hip Abduction Machine';
    if (name.includes('adduction')) return 'Hip Adduction Machine';
    if (name.includes('crunch')) return 'Ab Crunch Machine';
    if (name.includes('pulldown') || name.includes('pull-down') || name.includes('pull down')) return 'Lat Pulldown Machine';

    // Generic cable catch-all for remaining "Machine" exercises
    return 'Cable Machine';
  }

  // Use generic fallback
  const fallback = genericFallbacks[genericEquipment.toLowerCase()];
  return fallback || genericEquipment;
}
