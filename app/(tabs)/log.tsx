import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, Modal } from 'react-native';
import { format } from 'date-fns';
import { useRouter, useFocusEffect } from 'expo-router';
import db from '@/lib/database';
import { WorkoutTemplate, TemplateExercise, Exercise } from '@/types';
import SetTimer from '@/components/SetTimer';
import { detectPersonalRecords } from '@/lib/pr-detection';
import { generateRecommendations } from '@/lib/recommendation-generator';
import { isCounterweight } from '@/lib/effective-weight';
import { useWorkout, formatElapsed } from '@/lib/workout-context';
import Icon from '@/components/Icon';

interface SetEntry {
  exerciseIndex: number;
  exerciseId: number;
  exerciseName: string;
  exerciseType: 'standard' | 'weight_only' | 'time';
  setNumber: number;
  reps: string;
  weight: string;
  status: 'pending' | 'done' | 'failed';
  supersetGroup: number | null;
  notes: string;
  showNotes: boolean;
}

export default function LogWorkout() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [sets, setSets] = useState<SetEntry[]>([]);
  const [workoutLogId, setWorkoutLogId] = useState<number | null>(null);
  const [workoutStartTime, setWorkoutStartTime] = useState<number | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [timerDuration, setTimerDuration] = useState(90);
  // swap state
  const [swapExerciseIndex, setSwapExerciseIndex] = useState<number | null>(null);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [showSwapPicker, setShowSwapPicker] = useState(false);
  const [isFreestyle, setIsFreestyle] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [allExercisesForPicker, setAllExercisesForPicker] = useState<Exercise[]>([]);
  const [preWorkoutRecs, setPreWorkoutRecs] = useState<{ type: string; message: string; exerciseName: string }[]>([]);
  const [exerciseNotes, setExerciseNotes] = useState<Record<number, string>>({});
  const [showExerciseNotes, setShowExerciseNotes] = useState<Record<number, boolean>>({});
  const [expandedMenu, setExpandedMenu] = useState<Record<number, boolean>>({});
  const [expandedInstructions, setExpandedInstructions] = useState<Record<number, boolean>>({});
  const [logMode, setLogMode] = useState<'active' | 'quick' | null>(null);
  const [nextSupersetId, setNextSupersetId] = useState(1);
  const { workoutMode, setWorkoutMode, elapsedSeconds } = useWorkout();
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      if (!selectedTemplate) {
        loadTemplates();
      }
    }, [selectedTemplate])
  );

  const loadTemplates = () => {
    const result = db.getAllSync<WorkoutTemplate>(
      'SELECT id, name, estimated_duration as estimatedDuration FROM workout_templates'
    );
    setTemplates(result);
  };

  const getLastSets = (exerciseId: number): { reps: number; weight: number }[] => {
    return db.getAllSync<{ reps: number; weight: number }>(
      `SELECT sl.reps, sl.weight FROM set_logs sl
       JOIN workout_logs wl ON sl.workout_log_id = wl.id
       WHERE sl.exercise_id = ?
       AND wl.id = (
         SELECT wl2.id FROM workout_logs wl2
         JOIN set_logs sl2 ON sl2.workout_log_id = wl2.id
         WHERE sl2.exercise_id = ?
         ORDER BY wl2.date DESC LIMIT 1
       )
       ORDER BY sl.set_number`,
      [exerciseId, exerciseId]
    );
  };

  const buildSets = useCallback((templateExercises: TemplateExercise[]): SetEntry[] => {
    const allSets: SetEntry[] = [];
    templateExercises.forEach((ex, exIdx) => {
      const lastSets = getLastSets(ex.exerciseId);
      // Check if a recommendation applied a new weight
      const nextWeightRow = db.getFirstSync<{ value: string }>(
        "SELECT value FROM user_settings WHERE key = ?",
        [`next_weight_${ex.exerciseId}`]
      );
      const nextWeight = nextWeightRow ? parseFloat(nextWeightRow.value) : null;
      // Check if a recommendation applied new reps (e.g. rep drop on weight increase)
      const nextRepsRow = db.getFirstSync<{ value: string }>(
        "SELECT value FROM user_settings WHERE key = ?",
        [`next_reps_${ex.exerciseId}`]
      );
      const nextReps = nextRepsRow ? parseInt(nextRepsRow.value) : null;
      const exType = (ex as any).exerciseType || 'standard';
      for (let s = 1; s <= ex.sets; s++) {
        const prev = lastSets[s - 1];
        let weight = prev ? String(prev.weight) : '';
        // If a recommendation set a next weight, use it (overrides last session)
        if (nextWeight != null) weight = String(nextWeight);
        // Determine reps: next_reps_ overrides prev session reps
        let reps = exType === 'weight_only' ? String(ex.targetReps) : (prev ? String(prev.reps) : String(ex.targetReps));
        if (nextReps != null && exType !== 'weight_only') reps = String(nextReps);
        allSets.push({
          exerciseIndex: exIdx,
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          exerciseType: exType,
          setNumber: s,
          reps,
          weight: exType === 'time' ? '' : weight,
          status: 'pending',
          supersetGroup: ex.supersetGroup,
          notes: '',
          showNotes: false,
        });
      }
      // Clear the next_weight and next_reps after using them (one-time use)
      if (nextWeight != null) {
        db.runSync("DELETE FROM user_settings WHERE key = ?", [`next_weight_${ex.exerciseId}`]);
      }
      if (nextReps != null) {
        db.runSync("DELETE FROM user_settings WHERE key = ?", [`next_reps_${ex.exerciseId}`]);
      }
    });
    return allSets;
  }, []);

  const handleSelectTemplate = (templateId: number, mode: 'active' | 'quick') => {
    setSelectedTemplate(templateId);
    setWorkoutStartTime(Date.now());
    setIsFreestyle(false);
    setLogMode(mode);
    setWorkoutMode(mode);

    const result = db.getAllSync<any>(`
      SELECT te.id, te.template_id as templateId, te.exercise_id as exerciseId,
             e.name as exerciseName, e.body_part as bodyPart, e.equipment,
             e.instructions, te.sets, te.target_reps as targetReps,
             te.rest_time as restTime, te.exercise_order as "order",
             te.superset_group as supersetGroup,
             COALESCE(e.exercise_type, 'standard') as exerciseType
      FROM template_exercises te
      JOIN exercises e ON te.exercise_id = e.id
      WHERE te.template_id = ?
      ORDER BY te.exercise_order
    `, [templateId]);

    setExercises(result);
    setSets(buildSets(result));

    const logResult = db.runSync(
      'INSERT INTO workout_logs (template_id, date, duration) VALUES (?, ?, 0)',
      [templateId, format(new Date(), 'yyyy-MM-dd')]
    );
    setWorkoutLogId(Number(logResult.lastInsertRowId));

    // Load pre-workout recommendations for exercises in this template
    const exerciseIds = result.map((e: any) => e.exerciseId);
    if (exerciseIds.length > 0) {
      const placeholders = exerciseIds.map(() => '?').join(',');
      const recs = db.getAllSync<any>(
        `SELECT pr.type, pr.message, e.name as exerciseName
         FROM progression_recommendations pr
         JOIN exercises e ON pr.exercise_id = e.id
         WHERE pr.status = 'active' AND pr.exercise_id IN (${placeholders})`,
        exerciseIds
      );
      setPreWorkoutRecs(recs);
    }
  };

  const startFreestyle = (mode: 'active' | 'quick') => {
    setIsFreestyle(true);
    setSelectedTemplate(-1); // sentinel value
    setWorkoutStartTime(Date.now());
    setExercises([]);
    setSets([]);
    setLogMode(mode);
    setWorkoutMode(mode);

    const logResult = db.runSync(
      'INSERT INTO workout_logs (template_id, date, duration) VALUES (?, ?, 0)',
      [null, format(new Date(), 'yyyy-MM-dd')]
    );
    setWorkoutLogId(Number(logResult.lastInsertRowId));
  };

  const openFreestyleExercisePicker = () => {
    const all = db.getAllSync<Exercise>(
      "SELECT id, name, body_part as bodyPart, equipment, instructions, is_custom as isCustom, COALESCE(exercise_type, 'standard') as exerciseType FROM exercises ORDER BY name"
    );
    setAllExercisesForPicker(all);
    setShowExercisePicker(true);
  };

  const addFreestyleExercise = (ex: Exercise) => {
    const exIdx = exercises.length;
    const exType = (ex as any).exerciseType || 'standard';
    const newTemplateEx: TemplateExercise = {
      id: Date.now(),
      templateId: 0,
      exerciseId: ex.id,
      exerciseName: ex.name,
      bodyPart: ex.bodyPart,
      equipment: ex.equipment,
      instructions: ex.instructions,
      sets: 3,
      targetReps: 10,
      restTime: 90,
      order: exIdx,
      supersetGroup: null,
      exerciseType: exType,
    };
    const updatedExercises = [...exercises, newTemplateEx];
    setExercises(updatedExercises);

    // Add 3 default sets
    const lastSets = getLastSets(ex.id);
    const newSets: SetEntry[] = [];
    for (let s = 1; s <= 3; s++) {
      const prev = lastSets[s - 1];
      newSets.push({
        exerciseIndex: exIdx,
        exerciseId: ex.id,
        exerciseName: ex.name,
        exerciseType: exType,
        setNumber: s,
        reps: exType === 'weight_only' ? '10' : (prev ? String(prev.reps) : '10'),
        weight: exType === 'time' ? '' : (prev ? String(prev.weight) : ''),
        status: 'pending',
        supersetGroup: null,
        notes: '',
        showNotes: false,
      });
    }
    setSets(prev => [...prev, ...newSets]);
    setShowExercisePicker(false);
  };

  const addSetToExercise = (exIdx: number) => {
    const ex = exercises[exIdx];
    const exSets = sets.filter(s => s.exerciseIndex === exIdx);
    const newSetNumber = exSets.length + 1;
    const lastSet = exSets[exSets.length - 1];
    const exType = (ex as any).exerciseType || 'standard';
    const newSet: SetEntry = {
      exerciseIndex: exIdx,
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      exerciseType: exType,
      setNumber: newSetNumber,
      reps: lastSet ? lastSet.reps : '10',
      weight: lastSet ? lastSet.weight : '',
      status: 'pending',
      supersetGroup: null,
      notes: '',
      showNotes: false,
    };
    // Insert after the last set of this exercise
    const lastIdx = sets.lastIndexOf(exSets[exSets.length - 1]);
    const updated = [...sets];
    updated.splice(lastIdx + 1, 0, newSet);
    setSets(updated);
  };

  const updateSet = (idx: number, field: 'reps' | 'weight', value: string) => {
    setSets(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const toggleWeightSign = (idx: number) => {
    setSets(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const val = parseFloat(s.weight);
      if (isNaN(val) || val === 0) {
        return { ...s, weight: s.weight.startsWith('-') ? s.weight.slice(1) : '-' + (s.weight || '') };
      }
      return { ...s, weight: String(-val) };
    }));
  };

  const toggleExerciseNotes = (exIdx: number) => {
    setShowExerciseNotes(prev => ({ ...prev, [exIdx]: !prev[exIdx] }));
  };

  const updateExerciseNotes = (exIdx: number, value: string) => {
    setExerciseNotes(prev => ({ ...prev, [exIdx]: value }));
  };

  const addWarmupSet = (exIdx: number) => {
    const ex = exercises[exIdx];
    const exSets = sets.filter(s => s.exerciseIndex === exIdx);
    // Warmup: half the weight of the first set, same reps
    const firstSet = exSets[0];
    const warmupWeight = firstSet ? String(Math.round(parseFloat(firstSet.weight || '0') * 0.5 * 2) / 2) : '';
    const exType = (ex as any).exerciseType || 'standard';
    const newSet: SetEntry = {
      exerciseIndex: exIdx,
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      exerciseType: exType,
      setNumber: 0, // warmup marker
      reps: firstSet ? firstSet.reps : '10',
      weight: warmupWeight,
      status: 'pending',
      supersetGroup: null,
      notes: '',
      showNotes: false,
    };
    // Insert before the first set of this exercise
    const firstIdx = sets.findIndex(s => s.exerciseIndex === exIdx);
    const updated = [...sets];
    updated.splice(firstIdx, 0, newSet);
    setSets(updated);
  };

  const toggleMenu = (exIdx: number) => {
    setExpandedMenu(prev => ({ ...prev, [exIdx]: !prev[exIdx] }));
  };

  const toggleInstructions = (exIdx: number) => {
    setExpandedInstructions(prev => ({ ...prev, [exIdx]: !prev[exIdx] }));
  };

  const linkSuperset = (exIdx: number) => {
    if (exIdx >= exercises.length - 1) return; // need a next exercise
    const current = exercises[exIdx];
    const next = exercises[exIdx + 1];
    // If current already has a group, extend it to next; otherwise create new group
    const groupId = current.supersetGroup ?? nextSupersetId;
    if (!current.supersetGroup) setNextSupersetId(prev => prev + 1);
    setExercises(prev => prev.map((ex, i) => {
      if (i === exIdx || i === exIdx + 1) return { ...ex, supersetGroup: groupId };
      return ex;
    }));
  };

  const unlinkSuperset = (exIdx: number) => {
    const groupId = exercises[exIdx].supersetGroup;
    if (groupId == null) return;
    const groupMembers = exercises.filter(e => e.supersetGroup === groupId);
    if (groupMembers.length <= 2) {
      // Remove the whole group — both exercises lose their superset
      setExercises(prev => prev.map(ex => ex.supersetGroup === groupId ? { ...ex, supersetGroup: null } : ex));
    } else {
      // Remove this exercise, then check if only 1 remains
      setExercises(prev => {
        const updated = prev.map((ex, i) => i === exIdx ? { ...ex, supersetGroup: null } : ex);
        const remaining = updated.filter(ex => ex.supersetGroup === groupId);
        if (remaining.length <= 1) {
          return updated.map(ex => ex.supersetGroup === groupId ? { ...ex, supersetGroup: null } : ex);
        }
        return updated;
      });
    }
  };

  const markSet = (idx: number, status: 'done' | 'failed') => {
    const set = sets[idx];
    if (!workoutLogId) return;
    // Validate based on exercise type
    const exType = set.exerciseType || 'standard';
    if (exType === 'weight_only' && !set.weight) return;
    if (exType === 'time' && !set.reps) return;
    if (exType === 'standard' && (!set.reps || !set.weight)) return;

    const repsVal = parseInt(set.reps) || 0;
    const weightVal = parseFloat(set.weight) || 0;

    db.runSync(
      'INSERT INTO set_logs (workout_log_id, exercise_id, set_number, reps, weight, is_drop_set, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [workoutLogId, set.exerciseId, set.setNumber, repsVal, weightVal, status === 'failed' ? 1 : 0, exerciseNotes[set.exerciseIndex] || null]
    );

    setSets(prev => prev.map((s, i) => i === idx ? { ...s, status } : s));

    // Show timer after completing a set — skip if next pending set is in same superset group
    if (logMode === 'active') {
      const exercise = exercises[set.exerciseIndex];
      const isLastSetOfExercise = set.setNumber === exercise.sets;
      const isLastExercise = set.exerciseIndex === exercises.length - 1;

      if (!(isLastSetOfExercise && isLastExercise)) {
        // Check if this exercise is in a superset and the next pending set is also in the same group
        const currentGroup = exercise.supersetGroup;
        let skipTimer = false;
        if (currentGroup !== null) {
          // Find the next pending set after this one
          const updatedSets = sets.map((s, i) => i === idx ? { ...s, status } : s);
          const nextPending = updatedSets.find((s, i) => i > idx && s.status === 'pending');
          if (nextPending) {
            const nextExercise = exercises[nextPending.exerciseIndex];
            if (nextExercise && nextExercise.supersetGroup === currentGroup) {
              skipTimer = true;
            }
          }
        }
        if (!skipTimer) {
          setTimerDuration(exercise.restTime);
          setShowTimer(true);
        }
      }
    }
  };

  const markAllDone = () => {
    if (!workoutLogId) return;
    setSets(prev => prev.map(s => {
      if (s.status !== 'pending') return s;
      const exType = s.exerciseType || 'standard';
      const canLog = exType === 'weight_only' ? !!s.weight
        : exType === 'time' ? !!s.reps
        : (!!s.reps && !!s.weight);
      if (canLog) {
        db.runSync(
          'INSERT INTO set_logs (workout_log_id, exercise_id, set_number, reps, weight, is_drop_set, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [workoutLogId, s.exerciseId, s.setNumber, parseInt(s.reps) || 0, parseFloat(s.weight) || 0, 0, exerciseNotes[s.exerciseIndex] || null]
        );
        return { ...s, status: 'done' as const };
      }
      return s;
    }));
  };

  const handleFinishWorkout = () => {
    const pendingCount = sets.filter(s => s.status === 'pending').length;
    if (pendingCount > 0) {
      Alert.alert('Incomplete Sets', `You have ${pendingCount} sets not logged. Finish anyway?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark All Done', onPress: () => { markAllDone(); finishWorkout(); } },
        { text: 'Finish', onPress: finishWorkout }
      ]);
    } else {
      finishWorkout();
    }
  };

  const finishWorkout = () => {
    if (!workoutLogId || !workoutStartTime) return;
    const duration = logMode === 'active'
      ? Math.floor((Date.now() - workoutStartTime) / 1000 / 60)
      : 0;
    db.runSync('UPDATE workout_logs SET duration = ? WHERE id = ?', [duration, workoutLogId]);

    // Detect personal records
    const date = format(new Date(), 'yyyy-MM-dd');
    detectPersonalRecords(workoutLogId, date);

    // Generate progression recommendations
    generateRecommendations(workoutLogId);

    // Reset state and navigate to insights
    setSelectedTemplate(null);
    setExercises([]);
    setSets([]);
    setWorkoutLogId(null);
    setWorkoutStartTime(null);
    setHideCompleted(false);
    setIsFreestyle(false);
    setPreWorkoutRecs([]);
    setExerciseNotes({});
    setShowExerciseNotes({});
    setExpandedMenu({});
    setExpandedInstructions({});
    setLogMode(null);
    setWorkoutMode(null);
    setNextSupersetId(1);
    loadTemplates();

    router.push('/insights');
  };

  const resetWorkout = () => {
    // Delete the cancelled workout from the database
    if (workoutLogId) {
      db.runSync('DELETE FROM set_logs WHERE workout_log_id = ?', [workoutLogId]);
      db.runSync('DELETE FROM workout_logs WHERE id = ?', [workoutLogId]);
    }
    setSelectedTemplate(null);
    setExercises([]);
    setSets([]);
    setWorkoutLogId(null);
    setWorkoutStartTime(null);
    setHideCompleted(false);
    setIsFreestyle(false);
    setPreWorkoutRecs([]);
    setExerciseNotes({});
    setShowExerciseNotes({});
    setExpandedMenu({});
    setExpandedInstructions({});
    setLogMode(null);
    setWorkoutMode(null);
    setNextSupersetId(1);
    loadTemplates();
  };

  // Swap exercise — ranked by relevance
  const openSwapPicker = (exIdx: number) => {
    setSwapExerciseIndex(exIdx);
    const currentEx = exercises[exIdx];

    // Get active gym profile equipment
    const activeProfile = db.getFirstSync<{ equipment: string }>(
      'SELECT equipment FROM gym_profiles WHERE is_active = 1 LIMIT 1'
    );
    const profileEquipment: string[] = activeProfile ? JSON.parse(activeProfile.equipment) : [];

    const all = db.getAllSync<Exercise>(
      "SELECT id, name, body_part as bodyPart, equipment, instructions, is_custom as isCustom, COALESCE(exercise_type, 'standard') as exerciseType FROM exercises ORDER BY name"
    );

    // Score and sort: same body part (+3), same equipment (+2), equipment in gym profile (+1)
    const scored = all
      .filter(ex => ex.id !== currentEx.exerciseId)
      .map(ex => {
        let score = 0;
        if (ex.bodyPart.toLowerCase() === currentEx.bodyPart.toLowerCase()) score += 3;
        if (ex.equipment.toLowerCase() === currentEx.equipment.toLowerCase()) score += 2;
        if (profileEquipment.some(eq => eq.toLowerCase() === ex.equipment.toLowerCase())) score += 1;
        return { ...ex, score };
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    setAllExercises(scored);
    setShowSwapPicker(true);
  };

  const handleSwapExercise = (newEx: Exercise) => {
    if (swapExerciseIndex === null) return;
    const oldEx = exercises[swapExerciseIndex];

    // Update exercises array
    const updatedExercises = exercises.map((ex, i) =>
      i === swapExerciseIndex
        ? { ...ex, exerciseId: newEx.id, exerciseName: newEx.name, bodyPart: newEx.bodyPart, equipment: newEx.equipment, instructions: newEx.instructions }
        : ex
    );
    setExercises(updatedExercises);

    // Update sets for this exercise
    const lastSets = getLastSets(newEx.id);
    const exType = (newEx as any).exerciseType || 'standard';
    setSets(prev => prev.map(s => {
      if (s.exerciseIndex === swapExerciseIndex) {
        const prevData = lastSets[s.setNumber - 1];
        return {
          ...s,
          exerciseId: newEx.id,
          exerciseName: newEx.name,
          exerciseType: exType,
          reps: prevData ? String(prevData.reps) : s.reps,
          weight: prevData ? String(prevData.weight) : '',
        };
      }
      return s;
    }));

    setShowSwapPicker(false);
    setSwapExerciseIndex(null);
  };

  const completedCount = sets.filter(s => s.status !== 'pending').length;
  const totalSets = sets.length;
  const displaySets = hideCompleted ? sets.filter(s => s.status === 'pending') : sets;

  // Group sets by exercise for display
  const groupedSets: { exercise: TemplateExercise; sets: (SetEntry & { globalIdx: number })[] }[] = [];
  exercises.forEach((ex, exIdx) => {
    const exSets = displaySets
      .map((s, i) => ({ ...s, globalIdx: sets.indexOf(s) }))
      .filter(s => s.exerciseIndex === exIdx);
    if (exSets.length > 0) {
      groupedSets.push({ exercise: ex, sets: exSets });
    }
  });

  const getAppliedNote = (exerciseId: number): string | null => {
    const row = db.getFirstSync<{ value: string }>(
      "SELECT value FROM user_settings WHERE key = ?",
      [`exercise_note_${exerciseId}`]
    );
    return row?.value ?? null;
  };

  const renderExerciseContent = (exercise: TemplateExercise, exSets: (SetEntry & { globalIdx: number })[]) => (
    <>
      <View style={styles.exerciseHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.exerciseTitle}>{exercise.exerciseName}</Text>
          <Text style={styles.exerciseMeta}>{exercise.bodyPart} • {exercise.equipment}</Text>
          {(() => {
            const note = getAppliedNote(exercise.exerciseId);
            if (!note) return null;
            const lastLine = note.split('\n').pop();
            return <Text style={styles.appliedNote}>{lastLine}</Text>;
          })()}
        </View>
        <TouchableOpacity style={styles.menuToggle} onPress={() => toggleMenu(exercise.order)}>
          <Text style={styles.menuToggleText}>⋯</Text>
        </TouchableOpacity>
      </View>

      {exercise.instructions ? (
        <TouchableOpacity onPress={() => toggleInstructions(exercise.order)}>
          <Text style={styles.instructionText} numberOfLines={expandedInstructions[exercise.order] ? undefined : 2}>
            {exercise.instructions}
          </Text>
          {!expandedInstructions[exercise.order] && exercise.instructions.length > 100 && (
            <Text style={styles.instructionMore}>Show more</Text>
          )}
        </TouchableOpacity>
      ) : null}

      {expandedMenu[exercise.order] && (
        <View style={styles.menuPanel}>
          <TouchableOpacity style={styles.menuItem} onPress={() => { toggleExerciseNotes(exercise.order); }}>
            <Text style={styles.menuItemText}>Notes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => { openSwapPicker(exercise.order); setExpandedMenu(prev => ({ ...prev, [exercise.order]: false })); }}>
            <Text style={styles.menuItemText}>Swap Exercise</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setExpandedMenu(prev => ({ ...prev, [exercise.order]: false })); router.push('/progress'); }}>
            <Text style={styles.menuItemText}>View Progress</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setExpandedMenu(prev => ({ ...prev, [exercise.order]: false })); Alert.alert('Est. 1RM', (() => {
            const lastSets = getLastSets(exercise.exerciseId);
            if (lastSets.length === 0) return 'No data yet';
            const best = Math.max(...lastSets.filter(s => s.weight > 0).map(s => s.reps === 1 ? s.weight : s.weight * (1 + s.reps / 30)));
            return `Estimated 1RM: ${Math.round(best * 10) / 10} kg`;
          })()); }}>
            <Text style={styles.menuItemText}>1RM Calculator</Text>
          </TouchableOpacity>
          {exercise.supersetGroup != null ? (
            <TouchableOpacity style={styles.menuItem} onPress={() => { unlinkSuperset(exercises.indexOf(exercise)); setExpandedMenu(prev => ({ ...prev, [exercise.order]: false })); }}>
              <Text style={styles.menuItemText}>Remove from Superset</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {showExerciseNotes[exercise.order] && (
        <TextInput
          style={styles.exerciseNoteInput}
          value={exerciseNotes[exercise.order] || ''}
          onChangeText={v => updateExerciseNotes(exercise.order, v)}
          placeholder="Exercise notes..."
          placeholderTextColor="#6B7280"
          multiline
        />
      )}

      {exSets.map((set) => (
        <View key={set.globalIdx}>
          <View style={[styles.setRow, set.status !== 'pending' && styles.setRowCompleted]}>
            <Text style={styles.setLabel}>{set.setNumber === 0 ? 'W' : `Set ${set.setNumber}`}</Text>
            {set.exerciseType === 'weight_only' ? (
              <>
                <Text style={styles.setFixedLabel}>{set.reps} laps</Text>
                <Text style={styles.setX}>@</Text>
              </>
            ) : set.exerciseType === 'time' ? (
              <>
                <TextInput
                  style={[styles.setInput, set.status !== 'pending' && styles.inputDisabled]}
                  value={set.reps}
                  onChangeText={v => updateSet(set.globalIdx, 'reps', v)}
                  keyboardType="number-pad"
                  placeholder="sec"
                  placeholderTextColor="#6B7280"
                  editable={set.status === 'pending'}
                />
                <Text style={styles.setX}>s</Text>
              </>
            ) : (
              <>
                <TextInput
                  style={[styles.setInput, set.status !== 'pending' && styles.inputDisabled]}
                  value={set.reps}
                  onChangeText={v => updateSet(set.globalIdx, 'reps', v)}
                  keyboardType="number-pad"
                  placeholder="reps"
                  placeholderTextColor="#6B7280"
                  editable={set.status === 'pending'}
                />
                <Text style={styles.setX}>×</Text>
              </>
            )}
            {set.exerciseType !== 'time' ? (
              <>
                <TextInput
                  style={[styles.setInput, set.status !== 'pending' && styles.inputDisabled, parseFloat(set.weight) < 0 && styles.inputCounterweight]}
                  value={set.weight}
                  onChangeText={v => updateSet(set.globalIdx, 'weight', v)}
                  keyboardType="decimal-pad"
                  placeholder="kg"
                  placeholderTextColor="#6B7280"
                  editable={set.status === 'pending'}
                />
                {set.status === 'pending' && (
                  <TouchableOpacity style={styles.signToggle} onPress={() => toggleWeightSign(set.globalIdx)}>
                    <Text style={[styles.signToggleText, parseFloat(set.weight) < 0 && styles.signToggleActive]}>±</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : null}
            {set.status === 'pending' ? (
              <View style={styles.setActions}>
                <TouchableOpacity style={styles.doneBtn} onPress={() => markSet(set.globalIdx, 'done')} disabled={
                  set.exerciseType === 'weight_only' ? !set.weight
                  : set.exerciseType === 'time' ? !set.reps
                  : (!set.reps || !set.weight)
                }>
                  <Text style={styles.doneBtnText}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.failBtn} onPress={() => markSet(set.globalIdx, 'failed')} disabled={
                  set.exerciseType === 'weight_only' ? !set.weight
                  : set.exerciseType === 'time' ? !set.reps
                  : (!set.reps || !set.weight)
                }>
                  <Text style={styles.failBtnText}>✗</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.statusBadge, set.status === 'done' ? styles.statusDone : styles.statusFailed]}>
                <Text style={styles.statusText}>{set.status === 'done' ? '✓' : '✗'}</Text>
              </View>
            )}
          </View>
        </View>
      ))}

      <View style={styles.exerciseActions}>
        <TouchableOpacity style={styles.exActionBtn} onPress={() => addSetToExercise(exercises.indexOf(exercise))}>
          <Text style={styles.exActionBtnText}>+ Add Set</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exActionBtn} onPress={() => addWarmupSet(exercises.indexOf(exercise))}>
          <Text style={styles.exActionBtnText}>+ Warmup</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {!selectedTemplate ? (
          <>
            <Text style={styles.title}>Select Workout</Text>

            {templates.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No workout templates yet.</Text>
                <Text style={styles.emptySubtext}>Create a template first to start logging workouts.</Text>
              </View>
            ) : (
              templates.map(t => (
                <View key={t.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{t.name}</Text>
                  <Text style={styles.cardSubtitle}>Est. {Math.round(t.estimatedDuration / 60 / 5) * 5} min</Text>
                  <View style={styles.modeRow}>
                    <TouchableOpacity style={styles.modeBtn} onPress={() => handleSelectTemplate(t.id, 'active')}>
                      <Icon name="timer" size={14} color="#fff" />
                      <Text style={styles.modeBtnText}>Start Workout</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modeBtnQuick} onPress={() => handleSelectTemplate(t.id, 'quick')}>
                      <Icon name="notes" size={14} color="#D1D5DB" />
                      <Text style={styles.modeBtnTextQuick}>Quick Log</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Freestyle Workout</Text>
              <Text style={styles.cardSubtitle}>Log without a template</Text>
              <View style={styles.modeRow}>
                <TouchableOpacity style={styles.modeBtn} onPress={() => startFreestyle('active')}>
                  <Icon name="timer" size={14} color="#fff" />
                  <Text style={styles.modeBtnText}>Start Workout</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modeBtnQuick} onPress={() => startFreestyle('quick')}>
                  <Icon name="notes" size={14} color="#D1D5DB" />
                  <Text style={styles.modeBtnTextQuick}>Quick Log</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.manageLink} onPress={() => router.push('/workouts')}>
              <Text style={styles.manageLinkText}>Manage Templates</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.workoutHeader}>
              <Text style={styles.title}>{logMode === 'quick' ? 'Quick Log' : 'Workout'}</Text>
              <Text style={styles.progressText}>{completedCount}/{totalSets} sets</Text>
            </View>

            {logMode === 'active' && (
              <View style={styles.elapsedBanner}>
                <Text style={styles.elapsedLabel}>Elapsed</Text>
                <Text style={styles.elapsedTime}>{formatElapsed(elapsedSeconds)}</Text>
              </View>
            )}

            <View style={styles.toggleRow}>
              <TouchableOpacity style={[styles.toggleButton, hideCompleted && styles.toggleActive]} onPress={() => setHideCompleted(!hideCompleted)}>
                <Text style={[styles.toggleText, hideCompleted && styles.toggleTextActive]}>
                  {hideCompleted ? '✓ Hiding completed' : 'Hide completed'}
                </Text>
              </TouchableOpacity>
            </View>

            {preWorkoutRecs.length > 0 && (
              <View style={styles.preWorkoutRecs}>
                <Text style={styles.preWorkoutRecsTitle}>Pre-Workout Tips</Text>
                {preWorkoutRecs.map((rec, i) => (
                  <View key={i} style={styles.preWorkoutRecCard}>
                    <Text style={styles.preWorkoutRecExercise}>{rec.exerciseName}</Text>
                    <Text style={styles.preWorkoutRecMessage}>{rec.message}</Text>
                  </View>
                ))}
              </View>
            )}

            {(() => {
              // Build superset group membership counts
              const sgCounts: Record<number, number> = {};
              groupedSets.forEach(g => {
                const sg = g.exercise.supersetGroup;
                if (sg != null) sgCounts[sg] = (sgCounts[sg] || 0) + 1;
              });
              const isInSuperset = (sg: number | null) => sg != null && (sgCounts[sg] || 0) >= 2;

              // Build visual groups: consecutive exercises in same superset get wrapped
              const visualGroups: { supersetGroup: number | null; items: { exercise: TemplateExercise; sets: (SetEntry & { globalIdx: number })[] }[] }[] = [];
              const seenGroups = new Set<number>();
              groupedSets.forEach(({ exercise, sets: exSets }) => {
                const sg = exercise.supersetGroup;
                if (sg != null && isInSuperset(sg)) {
                  if (!seenGroups.has(sg)) {
                    seenGroups.add(sg);
                    const members = groupedSets.filter(g => g.exercise.supersetGroup === sg);
                    visualGroups.push({ supersetGroup: sg, items: members });
                  }
                } else {
                  visualGroups.push({ supersetGroup: null, items: [{ exercise, sets: exSets }] });
                }
              });

              return visualGroups.map((vg, vIdx) => {
                if (vg.supersetGroup != null) {
                  // Interleaved superset display: group by round (set number)
                  const members = vg.items;
                  const maxSets = Math.max(...members.map(m => m.sets.length));
                  const maxRest = Math.max(...members.map(m => {
                    const ex = m.exercise;
                    return ex.restTime;
                  }));

                  return (
                    <View key={`sg-${vg.supersetGroup}`} style={styles.supersetWrapper}>
                      <Text style={styles.supersetWrapperTitle}>Superset {vg.supersetGroup}</Text>
                      {/* Menu/notes/swap per exercise */}
                      {members.map(({ exercise }, mIdx) => (
                        <View key={`hdr-${mIdx}`} style={styles.supersetExHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.exerciseTitle}>{exercise.exerciseName}</Text>
                            <Text style={styles.exerciseMeta}>{exercise.bodyPart} • {exercise.equipment}</Text>
                            {(() => {
                              const note = getAppliedNote(exercise.exerciseId);
                              if (!note) return null;
                              const lastLine = note.split('\n').pop();
                              return <Text style={styles.appliedNote}>{lastLine}</Text>;
                            })()}
                          </View>
                          <TouchableOpacity style={styles.menuToggle} onPress={() => toggleMenu(exercise.order)}>
                            <Text style={styles.menuToggleText}>⋯</Text>
                          </TouchableOpacity>
                          {expandedMenu[exercise.order] && (
                            <View style={[styles.menuPanel, { position: 'relative', width: '100%' }]}>
                              <TouchableOpacity style={styles.menuItem} onPress={() => { toggleExerciseNotes(exercise.order); }}>
                                <Text style={styles.menuItemText}>Notes</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.menuItem} onPress={() => { openSwapPicker(exercise.order); setExpandedMenu(prev => ({ ...prev, [exercise.order]: false })); }}>
                                <Text style={styles.menuItemText}>Swap Exercise</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.menuItem} onPress={() => { unlinkSuperset(exercises.indexOf(exercise)); setExpandedMenu(prev => ({ ...prev, [exercise.order]: false })); }}>
                                <Text style={styles.menuItemText}>Remove from Superset</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          {showExerciseNotes[exercise.order] && (
                            <TextInput
                              style={[styles.exerciseNoteInput, { width: '100%' }]}
                              value={exerciseNotes[exercise.order] || ''}
                              onChangeText={v => updateExerciseNotes(exercise.order, v)}
                              placeholder="Exercise notes..."
                              placeholderTextColor="#6B7280"
                              multiline
                            />
                          )}
                        </View>
                      ))}
                      {/* Interleaved rounds */}
                      {Array.from({ length: maxSets }, (_, roundIdx) => {
                        const roundSets = members.map(m => m.sets[roundIdx]).filter(Boolean);
                        if (roundSets.length === 0) return null;
                        const allDone = roundSets.every(s => s.status !== 'pending');
                        return (
                          <View key={`round-${roundIdx}`} style={[styles.supersetRound, allDone && { opacity: 0.6 }]}>
                            <Text style={styles.supersetRoundLabel}>Set {roundIdx + 1}</Text>
                            {roundSets.map((set) => (
                              <View key={set.globalIdx} style={styles.supersetSetRow}>
                                <Text style={styles.supersetSetName} numberOfLines={1}>{set.exerciseName}</Text>
                                {set.exerciseType === 'weight_only' ? (
                                  <>
                                    <Text style={styles.setFixedLabelSmall}>{set.reps}laps</Text>
                                    <Text style={styles.setX}>@</Text>
                                  </>
                                ) : set.exerciseType === 'time' ? (
                                  <>
                                    <TextInput
                                      style={[styles.setInputSmall, set.status !== 'pending' && styles.inputDisabled]}
                                      value={set.reps}
                                      onChangeText={v => updateSet(set.globalIdx, 'reps', v)}
                                      keyboardType="number-pad"
                                      placeholder="sec"
                                      placeholderTextColor="#6B7280"
                                      editable={set.status === 'pending'}
                                    />
                                    <Text style={styles.setX}>s</Text>
                                  </>
                                ) : (
                                  <>
                                    <TextInput
                                      style={[styles.setInputSmall, set.status !== 'pending' && styles.inputDisabled]}
                                      value={set.reps}
                                      onChangeText={v => updateSet(set.globalIdx, 'reps', v)}
                                      keyboardType="number-pad"
                                      placeholder="reps"
                                      placeholderTextColor="#6B7280"
                                      editable={set.status === 'pending'}
                                    />
                                    <Text style={styles.setX}>×</Text>
                                  </>
                                )}
                                {set.exerciseType !== 'time' ? (
                                  <TextInput
                                    style={[styles.setInputSmall, set.status !== 'pending' && styles.inputDisabled, parseFloat(set.weight) < 0 && styles.inputCounterweight]}
                                    value={set.weight}
                                    onChangeText={v => updateSet(set.globalIdx, 'weight', v)}
                                    keyboardType="decimal-pad"
                                    placeholder="kg"
                                    placeholderTextColor="#6B7280"
                                    editable={set.status === 'pending'}
                                  />
                                ) : null}
                                {set.status === 'pending' ? (
                                  <View style={styles.setActions}>
                                    <TouchableOpacity style={styles.doneBtn} onPress={() => markSet(set.globalIdx, 'done')} disabled={
                                      set.exerciseType === 'weight_only' ? !set.weight
                                      : set.exerciseType === 'time' ? !set.reps
                                      : (!set.reps || !set.weight)
                                    }>
                                      <Text style={styles.doneBtnText}>✓</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.failBtn} onPress={() => markSet(set.globalIdx, 'failed')} disabled={
                                      set.exerciseType === 'weight_only' ? !set.weight
                                      : set.exerciseType === 'time' ? !set.reps
                                      : (!set.reps || !set.weight)
                                    }>
                                      <Text style={styles.failBtnText}>✗</Text>
                                    </TouchableOpacity>
                                  </View>
                                ) : (
                                  <View style={[styles.statusBadge, set.status === 'done' ? styles.statusDone : styles.statusFailed]}>
                                    <Text style={styles.statusText}>{set.status === 'done' ? '✓' : '✗'}</Text>
                                  </View>
                                )}
                              </View>
                            ))}
                            {roundIdx < maxSets - 1 && (
                              <Text style={styles.supersetRestLabel}>Rest {maxRest}s</Text>
                            )}
                          </View>
                        );
                      })}
                      <View style={styles.exerciseActions}>
                        {members.map(({ exercise }) => (
                          <TouchableOpacity key={exercise.order} style={styles.exActionBtn} onPress={() => addSetToExercise(exercises.indexOf(exercise))}>
                            <Text style={styles.exActionBtnText}>+ Set ({exercise.exerciseName.split(' ')[0]})</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                }
                const { exercise, sets: exSets } = vg.items[0];
                return (
                  <View key={`ex-${vIdx}`} style={styles.exerciseBlock}>
                    {renderExerciseContent(exercise, exSets)}
                  </View>
                );
              });
            })()}

            {isFreestyle && (
              <TouchableOpacity style={styles.addExerciseBtn} onPress={openFreestyleExercisePicker}>
                <Text style={styles.addExerciseBtnText}>+ Add Exercise</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.finishButton} onPress={handleFinishWorkout}>
              <Text style={styles.finishButtonText}>Finish Workout</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={resetWorkout}>
              <Text style={styles.cancelButtonText}>Cancel Workout</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {showTimer && (
        <SetTimer duration={timerDuration} onComplete={() => setShowTimer(false)} />
      )}

      <Modal visible={showSwapPicker} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Swap Exercise</Text>
            <TouchableOpacity onPress={() => setShowSwapPicker(false)}>
              <Icon name="chevronLeft" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          {swapExerciseIndex !== null && exercises[swapExerciseIndex] && (
            <View style={styles.swapContext}>
              <Text style={styles.swapContextText}>
                Replacing: {exercises[swapExerciseIndex].exerciseName} ({exercises[swapExerciseIndex].bodyPart})
              </Text>
            </View>
          )}
          <ScrollView style={styles.modalScroll}>
            {(allExercises as any[]).map((ex, idx) => {
              const showDivider = idx > 0 && (allExercises as any[])[idx - 1].score > 0 && ex.score === 0;
              return (
                <View key={ex.id}>
                  {showDivider && (
                    <View style={styles.swapDivider}>
                      <Text style={styles.swapDividerText}>Other exercises</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.exerciseOption} onPress={() => handleSwapExercise(ex)}>
                    <View style={styles.swapOptionRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.exerciseOptionName}>{ex.name}</Text>
                        <Text style={styles.exerciseOptionMeta}>{ex.bodyPart} • {ex.equipment}</Text>
                      </View>
                      {ex.score >= 3 && (
                        <View style={styles.matchBadge}>
                          <Text style={styles.matchBadgeText}>Match</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Freestyle Exercise Picker */}
      <Modal visible={showExercisePicker} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Exercise</Text>
            <TouchableOpacity onPress={() => setShowExercisePicker(false)}>
              <Icon name="chevronLeft" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll}>
            {allExercisesForPicker.map(ex => (
              <TouchableOpacity key={ex.id} style={styles.exerciseOption} onPress={() => addFreestyleExercise(ex)}>
                <Text style={styles.exerciseOptionName}>{ex.name}</Text>
                <Text style={styles.exerciseOptionMeta}>{ex.bodyPart} • {ex.equipment}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  scrollView: { flex: 1, padding: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  emptyState: { backgroundColor: '#1F2937', padding: 32, borderRadius: 12, alignItems: 'center' },
  emptyText: { fontSize: 18, color: '#fff', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  card: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  cardSubtitle: { fontSize: 14, color: '#9CA3AF', marginTop: 4 },
  workoutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  progressText: { fontSize: 16, color: '#3B82F6', fontWeight: '600' },
  toggleRow: { marginBottom: 16 },
  toggleButton: { backgroundColor: '#374151', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, alignSelf: 'flex-start' },
  toggleActive: { backgroundColor: '#3B82F6' },
  toggleText: { color: '#9CA3AF', fontSize: 14 },
  toggleTextActive: { color: '#fff' },
  exerciseBlock: { backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 16 },
  supersetWrapper: { borderWidth: 1, borderColor: '#F59E0B', borderRadius: 12, padding: 12, marginBottom: 16, backgroundColor: '#1F293780' },
  supersetWrapperTitle: { color: '#F59E0B', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  supersetInnerBlock: { backgroundColor: '#1F2937', borderRadius: 10, padding: 14, marginBottom: 8 },
  supersetExHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#374151' },
  supersetRound: { backgroundColor: '#1F2937', borderRadius: 10, padding: 10, marginBottom: 8 },
  supersetRoundLabel: { color: '#F59E0B', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  supersetSetRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', padding: 8, borderRadius: 8, marginBottom: 6 },
  supersetSetName: { color: '#D1D5DB', fontSize: 12, width: 70, marginRight: 4 },
  supersetRestLabel: { color: '#6B7280', fontSize: 12, textAlign: 'center', marginTop: 2, marginBottom: 4 },
  setInputSmall: { backgroundColor: '#374151', color: '#fff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, fontSize: 15, width: 52, textAlign: 'center', fontWeight: '600' },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  exerciseTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  exerciseMeta: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  appliedNote: { fontSize: 11, color: '#F59E0B', marginTop: 3, fontStyle: 'italic' },
  menuToggle: { backgroundColor: '#374151', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  menuToggleText: { color: '#D1D5DB', fontSize: 20, fontWeight: '600' },
  menuPanel: { backgroundColor: '#374151', borderRadius: 8, padding: 4, marginBottom: 10 },
  menuItem: { paddingVertical: 10, paddingHorizontal: 12 },
  menuItemText: { color: '#D1D5DB', fontSize: 14 },
  instructionText: { color: '#9CA3AF', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  instructionMore: { color: '#3B82F6', fontSize: 13, marginBottom: 8 },
  exerciseActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  exActionBtn: { flex: 1, backgroundColor: '#374151', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  exActionBtnText: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
  exerciseNoteInput: { backgroundColor: '#374151', color: '#D1D5DB', padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 10 },
  setRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', padding: 10, borderRadius: 8, marginBottom: 8 },
  setRowCompleted: { opacity: 0.6 },
  setLabel: { color: '#9CA3AF', fontSize: 14, width: 50 },
  setInput: { backgroundColor: '#374151', color: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, fontSize: 16, width: 60, textAlign: 'center', fontWeight: '600' },
  setFixedLabel: { color: '#D1D5DB', fontSize: 15, fontWeight: '600', width: 60, textAlign: 'center' },
  setFixedLabelSmall: { color: '#D1D5DB', fontSize: 13, fontWeight: '600', width: 46, textAlign: 'center' },
  inputDisabled: { backgroundColor: '#1F2937' },
  setX: { color: '#6B7280', marginHorizontal: 8, fontSize: 16 },
  signToggle: { paddingHorizontal: 4, paddingVertical: 4, marginLeft: 2 },
  signToggleText: { fontSize: 16, color: '#6B7280', fontWeight: '600' },
  signToggleActive: { color: '#F59E0B' },
  inputCounterweight: { borderWidth: 1, borderColor: '#F59E0B' },
  setActions: { flexDirection: 'row', marginLeft: 'auto', gap: 8 },
  doneBtn: { backgroundColor: '#3B82F6', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  doneBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  failBtn: { backgroundColor: '#EF4444', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  failBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  statusBadge: { marginLeft: 'auto', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  statusDone: { backgroundColor: '#3B82F633' },
  statusFailed: { backgroundColor: '#EF444433' },
  statusText: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  finishButton: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 12, marginTop: 8 },
  finishButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  cancelButton: { marginTop: 16, padding: 12, marginBottom: 32 },
  cancelButtonText: { color: '#EF4444', fontSize: 14, textAlign: 'center' },
  modeRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modeBtn: { flex: 1, backgroundColor: '#3B82F6', paddingVertical: 10, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  modeBtnQuick: { flex: 1, backgroundColor: '#374151', paddingVertical: 10, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  modeBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  modeBtnTextQuick: { color: '#D1D5DB', fontSize: 14, fontWeight: '600' },
  elapsedBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E3A8A', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, marginBottom: 12 },
  elapsedLabel: { color: '#3B82F6', fontSize: 14, fontWeight: '600' },
  elapsedTime: { color: '#fff', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  addExerciseBtn: { backgroundColor: '#3B82F6', padding: 14, borderRadius: 10, marginBottom: 8, alignItems: 'center' },
  addExerciseBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  preWorkoutRecs: { backgroundColor: '#1E3A8A', borderRadius: 10, padding: 12, marginBottom: 16 },
  preWorkoutRecsTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 8 },
  preWorkoutRecCard: { backgroundColor: '#1E40AF', borderRadius: 6, padding: 8, marginBottom: 4 },
  preWorkoutRecExercise: { color: '#fff', fontWeight: '600', fontSize: 13 },
  preWorkoutRecMessage: { color: '#D1D5DB', fontSize: 12, marginTop: 2 },
  modalContainer: { flex: 1, backgroundColor: '#111827' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#374151' },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  closeButton: { fontSize: 40, color: '#fff', fontWeight: 'bold' },
  modalScroll: { flex: 1, padding: 16 },
  exerciseOption: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  exerciseOptionName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  exerciseOptionMeta: { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  swapContext: { backgroundColor: '#1E3A8A', padding: 12, marginHorizontal: 16, marginTop: 8, borderRadius: 8 },
  swapContextText: { color: '#D1D5DB', fontSize: 13 },
  swapOptionRow: { flexDirection: 'row', alignItems: 'center' },
  matchBadge: { backgroundColor: '#3B82F6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  matchBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  swapDivider: { paddingVertical: 8, marginBottom: 4 },
  swapDividerText: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  manageLink: { backgroundColor: '#374151', padding: 14, borderRadius: 10, marginBottom: 12, alignItems: 'center' },
  manageLinkText: { color: '#D1D5DB', fontSize: 15, fontWeight: '600' },
});
