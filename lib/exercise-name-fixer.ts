/**
 * Standardizes exercise names to format: Equipment Exercise Specifics
 * e.g. "Dumbbell Bench Press Incline", "Barbell Squat Front"
 * Also provides exercise similarity scoring for swap matching.
 */

// Direct name replacements for the most common inconsistencies
const nameReplacements: [RegExp, string][] = [
  // Bench press variants
  [/^Dumbbell Bench Press$/i, 'Dumbbell Bench Press'],
  [/^Dumbbell Bench Press with Neutral Grip$/i, 'Dumbbell Bench Press Neutral Grip'],
  [/^Decline Dumbbell Bench Press$/i, 'Dumbbell Bench Press Decline'],
  [/^Incline Dumbbell Press$/i, 'Dumbbell Bench Press Incline'],
  [/^Incline Dumbbell Bench with Palms Facing in$/i, 'Dumbbell Bench Press Incline Neutral Grip'],
  [/^Hammer Grip Incline Db Bench Press$/i, 'Dumbbell Bench Press Incline Hammer Grip'],
  [/^One Arm Dumbbell Bench Press$/i, 'Dumbbell Bench Press Single Arm'],
  [/^Barbell Bench Press - Medium Grip$/i, 'Barbell Bench Press'],
  [/^Barbell Incline Bench Press - Medium Grip$/i, 'Barbell Bench Press Incline'],
  [/^Barbell Incline Shoulder Raise$/i, 'Barbell Shoulder Raise Incline'],
  [/^Decline Barbell Bench Press$/i, 'Barbell Bench Press Decline'],
  [/^Close-Grip Barbell Bench Press$/i, 'Barbell Bench Press Close Grip'],
  [/^Wide-Grip Decline Barbell Bench Press$/i, 'Barbell Bench Press Decline Wide Grip'],
  [/^Barbell Guillotine Bench Press$/i, 'Barbell Bench Press Guillotine'],
  [/^Bench Press - Powerlifting$/i, 'Barbell Bench Press Powerlifting'],
  [/^Bench Press - with Bands$/i, 'Resistance Band Bench Press'],
  [/^Bench Press with Chains$/i, 'Barbell Bench Press with Chains'],
  [/^Board Press$/i, 'Barbell Board Press'],
  [/^Pin Presses$/i, 'Barbell Pin Press'],
  [/^Decline Smith Press$/i, 'Smith Machine Bench Press Decline'],
  [/^Smith Machine Decline Press$/i, 'Smith Machine Bench Press Decline'],
  [/^Smith Machine Incline Bench Press$/i, 'Smith Machine Bench Press Incline'],

  // Curls
  [/^Dumbbell Alternate Bicep Curl$/i, 'Dumbbell Bicep Curl Alternating'],
  [/^Dumbbell Bicep Curl$/i, 'Dumbbell Bicep Curl'],
  [/^Alternate Incline Dumbbell Curl$/i, 'Dumbbell Curl Incline Alternating'],
  [/^Incline Dumbbell Curl$/i, 'Dumbbell Curl Incline'],
  [/^Flexor Incline Dumbbell Curls$/i, 'Dumbbell Curl Incline Flexor'],
  [/^Dumbbell Prone Incline Curl$/i, 'Dumbbell Curl Prone Incline'],
  [/^Incline Hammer Curls$/i, 'Dumbbell Hammer Curl Incline'],
  [/^Incline Inner Biceps Curl$/i, 'Dumbbell Inner Bicep Curl Incline'],
  [/^Cross Body Hammer Curl$/i, 'Dumbbell Hammer Curl Cross Body'],
  [/^Alternate Hammer Curl$/i, 'Dumbbell Hammer Curl Alternating'],
  [/^Concentration Curls$/i, 'Dumbbell Concentration Curl'],
  [/^Barbell Curls Lying Against An Incline$/i, 'Barbell Curl Incline'],
  [/^Close-Grip Standing Barbell Curl$/i, 'Barbell Curl Close Grip'],
  [/^Close-Grip EZ Bar Curl$/i, 'EZ Bar Curl Close Grip'],
  [/^Close-Grip EZ-Bar Curl with Band$/i, 'EZ Bar Curl Close Grip with Band'],
  [/^Cable Hammer Curls - Rope Attachment$/i, 'Cable Hammer Curl Rope'],
  [/^Cable Preacher Curl$/i, 'Cable Preacher Curl'],
  [/^One Arm Dumbbell Preacher Curl$/i, 'Dumbbell Preacher Curl Single Arm'],
  [/^Preacher Hammer Dumbbell Curl$/i, 'Dumbbell Preacher Curl Hammer'],
  [/^Lying Supine Dumbbell Curl$/i, 'Dumbbell Curl Lying Supine'],
  [/^Lying High Bench Barbell Curl$/i, 'Barbell Curl Lying High Bench'],

  // Rows
  [/^Bent Over Barbell Row$/i, 'Barbell Row Bent Over'],
  [/^Bent Over Two-Arm Long Bar Row$/i, 'Barbell Row Bent Over Two Arm'],
  [/^Bent Over One-Arm Long Bar Row$/i, 'Barbell Row Bent Over Single Arm'],
  [/^Bent Over Two-Dumbbell Row$/i, 'Dumbbell Row Bent Over'],
  [/^Bent Over Two-Dumbbell Row with Palms in$/i, 'Dumbbell Row Bent Over Neutral Grip'],
  [/^Bent-Over Row$/i, 'Dumbbell Row Bent Over'],
  [/^One-Arm Dumbbell Row$/i, 'Dumbbell Row Single Arm'],
  [/^Dumbbell Incline Row$/i, 'Dumbbell Row Incline'],
  [/^Seated Cable Rows$/i, 'Cable Row Seated'],
  [/^Seated One-Arm Cable Pulley Rows$/i, 'Cable Row Seated Single Arm'],
  [/^Kneeling High Pulley Row$/i, 'Cable Row Kneeling High'],
  [/^Kneeling Single-Arm High Pulley Row$/i, 'Cable Row Kneeling Single Arm'],
  [/^Low Pulley Row to Neck$/i, 'Cable Row Low Pulley to Neck'],
  [/^Elevated Cable Rows$/i, 'Cable Row Elevated'],
  [/^Cable Rope Rear-Delt Rows$/i, 'Cable Row Rear Delt Rope'],
  [/^Reverse Grip Bent-Over Rows$/i, 'Barbell Row Reverse Grip'],
  [/^Smith Machine Bent Over Row$/i, 'Smith Machine Row Bent Over'],
  [/^T-Bar Row with Handle$/i, 'T-Bar Row'],
  [/^Lying T-Bar Row$/i, 'T-Bar Row Lying'],
  [/^Lying Cambered Barbell Row$/i, 'Barbell Row Lying Cambered'],
  [/^Barbell Rear Delt Row$/i, 'Barbell Row Rear Delt'],
  [/^Inverted Row with Straps$/i, 'Bodyweight Row Inverted with Straps'],
  [/^Inverted Row$/i, 'Bodyweight Row Inverted'],
  [/^Alternating Renegade Row$/i, 'Kettlebell Row Renegade Alternating'],
  [/^Alternating Kettlebell Row$/i, 'Kettlebell Row Alternating'],
  [/^One-Arm Kettlebell Row$/i, 'Kettlebell Row Single Arm'],
  [/^Two-Arm Kettlebell Row$/i, 'Kettlebell Row Two Arm'],
  [/^One-Arm Long Bar Row$/i, 'Barbell Row Single Arm'],
  [/^Chest-Supported Row$/i, 'Dumbbell Row Chest Supported'],

  // Shoulder press
  [/^Dumbbell Shoulder Press$/i, 'Dumbbell Shoulder Press'],
  [/^Dumbbell One-Arm Shoulder Press$/i, 'Dumbbell Shoulder Press Single Arm'],
  [/^Seated Dumbbell Press$/i, 'Dumbbell Shoulder Press Seated'],
  [/^Standing Dumbbell Press$/i, 'Dumbbell Shoulder Press Standing'],
  [/^Arnold Dumbbell Press$/i, 'Dumbbell Arnold Press'],
  [/^Cable Shoulder Press$/i, 'Cable Shoulder Press'],
  [/^Cable Seated Lateral Raise$/i, 'Cable Lateral Raise Seated'],
  [/^Machine Shoulder \(Military\) Press$/i, 'Machine Shoulder Press'],
  [/^Leverage Shoulder Press$/i, 'Machine Shoulder Press Leverage'],
  [/^Smith Machine Overhead Shoulder Press$/i, 'Smith Machine Shoulder Press'],
  [/^Seated Barbell Military Press$/i, 'Barbell Military Press Seated'],
  [/^Standing Military Press$/i, 'Barbell Military Press Standing'],
  [/^Standing Barbell Press Behind Neck$/i, 'Barbell Press Behind Neck'],
  [/^Shoulder Press - with Bands$/i, 'Resistance Band Shoulder Press'],

  // Lateral raises
  [/^Side Lateral Raise$/i, 'Dumbbell Lateral Raise'],
  [/^Seated Side Lateral Raise$/i, 'Dumbbell Lateral Raise Seated'],
  [/^One-Arm Side Laterals$/i, 'Dumbbell Lateral Raise Single Arm'],
  [/^One-Arm Incline Lateral Raise$/i, 'Dumbbell Lateral Raise Incline Single Arm'],
  [/^Lying One-Arm Lateral Raise$/i, 'Dumbbell Lateral Raise Lying Single Arm'],
  [/^Lateral Raise - with Bands$/i, 'Resistance Band Lateral Raise'],
  [/^Front Dumbbell Raise$/i, 'Dumbbell Front Raise'],
  [/^Front Two-Dumbbell Raise$/i, 'Dumbbell Front Raise Two Arm'],
  [/^Front Incline Dumbbell Raise$/i, 'Dumbbell Front Raise Incline'],
  [/^Front Cable Raise$/i, 'Cable Front Raise'],
  [/^Front Plate Raise$/i, 'Plate Front Raise'],

  // Pulldowns
  [/^Wide-Grip Lat Pulldown$/i, 'Cable Lat Pulldown Wide Grip'],
  [/^Close-Grip Front Lat Pulldown$/i, 'Cable Lat Pulldown Close Grip'],
  [/^Full Range-of-Motion Lat Pulldown$/i, 'Cable Lat Pulldown Full ROM'],
  [/^One Arm Lat Pulldown$/i, 'Cable Lat Pulldown Single Arm'],
  [/^V-Bar Pulldown$/i, 'Cable Lat Pulldown V-Bar'],
  [/^Wide-Grip Pulldown Behind the Neck$/i, 'Cable Lat Pulldown Behind Neck'],
  [/^Underhand Cable Pulldowns$/i, 'Cable Lat Pulldown Underhand'],

  // Squats
  [/^Barbell Full Squat$/i, 'Barbell Squat'],
  [/^Barbell Squat to A Bench$/i, 'Barbell Squat to Bench'],
  [/^Barbell Side Split Squat$/i, 'Barbell Split Squat Side'],
  [/^Dumbbell Squat$/i, 'Dumbbell Squat'],
  [/^Dumbbell Squat to A Bench$/i, 'Dumbbell Squat to Bench'],
  [/^Front Squat \(Clean Grip\)$/i, 'Barbell Front Squat'],
  [/^Front Barbell Squat$/i, 'Barbell Front Squat'],
  [/^Front Barbell Squat to A Bench$/i, 'Barbell Front Squat to Bench'],
  [/^Wide Stance Barbell Squat$/i, 'Barbell Squat Wide Stance'],
  [/^Narrow Stance Squats$/i, 'Barbell Squat Narrow Stance'],
  [/^Smith Machine Squat$/i, 'Smith Machine Squat'],
  [/^Goblet Squat$/i, 'Kettlebell Goblet Squat'],
  [/^Plie Dumbbell Squat$/i, 'Dumbbell Squat Plie'],
  [/^Overhead Squat$/i, 'Barbell Squat Overhead'],
  [/^Frankenstein Squat$/i, 'Barbell Squat Frankenstein'],

  // Lunges
  [/^Dumbbell Lunges$/i, 'Dumbbell Lunge'],
  [/^Dumbbell Rear Lunge$/i, 'Dumbbell Lunge Reverse'],
  [/^Barbell Lunge$/i, 'Barbell Lunge'],
  [/^Barbell Walking Lunge$/i, 'Barbell Lunge Walking'],
  [/^Bodyweight Walking Lunge$/i, 'Bodyweight Lunge Walking'],

  // Triceps
  [/^Dumbbell One-Arm Triceps Extension$/i, 'Dumbbell Tricep Extension Single Arm'],
  [/^Lying Dumbbell Tricep Extension$/i, 'Dumbbell Tricep Extension Lying'],
  [/^Decline Dumbbell Triceps Extension$/i, 'Dumbbell Tricep Extension Decline'],
  [/^Cable Rope Overhead Triceps Extension$/i, 'Cable Tricep Extension Overhead Rope'],
  [/^Cable One Arm Tricep Extension$/i, 'Cable Tricep Extension Single Arm'],
  [/^Cable Incline Triceps Extension$/i, 'Cable Tricep Extension Incline'],
  [/^Cable Lying Triceps Extension$/i, 'Cable Tricep Extension Lying'],
  [/^Kneeling Cable Triceps Extension$/i, 'Cable Tricep Extension Kneeling'],
  [/^Incline Barbell Triceps Extension$/i, 'Barbell Tricep Extension Incline'],

  // Cable exercises with " - Attachment" patterns
  [/^Triceps Pushdown - Rope Attachment$/i, 'Cable Tricep Pushdown Rope'],
  [/^Triceps Pushdown - V-Bar Attachment$/i, 'Cable Tricep Pushdown V-Bar'],
  [/^Triceps Pushdown$/i, 'Cable Tricep Pushdown'],
  [/^Triceps Overhead Extension with Rope$/i, 'Cable Tricep Extension Overhead Rope'],
  [/^Cable Hammer Curls - Rope Attachment$/i, 'Cable Hammer Curl Rope'],
  [/^Cable Rope Overhead Triceps Extension$/i, 'Cable Tricep Extension Overhead Rope'],
  [/^Cable Rope Rear-Delt Rows$/i, 'Cable Row Rear Delt Rope'],

  // "with Bands" patterns
  [/^Back Flyes - with Bands$/i, 'Resistance Band Back Flye'],
  [/^Bench Press - with Bands$/i, 'Resistance Band Bench Press'],
  [/^Calf Raises - with Bands$/i, 'Resistance Band Calf Raise'],
  [/^Cross Over - with Bands$/i, 'Resistance Band Crossover'],
  [/^Lateral Raise - with Bands$/i, 'Resistance Band Lateral Raise'],
  [/^Shoulder Press - with Bands$/i, 'Resistance Band Shoulder Press'],
  [/^Upright Row - with Bands$/i, 'Resistance Band Upright Row'],
  [/^Squat with Bands$/i, 'Barbell Squat with Bands'],
  [/^Deadlift with Bands$/i, 'Barbell Deadlift with Bands'],
  [/^Hip Extension with Bands$/i, 'Resistance Band Hip Extension'],
  [/^Hip Flexion with Band$/i, 'Resistance Band Hip Flexion'],
  [/^Hip Lift with Band$/i, 'Resistance Band Hip Lift'],
  [/^Internal Rotation with Band$/i, 'Resistance Band Internal Rotation'],
  [/^External Rotation with Band$/i, 'Resistance Band External Rotation'],
  [/^Close-Grip EZ-Bar Curl with Band$/i, 'EZ Bar Curl Close Grip with Band'],

  // Dips
  [/^Dips - Chest Version$/i, 'Bodyweight Dip Chest'],
  [/^Dips - Triceps Version$/i, 'Bodyweight Dip Triceps'],
  [/^Parallel Bar Dip$/i, 'Bodyweight Dip Parallel Bar'],
  [/^Bench Dips$/i, 'Bodyweight Bench Dip'],

  // Push-ups
  [/^Push-Ups - Close Triceps Position$/i, 'Bodyweight Push-Up Close Grip'],
  [/^Push-Ups \(Close and Wide Hand Positions\)$/i, 'Bodyweight Push-Up Close and Wide'],
  [/^Push-Ups with Feet Elevated$/i, 'Bodyweight Push-Up Feet Elevated'],
  [/^Push-Ups with Feet on An Exercise Ball$/i, 'Exercise Ball Push-Up Feet Elevated'],
  [/^Push-Up Wide$/i, 'Bodyweight Push-Up Wide'],
  [/^Push Up to Side Plank$/i, 'Bodyweight Push-Up to Side Plank'],
  [/^Plyo Push-Up$/i, 'Bodyweight Push-Up Plyo'],
  [/^Clock Push-Up$/i, 'Bodyweight Push-Up Clock'],
  [/^Drop Push$/i, 'Bodyweight Push-Up Drop'],
  [/^Decline Push-Up$/i, 'Bodyweight Push-Up Decline'],
  [/^Incline Push-Up$/i, 'Bodyweight Push-Up Incline'],
  [/^Incline Push-Up Close-Grip$/i, 'Bodyweight Push-Up Incline Close Grip'],
  [/^Incline Push-Up Medium$/i, 'Bodyweight Push-Up Incline Medium'],
  [/^Incline Push-Up Reverse Grip$/i, 'Bodyweight Push-Up Incline Reverse Grip'],
  [/^Incline Push-Up Wide$/i, 'Bodyweight Push-Up Incline Wide'],
  [/^Incline Push-Up Depth Jump$/i, 'Bodyweight Push-Up Incline Depth Jump'],

  // Barbell specifics with dashes
  [/^Barbell Ab Rollout - on Knees$/i, 'Barbell Ab Rollout Kneeling'],
  [/^Barbell Bench Press - Medium Grip$/i, 'Barbell Bench Press'],
  [/^Barbell Incline Bench Press - Medium Grip$/i, 'Barbell Bench Press Incline'],
  [/^Bench Press - Powerlifting$/i, 'Barbell Bench Press Powerlifting'],
  [/^Hang Clean - Below the Knees$/i, 'Barbell Hang Clean Below Knees'],
  [/^Hang Snatch - Below Knees$/i, 'Barbell Hang Snatch Below Knees'],
  [/^Isometric Neck Exercise - Front and Back$/i, 'Isometric Neck Exercise Front and Back'],
  [/^Isometric Neck Exercise - Sides$/i, 'Isometric Neck Exercise Sides'],

  // Flyes
  [/^Dumbbell Flyes$/i, 'Dumbbell Chest Flye'],
  [/^Decline Dumbbell Flyes$/i, 'Dumbbell Chest Flye Decline'],
  [/^Incline Dumbbell Flyes$/i, 'Dumbbell Chest Flye Incline'],
  [/^Incline Dumbbell Flyes - with A Twist$/i, 'Dumbbell Chest Flye Incline with Twist'],
  [/^Flat Bench Cable Flyes$/i, 'Cable Chest Flye Flat'],
  [/^Incline Cable Flye$/i, 'Cable Chest Flye Incline'],

  // Step ups
  [/^Dumbbell Step Ups$/i, 'Dumbbell Step Up'],
  [/^Barbell Step Ups$/i, 'Barbell Step Up'],
  [/^Dumbbell Seated Box Jump$/i, 'Dumbbell Box Jump Seated'],

  // Misc cable exercises tagged as "Machine"
  [/^Cable Chest Press$/i, 'Cable Chest Press'],
  [/^Cable Crossover$/i, 'Cable Crossover'],
  [/^Cable Crunch$/i, 'Cable Crunch'],
  [/^Cable Deadlifts$/i, 'Cable Deadlift'],
  [/^Cable Hip Adduction$/i, 'Cable Hip Adduction'],
  [/^Cable Incline Pushdown$/i, 'Cable Incline Pushdown'],
  [/^Cable Internal Rotation$/i, 'Cable Internal Rotation'],
  [/^Cable Iron Cross$/i, 'Cable Iron Cross'],
  [/^Cable Judo Flip$/i, 'Cable Judo Flip'],
  [/^Cable Preacher Curl$/i, 'Cable Preacher Curl'],
  [/^Cable Rear Delt Fly$/i, 'Cable Rear Delt Flye'],
  [/^Cable Reverse Crunch$/i, 'Cable Reverse Crunch'],
  [/^Cable Russian Twists$/i, 'Cable Russian Twist'],
  [/^Cable Seated Crunch$/i, 'Cable Crunch Seated'],
  [/^Cable Shrugs$/i, 'Cable Shrug'],
  [/^Cable Wrist Curl$/i, 'Cable Wrist Curl'],
];

