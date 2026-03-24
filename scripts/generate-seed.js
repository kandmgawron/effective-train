const fs = require('fs');

// Read the CSV content from the document you provided
const csvContent = fs.readFileSync('fitnotes_exercises_standardized_plus_missing.csv', 'utf-8');

const lines = csvContent.split('\n');
const exercises = [];

// Skip header
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  // Parse CSV line (handle quoted fields)
  const values = parseCSVLine(line);
  if (values.length < 9) continue;
  
  const name = values[2]; // standardized_exercise_name
  const equipment = values[4]; // standardized_equipment
  const categories = values[7]; // categories (body parts)
  
  if (!name || name === 'standardized_exercise_name') continue;
  
  // Determine body part (use first category)
  const bodyParts = categories.split(',').map(c => c.trim());
  const bodyPart = bodyParts[0] || 'Other';
  
  // Map equipment to simpler categories
  const equipmentType = mapEquipment(equipment);
  
  // Generate basic instructions
  const instructions = generateInstructions(name, bodyPart, equipmentType);
  
  exercises.push({ name, bodyPart, equipment: equipmentType, instructions });
}

console.log(`Parsed ${exercises.length} exercises`);

// Generate TypeScript code
let output = `// Auto-generated exercise seed data\n`;
output += `// Total exercises: ${exercises.length}\n\n`;
output += `export const exerciseSeedData = [\n`;

for (const ex of exercises) {
  const name = ex.name.replace(/'/g, "''");
  const bodyPart = ex.bodyPart.replace(/'/g, "''");
  const equipment = ex.equipment.replace(/'/g, "''");
  const instructions = ex.instructions.replace(/'/g, "''");
  
  output += `  ['${name}', '${bodyPart}', '${equipment}', '${instructions}'],\n`;
}

output += `];\n`;

fs.writeFileSync('lib/exercise-seed-data.ts', output);
console.log('Generated lib/exercise-seed-data.ts');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
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
  
  if (lower.includes('press')) {
    return `Press the ${equipment.toLowerCase()} with controlled movement, focusing on ${bodyPart.toLowerCase()}. Lower slowly and repeat.`;
  }
  if (lower.includes('curl')) {
    return `Curl the ${equipment.toLowerCase()} towards your body, contracting ${bodyPart.toLowerCase()}. Lower with control.`;
  }
  if (lower.includes('squat')) {
    return `Lower your body by bending knees and hips, keeping back straight. Push through heels to return to start.`;
  }
  if (lower.includes('deadlift')) {
    return `Lift the weight by extending hips and knees, keeping back straight. Lower with control to starting position.`;
  }
  if (lower.includes('row')) {
    return `Pull the ${equipment.toLowerCase()} towards your body, squeezing shoulder blades together. Lower with control.`;
  }
  if (lower.includes('raise') || lower.includes('lateral')) {
    return `Raise the ${equipment.toLowerCase()} to shoulder height, focusing on ${bodyPart.toLowerCase()}. Lower slowly.`;
  }
  if (lower.includes('pull')) {
    return `Pull the ${equipment.toLowerCase()} with controlled movement, engaging ${bodyPart.toLowerCase()}. Return to start.`;
  }
  if (lower.includes('extension')) {
    return `Extend fully, focusing on ${bodyPart.toLowerCase()} contraction. Return to starting position with control.`;
  }
  if (lower.includes('fly') || lower.includes('flye')) {
    return `Move arms in an arc motion, focusing on ${bodyPart.toLowerCase()} stretch and contraction.`;
  }
  if (lower.includes('crunch') || lower.includes('sit-up')) {
    return `Contract abdominals to lift upper body. Lower with control, maintaining tension throughout.`;
  }
  if (lower.includes('plank')) {
    return `Hold body in straight line, engaging core. Maintain position for prescribed duration.`;
  }
  if (lower.includes('lunge')) {
    return `Step forward and lower body until both knees are bent at 90 degrees. Push back to start.`;
  }
  
  return `Perform ${name} with proper form, focusing on ${bodyPart.toLowerCase()}. Control the movement throughout.`;
}
