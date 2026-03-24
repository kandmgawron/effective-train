# Exercise Database Setup Instructions

## Current Status
The app is set up to seed exercises from the database initialization, but currently only has 14 sample exercises.

## To Import Your Full Exercise Database

### Option 1: Use the Full CSV File (Recommended)

1. **Save the full CSV file**
   - Ensure `fitnotes_exercises_standardized_plus_missing.csv` contains all ~870 exercises
   - Place it in the project root directory

2. **Generate SQL inserts**
   ```bash
   node scripts/generate-sql-inserts.js
   ```
   This will create `lib/exercise-inserts.txt` with all the INSERT statements

3. **Update database.ts**
   - Copy the contents of `lib/exercise-inserts.txt`
   - Paste them into `lib/database.ts` in the seeding section (replace the defaultExercises array logic)

4. **Delete the old database**
   ```bash
   rm -rf .expo
   ```
   This forces the app to recreate the database with new exercises

5. **Restart the app**
   The app will initialize with all ~870 exercises

### Option 2: Manual SQL Import

If you prefer to import directly:

1. Create a SQL file with all exercises:
   ```sql
   INSERT INTO exercises (name, body_part, equipment, instructions, is_custom) VALUES
   ('Exercise Name', 'Body Part', 'Equipment', 'Instructions', 0);
   ```

2. Use SQLite to import:
   ```bash
   sqlite3 path/to/gymtracker.db < exercises.sql
   ```

### Current Files

- `scripts/generate-sql-inserts.js` - Generates SQL INSERT statements from CSV
- `scripts/generate-seed.js` - Generates TypeScript seed data (alternative approach)
- `lib/database.ts` - Database initialization with seeding logic

### Exercise Data Format

Each exercise needs:
- **name**: Exercise name (e.g., "Barbell Bench Press")
- **body_part**: Primary muscle group (e.g., "Chest", "Legs", "Back")
- **equipment**: Equipment type (e.g., "Barbell", "Dumbbell", "Machine", "Bodyweight")
- **instructions**: Brief description of how to perform
- **is_custom**: 0 for default exercises, 1 for user-added

### Equipment Mapping

The import script maps equipment to these categories:
- Bodyweight
- Barbell
- Dumbbell
- Machine
- Cable
- Kettlebells
- Resistance Band
- Medicine Ball
- Exercise Ball
- Foam Roller
- EZ Bar
- Other

### Body Part Categories

Common body parts from your CSV:
- Chest
- Back
- Legs
- Shoulders
- Arms (Biceps/Triceps)
- Abdominals
- Calves
- Gluteals
- Hamstrings
- Quadriceps
- Forearms
- Trapezius
- Lats
- Adductors
- Abductors
- Cardio

## Troubleshooting

**Issue**: CSV file not found
- **Solution**: Ensure the CSV file is in the project root with the exact name `fitnotes_exercises_standardized_plus_missing.csv`

**Issue**: Only 2-3 exercises imported
- **Solution**: The CSV file is incomplete. You need the full file with all ~870 exercises

**Issue**: App still shows old exercises
- **Solution**: Delete the `.expo` folder and restart the app to force database recreation

**Issue**: Duplicate exercises
- **Solution**: The database has a unique constraint on exercise names. Duplicates will be skipped.

## Next Steps

Once you have the full CSV file:
1. Run the generator script
2. Update the database.ts file
3. Delete the old database
4. Restart the app
5. Verify all exercises are loaded in the Exercise Library tab