/**
 * Get the standardized name for an exercise.
 * First checks manual replacements, then applies automatic restructuring.
 */
export function getStandardizedName(name: string): string | null {
  // Check manual replacements first
  for (const [pattern, replacement] of nameReplacements) {
    if (pattern.test(name)) {
      return replacement;
    }
  }

  // Auto-restructure: move position/modifier prefixes to the end
  const result = autoRestructure(name);
  if (result !== name) return result;

  return null;
}

// Position/modifier words that should be at the end, not the start
const positionPrefixes = [
  'lying', 'seated', 'standing', 'kneeling', 'incline', 'decline',
  'prone', 'supine', 'overhead', 'elevated', 'suspended',
  'one-arm', 'one arm', 'single-arm', 'single arm',
  'alternate', 'alternating',
];

// Equipment words that should be at the front
const equipmentWords = [
  'barbell', 'dumbbell', 'kettlebell', 'cable', 'machine', 'smith machine',
  'ez bar', 'ez-bar', 'resistance band', 'medicine ball', 'exercise ball',
  'foam roller', 'bosu ball', 'bodyweight', 'trap bar',
];

function autoRestructure(name: string): string {
  let lower = name.toLowerCase();

  // Don't touch stretches, SMR, or very short names
  if (lower.includes('stretch') || lower.includes('-smr') || lower.includes('smr') || name.split(' ').length <= 2) {
    return name;
  }

  // Check if a position prefix is at the start
  for (const prefix of positionPrefixes) {
    if (lower.startsWith(prefix + ' ')) {
      const rest = name.slice(prefix.length + 1).trim();
      // Don't move if the rest is very short
      if (rest.split(' ').length < 2) continue;

      // Check if equipment is already at the front of the rest
      const restLower = rest.toLowerCase();
      let hasEquipFront = false;
      for (const eq of equipmentWords) {
        if (restLower.startsWith(eq + ' ') || restLower.startsWith(eq + '-')) {
          hasEquipFront = true;
          break;
        }
      }

      if (hasEquipFront) {
        // Equipment is already in the right place, just move the prefix to end
        const capitalPrefix = prefix.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        return `${rest} ${capitalPrefix}`;
      }

      // No equipment at front of rest — just move prefix to end
      const capitalPrefix = prefix.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return `${rest} ${capitalPrefix}`;
    }
  }

  return name;
}

/**
 * Extract the core movement from an exercise name.
 * Used for swap matching — exercises with the same core movement are better matches.
 * e.g. "Dumbbell Bench Press Incline" → "bench press"
 */
export function getCoreMovement(name: string): string {
  const lower = name.toLowerCase();
  const movements = [
    'bench press', 'shoulder press', 'military press', 'overhead press',
    'squat', 'deadlift', 'lunge', 'step up',
    'row', 'pulldown', 'pull-up', 'pull up', 'chin-up', 'chin up',
    'curl', 'tricep extension', 'pushdown', 'push down',
    'fly', 'flye', 'lateral raise', 'front raise', 'rear delt',
    'leg press', 'leg extension', 'leg curl', 'calf raise',
    'hip thrust', 'glute bridge', 'good morning',
    'shrug', 'face pull', 'upright row',
    'crunch', 'sit-up', 'sit up', 'plank', 'leg raise',
    'dip', 'push-up', 'push up',
  ];
  for (const m of movements) {
    if (lower.includes(m)) return m;
  }
  return '';
}
