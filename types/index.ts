export interface Exercise {
  id: number;
  name: string;
  bodyPart: string;
  equipment: string;
  instructions: string;
  isCustom: boolean;
  exerciseType: 'standard' | 'weight_only' | 'time';
}

export interface WorkoutTemplate {
  id: number;
  name: string;
  estimatedDuration: number;
}

export interface TemplateExercise {
  id: number;
  templateId: number;
  exerciseId: number;
  exerciseName: string;
  bodyPart: string;
  equipment: string;
  instructions: string;
  sets: number;
  targetReps: number;
  restTime: number;
  order: number;
  supersetGroup: number | null;
  exerciseType?: 'standard' | 'weight_only' | 'time';
}

export interface WorkoutLog {
  id: number;
  templateId: number | null;
  templateName: string | null;
  date: string;
  duration: number;
}

export interface SetLog {
  id: number;
  workoutLogId: number;
  exerciseId: number;
  exerciseName: string;
  setNumber: number;
  reps: number;
  weight: number;
  isDropSet: boolean;
}

export interface GymProfile {
  id: number;
  name: string;
  equipment: string[];
  isActive: boolean;
  isTravelMode: boolean;
}

export interface ProgressData {
  date: string;
  maxWeight: number;
  totalVolume: number;
}

export interface ProgressiveSuggestion {
  type: 'increase_weight' | 'add_drop_set' | 'maintain';
  newWeight?: number;
  suggestedReps?: number;
  message: string;
}

export interface PersonalRecord {
  id: number;
  exerciseId: number;
  exerciseName?: string;
  recordType: 'max_weight' | 'max_volume' | 'estimated_1rm';
  value: number;
  date: string;
  workoutLogId: number | null;
}

export interface ExerciseProgressionConfig {
  id: number;
  exerciseId: number;
  progressionRule: 'double_progression' | 'linear';
  progressionType: 'reps' | 'weight_only' | 'time';
  repRangeMin: number;
  repRangeMax: number;
  weightIncrement: number;
  sensitivity: 'aggressive' | 'moderate' | 'conservative';
}

export interface ProgressionRecommendation {
  id: number;
  exerciseId: number;
  exerciseName?: string;
  type: 'PROGRESS_WEIGHT' | 'PROGRESS_REPS' | 'DELOAD' | 'CHANGE_EXERCISE';
  message: string;
  suggestedWeight: number | null;
  suggestedReps: number | null;
  suggestedExerciseId: number | null;
  status: 'active' | 'dismissed' | 'applied';
  createdAt: string;
  dismissedAt: string | null;
}

export interface SessionSummary {
  duration: number;
  totalSets: number;
  totalVolume: number;
  exercisesDone: number;
  personalRecords: PersonalRecord[];
}
