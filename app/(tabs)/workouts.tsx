import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import db from '@/lib/database';
import { WorkoutTemplate, ProgressionRecommendation } from '@/types';
import Icon from '@/components/Icon';

export default function WorkoutTemplates() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [recommendations, setRecommendations] = useState<(ProgressionRecommendation & { exerciseName: string })[]>([]);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      loadTemplates();
      loadRecommendations();
    }, [])
  );

  const loadTemplates = () => {
    const result = db.getAllSync<WorkoutTemplate>(
      'SELECT id, name, estimated_duration as estimatedDuration FROM workout_templates'
    );
    setTemplates(result);
  };

  const loadRecommendations = () => {
    const recs = db.getAllSync<any>(
      `SELECT pr.id, pr.exercise_id as exerciseId, e.name as exerciseName, pr.type, pr.message,
              pr.suggested_weight as suggestedWeight, pr.suggested_reps as suggestedReps,
              pr.status, pr.created_at as createdAt
       FROM progression_recommendations pr
       JOIN exercises e ON pr.exercise_id = e.id
       WHERE pr.status = 'active'
       ORDER BY pr.created_at DESC
       LIMIT 5`
    );
    setRecommendations(recs);
  };

  const dismissRecommendation = (id: number) => {
    db.runSync("UPDATE progression_recommendations SET status = 'dismissed', dismissed_at = datetime('now') WHERE id = ?", [id]);
    setRecommendations(prev => prev.filter(r => r.id !== id));
  };

  const snoozeRecommendation = (id: number) => {
    db.runSync("UPDATE progression_recommendations SET status = 'snoozed' WHERE id = ?", [id]);
    setRecommendations(prev => prev.filter(r => r.id !== id));
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Workout Templates</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.push('/template-builder')}>
            <Text style={styles.buttonText}>Create</Text>
          </TouchableOpacity>
        </View>

        {recommendations.length > 0 && (
          <View style={styles.recsSection}>
            <Text style={styles.recsTitle}>Recommendations</Text>
            {recommendations.map(rec => (
              <View key={rec.id} style={[styles.recCard, rec.type === 'PROGRESS_WEIGHT' && styles.recCardSuccess, rec.type === 'DELOAD' && styles.recCardWarning, rec.type === 'CHANGE_EXERCISE' && styles.recCardDanger]}>
                <View style={styles.recIconWrap}>
                  <Icon name={rec.type === 'PROGRESS_WEIGHT' ? 'arrowUp' : rec.type === 'PROGRESS_REPS' ? 'refresh' : rec.type === 'DELOAD' ? 'arrowDown' : 'shuffle'} size={18} color="#fff" />
                </View>
                <View style={styles.recContent}>
                  <Text style={styles.recExercise}>{rec.exerciseName}</Text>
                  <Text style={styles.recMessage}>{rec.message}</Text>
                </View>
                <View style={styles.recActions}>
                  <TouchableOpacity onPress={() => snoozeRecommendation(rec.id)}>
                    <Icon name="zzz" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => dismissRecommendation(rec.id)}>
                    <Text style={styles.recDismiss}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {templates.map(template => (
          <TouchableOpacity
            key={template.id}
            style={styles.card}
            onPress={() => router.push(`/template/${template.id}`)}
          >
            <Text style={styles.cardTitle}>{template.name}</Text>
            <Text style={styles.cardSubtitle}>
              Est. Duration: {Math.round(template.estimatedDuration / 60 / 5) * 5} min
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  scrollView: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  button: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  cardSubtitle: { fontSize: 14, color: '#9CA3AF', marginTop: 4 },
  recsSection: { marginBottom: 16 },
  recsTitle: { fontSize: 16, fontWeight: 'bold', color: '#D1D5DB', marginBottom: 8 },
  recCard: { flexDirection: 'row', backgroundColor: '#1E3A8A', borderRadius: 10, padding: 12, marginBottom: 8, alignItems: 'center' },
  recCardSuccess: { backgroundColor: '#1E3A8A' },
  recCardWarning: { backgroundColor: '#78350F' },
  recCardDanger: { backgroundColor: '#7F1D1D' },
  recIconWrap: { marginRight: 10, justifyContent: 'center' },
  recContent: { flex: 1 },
  recExercise: { color: '#fff', fontWeight: '600', fontSize: 14 },
  recMessage: { color: '#D1D5DB', fontSize: 12, marginTop: 2 },
  recActions: { flexDirection: 'row', gap: 8, marginLeft: 8, alignItems: 'center' },
  recDismiss: { fontSize: 14, color: '#6B7280' },
});
