import { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { format } from 'date-fns';
import db from '@/lib/database';
import { ProgressionRecommendation } from '@/types';
import Icon from '@/components/Icon';
import { evaluateProgression } from '@/lib/progression-engine';
import { ExerciseProgressionConfig } from '@/types';
import BackToTop from '@/components/BackToTop';

interface LastWorkoutSummary {
  id: number;
  date: string;
  duration: number;
  totalSets: number;
  totalVolume: number;
  exercisesDone: number;
}

export default function Insights() {
  const [recommendations, setRecommendations] = useState<(ProgressionRecommendation & { exerciseName: string })[]>([]);
  const [lastWorkout, setLastWorkout] = useState<LastWorkoutSummary | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sectionPositions = useRef<Record<string, number>>({});
  const [scrollY, setScrollY] = useState(0);
  const [recFilter, setRecFilter] = useState<string | null>(null);
  const [expandedRec, setExpandedRec] = useState<number | null>(null);
  const [recScope, setRecScope] = useState<'last' | 'all'>('all');
  const router = useRouter();

  // Priority: PROGRESS_WEIGHT=1, DELOAD=2, CHANGE_EXERCISE=3, PROGRESS_REPS=4
  const recPriority = (type: string) => {
    if (type === 'PROGRESS_WEIGHT') return 1;
    if (type === 'DELOAD') return 2;
    if (type === 'CHANGE_EXERCISE') return 3;
    return 4;
  };

  const getRecentSessions = (exerciseId: number) => {
    return db.getAllSync<{ date: string; reps: number; weight: number; setNumber: number }>(
      `SELECT wl.date, sl.reps, sl.weight, sl.set_number as setNumber
       FROM set_logs sl
       JOIN workout_logs wl ON sl.workout_log_id = wl.id
       WHERE sl.exercise_id = ?
       ORDER BY wl.date DESC, wl.id DESC, sl.set_number
       LIMIT 30`,
      [exerciseId]
    );
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(e.nativeEvent.contentOffset.y);
  };

  useFocusEffect(useCallback(() => { loadData(); }, [recScope]));

  const loadData = () => {
    // Get exercises from current templates only
    const templateExerciseIds = db.getAllSync<{ exerciseId: number }>(
      'SELECT DISTINCT exercise_id as exerciseId FROM template_exercises'
    );
    if (templateExerciseIds.length === 0) {
      setRecommendations([]);
    } else {
      // Filter by active gym profile equipment
      const activeProfile = db.getFirstSync<{ equipment: string }>(
        'SELECT equipment FROM gym_profiles WHERE is_active = 1 LIMIT 1'
      );
      const gymEquip: string[] = activeProfile ? JSON.parse(activeProfile.equipment) : [];
      const gymEquipLower = new Set(gymEquip.map(e => e.toLowerCase()));
      const hasAdjustableBench = gymEquipLower.has('adjustable bench');
      const benchVariants = new Set(['flat bench', 'incline bench', 'decline bench', 'adjustable bench']);
      const skipEquipTypes = new Set(['bodyweight', 'dumbbells', 'barbell', 'kettlebells', 'resistance bands', 'exercise ball', 'foam roller', 'medicine ball', 'bosu ball']);

      // Filter exercises: must be in a template, have workout data, and equipment available at active gym
      const allExerciseIds = templateExerciseIds.filter(({ exerciseId }) => {
        // Must have workout data
        const hasData = db.getFirstSync<{ c: number }>(
          'SELECT COUNT(*) as c FROM set_logs WHERE exercise_id = ?', [exerciseId]
        );
        if (!hasData || hasData.c === 0) return false;

        // If gym has no equipment listed, don't filter by equipment
        if (gymEquip.length === 0) return true;

        // Check if exercise equipment is available
        const exEquip = db.getFirstSync<{ se: string }>(
          'SELECT specific_equipment as se FROM exercises WHERE id = ?', [exerciseId]
        );
        if (!exEquip || !exEquip.se) return true;
        const seLower = exEquip.se.toLowerCase();
        if (skipEquipTypes.has(seLower)) return true;
        if (hasAdjustableBench && benchVariants.has(seLower)) return true;
        return gymEquipLower.has(seLower);
      });

    const liveRecs: (ProgressionRecommendation & { exerciseName: string })[] = [];
    for (const { exerciseId } of allExerciseIds) {
      // Check if user already applied/dismissed a rec for this exercise recently
      const dismissed = db.getFirstSync<{ id: number }>(
        `SELECT id FROM progression_recommendations
         WHERE exercise_id = ? AND status IN ('applied', 'dismissed')
         AND dismissed_at > datetime('now', '-1 day')`,
        [exerciseId]
      );
      if (dismissed) continue;

      // Get or build config
      const exInfo = db.getFirstSync<{ name: string; movementType: string }>(
        "SELECT name, COALESCE(movement_type, 'compound') as movementType FROM exercises WHERE id = ?",
        [exerciseId]
      );
      if (!exInfo) continue;

      let config = db.getFirstSync<any>(
        `SELECT id, exercise_id as exerciseId, progression_rule as progressionRule,
                progression_type as progressionType,
                rep_range_min as repRangeMin, rep_range_max as repRangeMax,
                weight_increment as weightIncrement, sensitivity
         FROM exercise_progression_config WHERE exercise_id = ?`,
        [exerciseId]
      );

      if (!config) {
        // No config exists — create one with category-based defaults
        const eq = (db.getFirstSync<{ equipment: string }>(
          "SELECT COALESCE(equipment, '') as equipment FROM exercises WHERE id = ?", [exerciseId]
        )?.equipment ?? '').toLowerCase();
        const isIsolation = exInfo.movementType === 'isolation';
        const isMachine = eq.includes('machine') || eq.includes('cable') || eq.includes('leverage') || eq.includes('smith');
        const repMin = isIsolation ? 12 : isMachine ? 8 : 6;
        const repMax = isIsolation ? 15 : isMachine ? 12 : 8;
        const defaultIncrement = exInfo.movementType === 'isolation' ? 1.25 : 2.5;
        db.runSync(
          'INSERT INTO exercise_progression_config (exercise_id, weight_increment, rep_range_min, rep_range_max) VALUES (?, ?, ?, ?)',
          [exerciseId, defaultIncrement, repMin, repMax]
        );
        config = db.getFirstSync<any>(
          `SELECT id, exercise_id as exerciseId, progression_rule as progressionRule,
                  progression_type as progressionType,
                  rep_range_min as repRangeMin, rep_range_max as repRangeMax,
                  weight_increment as weightIncrement, sensitivity
           FROM exercise_progression_config WHERE exercise_id = ?`,
          [exerciseId]
        );
      }
      if (!config) continue;

      const result = evaluateProgression(exerciseId, config as ExerciseProgressionConfig);
      if (!result) continue;

      liveRecs.push({
        id: exerciseId, // use exerciseId as key since these aren't DB rows
        exerciseId,
        exerciseName: exInfo.name,
        type: result.type,
        message: result.message,
        suggestedWeight: result.suggestedWeight ?? null,
        suggestedReps: result.suggestedReps ?? null,
        suggestedExerciseId: null,
        status: 'active',
        createdAt: '',
      });
    }
    liveRecs.sort((a, b) => recPriority(a.type) - recPriority(b.type));

    // Apply scope filter
    if (recScope === 'last') {
      const lastWorkout = db.getFirstSync<{ id: number }>('SELECT id FROM workout_logs ORDER BY date DESC, id DESC LIMIT 1');
      if (lastWorkout) {
        const lastExIds = new Set(
          db.getAllSync<{ exerciseId: number }>('SELECT DISTINCT exercise_id as exerciseId FROM set_logs WHERE workout_log_id = ?', [lastWorkout.id])
            .map(e => e.exerciseId)
        );
        setRecommendations(liveRecs.filter(r => lastExIds.has(r.exerciseId)));
      } else {
        setRecommendations(liveRecs);
      }
    } else {
      setRecommendations(liveRecs);
    }
    }

    const latest = db.getFirstSync<{ id: number; date: string; duration: number }>(
      'SELECT id, date, duration FROM workout_logs ORDER BY date DESC, id DESC LIMIT 1'
    );
    if (latest) {
      const setData = db.getAllSync<{ reps: number; weight: number; exerciseId: number }>(
        'SELECT reps, weight, exercise_id as exerciseId FROM set_logs WHERE workout_log_id = ?',
        [latest.id]
      );
      const totalVolume = setData.reduce((sum, s) => sum + Math.abs(s.weight) * s.reps, 0);
      const uniqueExercises = new Set(setData.map(s => s.exerciseId)).size;
      setLastWorkout({
        id: latest.id,
        date: latest.date,
        duration: latest.duration,
        totalSets: setData.length,
        totalVolume: Math.round(totalVolume),
        exercisesDone: uniqueExercises,
      });
    } else {
      setLastWorkout(null);
    }
  };

  const applyRecommendation = (id: number) => {
    const rec = recommendations.find(r => r.id === id);
    if (!rec) return;
    const today = format(new Date(), 'yyyy-MM-dd');

    if (rec.type === 'PROGRESS_WEIGHT' || rec.type === 'DELOAD') {
      if (rec.suggestedReps != null) {
        db.runSync(
          "INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)",
          [`next_reps_${rec.exerciseId}`, String(rec.suggestedReps)]
        );
      }
      if (rec.suggestedWeight != null) {
        db.runSync(
          "INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)",
          [`next_weight_${rec.exerciseId}`, String(rec.suggestedWeight)]
        );
      }
    } else if (rec.type === 'PROGRESS_REPS') {
      if (rec.suggestedReps != null) {
        db.runSync(
          "INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)",
          [`next_reps_${rec.exerciseId}`, String(rec.suggestedReps)]
        );
      }
    }

    const noteText = `[${today}] Applied: ${rec.message}`;
    const existingNote = db.getFirstSync<{ value: string }>(
      "SELECT value FROM user_settings WHERE key = ?",
      [`exercise_note_${rec.exerciseId}`]
    );
    const newNote = existingNote ? `${existingNote.value}\n${noteText}` : noteText;
    db.runSync(
      "INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)",
      [`exercise_note_${rec.exerciseId}`, newNote]
    );

    db.runSync(
      `INSERT INTO progression_recommendations (exercise_id, type, message, suggested_weight, suggested_reps, status, dismissed_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'applied', datetime('now'), datetime('now'))`,
      [rec.exerciseId, rec.type, rec.message, rec.suggestedWeight, rec.suggestedReps]
    );
    setRecommendations(prev => prev.filter(r => r.id !== id));

    Alert.alert('Applied', rec.type === 'CHANGE_EXERCISE'
      ? 'Noted. Swap the exercise manually in your next workout.'
      : `Updated templates for ${rec.exerciseName}.`
    );
  };

  const dismissRecommendation = (id: number) => {
    const rec = recommendations.find(r => r.id === id);
    if (rec) {
      db.runSync(
        `INSERT INTO progression_recommendations (exercise_id, type, message, suggested_weight, suggested_reps, status, dismissed_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'dismissed', datetime('now'), datetime('now'))`,
        [rec.exerciseId, rec.type, rec.message, rec.suggestedWeight, rec.suggestedReps]
      );
    }
    setRecommendations(prev => prev.filter(r => r.id !== id));
  };

  const applyAll = () => {
    const toApply = recommendations.filter(r => r.type !== 'CHANGE_EXERCISE');
    for (const rec of toApply) {
      applyRecommendation(rec.id);
    }
    const skipped = recommendations.length - toApply.length;
    Alert.alert('Done', skipped > 0
      ? `Applied ${toApply.length} recommendations. ${skipped} exercise swap(s) skipped — apply manually.`
      : `Applied ${toApply.length} recommendations.`
    );
  };

  const scrollToSection = (key: string) => {
    const y = sectionPositions.current[key];
    if (y != null && scrollRef.current) {
      scrollRef.current.scrollTo({ y, animated: true });
    }
  };

  const onSectionLayout = (key: string) => (e: LayoutChangeEvent) => {
    sectionPositions.current[key] = e.nativeEvent.layout.y;
  };

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} style={styles.scrollView} onScroll={onScroll} scrollEventThrottle={100}>
        {lastWorkout && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Last Workout</Text>
            </View>
            <Text style={styles.workoutDate}>{lastWorkout.date}</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{lastWorkout.duration}</Text>
                <Text style={styles.summaryLabel}>Minutes</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{lastWorkout.totalSets}</Text>
                <Text style={styles.summaryLabel}>Sets</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{lastWorkout.exercisesDone}</Text>
                <Text style={styles.summaryLabel}>Exercises</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{(lastWorkout.totalVolume / 1000).toFixed(1)}</Text>
                <Text style={styles.summaryLabel}>Volume (t)</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section} onLayout={onSectionLayout('recs')}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity style={[styles.scopeBtn, recScope === 'last' && styles.scopeBtnActive]} onPress={() => setRecScope('last')}>
                <Text style={[styles.scopeBtnText, recScope === 'last' && styles.scopeBtnTextActive]}>Last</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.scopeBtn, recScope === 'all' && styles.scopeBtnActive]} onPress={() => setRecScope('all')}>
                <Text style={[styles.scopeBtnText, recScope === 'all' && styles.scopeBtnTextActive]}>All</Text>
              </TouchableOpacity>
            </View>
          </View>
          {recommendations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No active recommendations.</Text>
              <Text style={styles.emptySubtext}>Complete a workout to generate new ones.</Text>
            </View>
          ) : (
            <>
              {(() => {
                const types = [...new Set(recommendations.map(r => r.type))];
                return types.length > 1 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={styles.filterRow}>
                      <TouchableOpacity style={[styles.filterChip, !recFilter && styles.filterChipActive]} onPress={() => setRecFilter(null)}>
                        <Text style={[styles.filterChipText, !recFilter && styles.filterChipTextActive]}>All ({recommendations.length})</Text>
                      </TouchableOpacity>
                      {types.map(t => {
                        const count = recommendations.filter(r => r.type === t).length;
                        const label = t === 'PROGRESS_WEIGHT' ? 'Weight' : t === 'PROGRESS_REPS' ? 'Reps' : t === 'DELOAD' ? 'Deload' : 'Swap';
                        return (
                          <TouchableOpacity key={t} style={[styles.filterChip, recFilter === t && styles.filterChipActive]} onPress={() => setRecFilter(recFilter === t ? null : t)}>
                            <Text style={[styles.filterChipText, recFilter === t && styles.filterChipTextActive]}>{label} ({count})</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                ) : null;
              })()}
              {recommendations.filter(r => !recFilter || r.type === recFilter).length > 1 && (
                <TouchableOpacity style={styles.applyAllBtn} onPress={applyAll}>
                  <Text style={styles.applyAllText}>Apply All</Text>
                </TouchableOpacity>
              )}
              {recommendations.filter(r => !recFilter || r.type === recFilter).map(rec => (
              <View key={rec.id}>
                <TouchableOpacity
                  style={[styles.recCard,
                    rec.type === 'PROGRESS_WEIGHT' && styles.recCardSuccess,
                    rec.type === 'DELOAD' && styles.recCardWarning,
                    rec.type === 'CHANGE_EXERCISE' && styles.recCardDanger,
                  ]}
                  onPress={() => setExpandedRec(expandedRec === rec.id ? null : rec.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.recIconWrap}>
                    <Icon name={rec.type === 'PROGRESS_WEIGHT' ? 'arrowUp' : rec.type === 'PROGRESS_REPS' ? 'refresh' : rec.type === 'DELOAD' ? 'arrowDown' : 'shuffle'} size={18} color="#fff" />
                  </View>
                  <View style={styles.recContent}>
                    <Text style={styles.recExercise}>{rec.exerciseName}</Text>
                    <Text style={styles.recMessage}>{rec.message}</Text>
                  </View>
                  <View style={styles.recActions}>
                    <TouchableOpacity style={styles.recApplyBtn} onPress={(e) => { e.stopPropagation(); applyRecommendation(rec.id); }}>
                      <Text style={styles.recApplyText}>Apply</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); dismissRecommendation(rec.id); }}>
                      <Text style={styles.recDismiss}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
                {expandedRec === rec.id && (() => {
                  const sessions = getRecentSessions(rec.exerciseId);
                  // Group by date (last 3 workouts)
                  const grouped: { date: string; sets: { reps: number; weight: number }[] }[] = [];
                  for (const s of sessions) {
                    const last = grouped[grouped.length - 1];
                    if (last && last.date === s.date) {
                      last.sets.push({ reps: s.reps, weight: s.weight });
                    } else if (grouped.length < 3) {
                      grouped.push({ date: s.date, sets: [{ reps: s.reps, weight: s.weight }] });
                    }
                  }
                  const maxWeight = sessions.length > 0 ? Math.max(...sessions.map(s => Math.abs(s.weight))) : 0;
                  const avgReps = sessions.length > 0 ? Math.round(sessions.reduce((sum, s) => sum + s.reps, 0) / sessions.length) : 0;
                  return (
                    <View style={styles.recDetail}>
                      <View style={styles.recDetailStats}>
                        <View style={styles.recDetailStat}>
                          <Text style={styles.recDetailStatValue}>{maxWeight}kg</Text>
                          <Text style={styles.recDetailStatLabel}>Max</Text>
                        </View>
                        <View style={styles.recDetailStat}>
                          <Text style={styles.recDetailStatValue}>{avgReps}</Text>
                          <Text style={styles.recDetailStatLabel}>Avg Reps</Text>
                        </View>
                        <View style={styles.recDetailStat}>
                          <Text style={styles.recDetailStatValue}>{grouped.length}</Text>
                          <Text style={styles.recDetailStatLabel}>Sessions</Text>
                        </View>
                      </View>
                      {grouped.map((g, gi) => (
                        <View key={gi} style={styles.recSessionRow}>
                          <Text style={styles.recSessionDate}>{g.date}</Text>
                          <Text style={styles.recSessionSets}>
                            {g.sets.map((s, si) => `${s.reps}×${Math.abs(s.weight)}kg`).join('  ')}
                          </Text>
                        </View>
                      ))}
                      <TouchableOpacity style={styles.recViewProgress} onPress={() => router.push(`/progress?exerciseId=${rec.exerciseId}`)}>
                        <Text style={styles.recViewProgressText}>View Full Progress</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()}
              </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>
      <BackToTop scrollY={scrollY} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  scrollView: { flex: 1, padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  prSectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#F59E0B' },
  workoutDate: { color: '#9CA3AF', fontSize: 13, marginBottom: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { backgroundColor: '#1F2937', borderRadius: 12, padding: 14, width: '47%', alignItems: 'center' },
  summaryValue: { fontSize: 24, fontWeight: 'bold', color: '#3B82F6' },
  summaryLabel: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  prCard: { backgroundColor: '#1F2937', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  prExercise: { fontSize: 15, fontWeight: '600', color: '#fff' },
  prDetail: { fontSize: 13, color: '#D1D5DB', marginTop: 4 },
  emptyState: { backgroundColor: '#1F2937', padding: 24, borderRadius: 12, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#fff', marginBottom: 4 },
  emptySubtext: { fontSize: 13, color: '#9CA3AF' },
  recCard: { flexDirection: 'row', backgroundColor: '#1E3A8A', borderRadius: 12, padding: 12, marginBottom: 8, alignItems: 'center' },
  recCardSuccess: { backgroundColor: '#1E3A8A' },
  recCardWarning: { backgroundColor: '#78350F' },
  recCardDanger: { backgroundColor: '#7F1D1D' },
  recIconWrap: { marginRight: 10, justifyContent: 'center' },
  recContent: { flex: 1 },
  recExercise: { color: '#fff', fontWeight: '600', fontSize: 14 },
  recMessage: { color: '#D1D5DB', fontSize: 12, marginTop: 2 },
  recActions: { flexDirection: 'row', gap: 8, marginLeft: 8, alignItems: 'center' },
  recApplyBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  recApplyText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  recDismiss: { fontSize: 14, color: '#6B7280' },
  recDetail: { backgroundColor: '#1F2937', borderRadius: 0, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, padding: 12, marginTop: -8, marginBottom: 8 },
  recDetailStats: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  recDetailStat: { flex: 1, alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, padding: 8 },
  recDetailStatValue: { color: '#fff', fontSize: 16, fontWeight: '700' },
  recDetailStatLabel: { color: '#9CA3AF', fontSize: 11, marginTop: 2 },
  recSessionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  recSessionDate: { color: '#9CA3AF', fontSize: 12 },
  recSessionSets: { color: '#D1D5DB', fontSize: 12 },
  recViewProgress: { marginTop: 8, alignSelf: 'flex-start' },
  recViewProgressText: { color: '#3B82F6', fontSize: 13, fontWeight: '600' },
  jumpBar: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  jumpBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  jumpBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  applyAllBtn: { backgroundColor: '#3B82F6', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 12 },
  applyAllText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { backgroundColor: '#1F2937', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  filterChipActive: { backgroundColor: '#3B82F6' },
  filterChipText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  scopeBtn: { backgroundColor: '#374151', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  scopeBtnActive: { backgroundColor: '#3B82F6' },
  scopeBtnText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  scopeBtnTextActive: { color: '#fff' },
});
