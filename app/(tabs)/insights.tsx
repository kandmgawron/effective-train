import { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { format } from 'date-fns';
import db from '@/lib/database';
import { PersonalRecord, ProgressionRecommendation } from '@/types';
import Icon from '@/components/Icon';
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
  const [recentPRs, setRecentPRs] = useState<(PersonalRecord & { exerciseName: string })[]>([]);
  const [lastWorkout, setLastWorkout] = useState<LastWorkoutSummary | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sectionPositions = useRef<Record<string, number>>({});
  const [scrollY, setScrollY] = useState(0);
  const router = useRouter();

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(e.nativeEvent.contentOffset.y);
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const loadData = () => {
    const recs = db.getAllSync<any>(
      `SELECT pr.id, pr.exercise_id as exerciseId, e.name as exerciseName, pr.type, pr.message,
              pr.suggested_weight as suggestedWeight, pr.suggested_reps as suggestedReps,
              pr.status, pr.created_at as createdAt
       FROM progression_recommendations pr
       JOIN exercises e ON pr.exercise_id = e.id
       WHERE pr.status = 'active'
       ORDER BY pr.created_at DESC`
    );
    setRecommendations(recs);

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

      const prs = db.getAllSync<any>(
        `SELECT pr.id, pr.exercise_id as exerciseId, e.name as exerciseName,
                pr.record_type as recordType, pr.value, pr.date
         FROM personal_records pr
         JOIN exercises e ON pr.exercise_id = e.id
         WHERE pr.workout_log_id = ?
         ORDER BY pr.date DESC`,
        [latest.id]
      );
      setRecentPRs(prs);
    } else {
      setLastWorkout(null);
      setRecentPRs([]);
    }
  };

  const applyRecommendation = (id: number) => {
    const rec = recommendations.find(r => r.id === id);
    if (!rec) return;
    const today = format(new Date(), 'yyyy-MM-dd');

    const templateExs = db.getAllSync<{ id: number }>(
      'SELECT id FROM template_exercises WHERE exercise_id = ?',
      [rec.exerciseId]
    );

    if (rec.type === 'PROGRESS_WEIGHT' || rec.type === 'DELOAD') {
      if (rec.suggestedReps != null) {
        for (const te of templateExs) {
          db.runSync('UPDATE template_exercises SET target_reps = ? WHERE id = ?', [rec.suggestedReps, te.id]);
        }
        // Store next_reps_ so the log screen picks up the rep drop
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
        for (const te of templateExs) {
          db.runSync('UPDATE template_exercises SET target_reps = ? WHERE id = ?', [rec.suggestedReps, te.id]);
        }
        // Store next_reps_ so the log screen picks up the new rep target
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

    db.runSync("UPDATE progression_recommendations SET status = 'applied', dismissed_at = datetime('now') WHERE id = ?", [id]);
    setRecommendations(prev => prev.filter(r => r.id !== id));

    Alert.alert('Applied', rec.type === 'CHANGE_EXERCISE'
      ? 'Noted. Swap the exercise manually in your next workout.'
      : `Updated templates for ${rec.exerciseName}.`
    );
  };

  const dismissRecommendation = (id: number) => {
    db.runSync("UPDATE progression_recommendations SET status = 'dismissed', dismissed_at = datetime('now') WHERE id = ?", [id]);
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
              <View style={styles.jumpBar}>
                {recentPRs.length > 0 && (
                  <TouchableOpacity style={styles.jumpBtn} onPress={() => scrollToSection('prs')}>
                    <Text style={styles.jumpBtnText}>PRs</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.jumpBtn} onPress={() => scrollToSection('recs')}>
                  <Text style={styles.jumpBtnText}>Recs</Text>
                </TouchableOpacity>
              </View>
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

        {recentPRs.length > 0 && (
          <View style={styles.section} onLayout={onSectionLayout('prs')}>
            <View style={styles.sectionHeader}>
              <Icon name="trophy" size={20} color="#F59E0B" />
              <Text style={styles.prSectionTitle}>Personal Records</Text>
            </View>
            {Object.values(recentPRs.reduce<Record<number, { exerciseId: number; exerciseName: string; records: typeof recentPRs }>>((acc, pr) => {
              if (!acc[pr.exerciseId]) acc[pr.exerciseId] = { exerciseId: pr.exerciseId, exerciseName: pr.exerciseName, records: [] };
              acc[pr.exerciseId].records.push(pr);
              return acc;
            }, {})).map(group => (
              <TouchableOpacity key={group.exerciseId} style={styles.prCard} onPress={() => router.push(`/progress?exerciseId=${group.exerciseId}`)}>
                <Text style={styles.prExercise}>{group.exerciseName}</Text>
                {group.records.map(pr => (
                  <Text key={pr.id} style={styles.prDetail}>
                    {pr.recordType === 'max_weight' ? `${pr.value} kg — Heaviest Set` : pr.recordType === 'max_volume' ? `${pr.value} kg — Best Volume Set` : `${pr.value} kg — Est. 1RM`}
                  </Text>
                ))}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.section} onLayout={onSectionLayout('recs')}>
          <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Recommendations</Text>
          {recommendations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No active recommendations.</Text>
              <Text style={styles.emptySubtext}>Complete a workout to generate new ones.</Text>
            </View>
          ) : (
            <>
              {recommendations.length > 1 && (
                <TouchableOpacity style={styles.applyAllBtn} onPress={applyAll}>
                  <Text style={styles.applyAllText}>Apply All</Text>
                </TouchableOpacity>
              )}
              {recommendations.map(rec => (
              <View key={rec.id} style={[styles.recCard,
                rec.type === 'PROGRESS_WEIGHT' && styles.recCardSuccess,
                rec.type === 'DELOAD' && styles.recCardWarning,
                rec.type === 'CHANGE_EXERCISE' && styles.recCardDanger,
              ]}>
                <View style={styles.recIconWrap}>
                  <Icon name={rec.type === 'PROGRESS_WEIGHT' ? 'arrowUp' : rec.type === 'PROGRESS_REPS' ? 'refresh' : rec.type === 'DELOAD' ? 'arrowDown' : 'shuffle'} size={18} color="#fff" />
                </View>
                <View style={styles.recContent}>
                  <Text style={styles.recExercise}>{rec.exerciseName}</Text>
                  <Text style={styles.recMessage}>{rec.message}</Text>
                </View>
                <View style={styles.recActions}>
                  <TouchableOpacity style={styles.recApplyBtn} onPress={() => applyRecommendation(rec.id)}>
                    <Text style={styles.recApplyText}>Apply</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => dismissRecommendation(rec.id)}>
                    <Text style={styles.recDismiss}>✕</Text>
                  </TouchableOpacity>
                </View>
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
  sectionTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  prSectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#F59E0B' },
  workoutDate: { color: '#9CA3AF', fontSize: 13, marginBottom: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { backgroundColor: '#1F2937', borderRadius: 10, padding: 14, width: '47%', alignItems: 'center' },
  summaryValue: { fontSize: 24, fontWeight: 'bold', color: '#3B82F6' },
  summaryLabel: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  prCard: { backgroundColor: '#1F2937', borderRadius: 10, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  prExercise: { fontSize: 15, fontWeight: '600', color: '#fff' },
  prDetail: { fontSize: 13, color: '#D1D5DB', marginTop: 4 },
  emptyState: { backgroundColor: '#1F2937', padding: 24, borderRadius: 12, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#fff', marginBottom: 4 },
  emptySubtext: { fontSize: 13, color: '#9CA3AF' },
  recCard: { flexDirection: 'row', backgroundColor: '#1E3A8A', borderRadius: 10, padding: 12, marginBottom: 8, alignItems: 'center' },
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
  jumpBar: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  jumpBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  jumpBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  applyAllBtn: { backgroundColor: '#3B82F6', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 12 },
  applyAllText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
