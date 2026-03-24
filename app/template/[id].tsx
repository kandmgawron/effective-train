import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import db from '@/lib/database';
import { WorkoutTemplate, TemplateExercise } from '@/types';

export default function TemplateDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);

  useEffect(() => {
    loadTemplate();
  }, [id]);

  const loadTemplate = () => {
    const templateResult = db.getFirstSync<WorkoutTemplate>(
      'SELECT id, name, estimated_duration as estimatedDuration FROM workout_templates WHERE id = ?',
      [id]
    );
    setTemplate(templateResult || null);

    const exercisesResult = db.getAllSync<any>(`
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
    `, [id]);
    setExercises(exercisesResult);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Template',
      'Are you sure you want to delete this template?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            db.runSync('DELETE FROM template_exercises WHERE template_id = ?', [id]);
            db.runSync('DELETE FROM workout_templates WHERE id = ?', [id]);
            router.back();
          }
        }
      ]
    );
  };

  // Build render groups for visual superset grouping
  const renderGroups: { supersetGroup: number | null; exercises: TemplateExercise[] }[] = [];
  const seen = new Set<number>();
  exercises.forEach((ex) => {
    if (ex.supersetGroup != null) {
      if (!seen.has(ex.supersetGroup)) {
        seen.add(ex.supersetGroup);
        const members = exercises.filter(e => e.supersetGroup === ex.supersetGroup);
        if (members.length >= 2) {
          renderGroups.push({ supersetGroup: ex.supersetGroup, exercises: members });
          return;
        }
      } else { return; } // already added
    }
    renderGroups.push({ supersetGroup: null, exercises: [ex] });
  });

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{template?.name}</Text>
            <Text style={styles.subtitle}>
              Est. Duration: {template ? Math.round(template.estimatedDuration / 60 / 5) * 5 : 0} min
            </Text>
          </View>
          <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.editTemplateButton} onPress={() => router.push(`/template/edit/${id}`)}>
            <Text style={styles.editTemplateButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercises ({exercises.length})</Text>
          {renderGroups.map((group, gIdx) => {
            if (group.supersetGroup != null) {
              const members = group.exercises;
              const maxSets = Math.max(...members.map(e => e.sets));
              const maxRest = Math.max(...members.map(e => e.restTime));
              return (
                <View key={`sg-${group.supersetGroup}`} style={styles.supersetWrapper}>
                  <View style={styles.supersetHeader}>
                    <Text style={styles.supersetTitle}>Superset {group.supersetGroup}</Text>
                    <Text style={styles.supersetInfo}>{maxSets} sets • {maxRest}s rest</Text>
                  </View>
                  {members.map((ex) => (
                    <View key={ex.id} style={styles.supersetExerciseCard}>
                      <Text style={styles.exerciseName}>{ex.exerciseName}</Text>
                      <Text style={styles.exerciseMeta}>{ex.bodyPart} • {ex.equipment} • {ex.targetReps} {ex.exerciseType === 'time' ? 'sec' : ex.exerciseType === 'weight_only' ? 'laps' : 'reps'}</Text>
                      {ex.instructions && (
                        <View style={styles.instructionsBox}>
                          <Text style={styles.instructionsText}>{ex.instructions}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              );
            }

            const ex = group.exercises[0];
            return (
              <View key={ex.id} style={styles.exerciseCard}>
                <View style={styles.exerciseHeader}>
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>{ex.exerciseName}</Text>
                    <Text style={styles.exerciseMeta}>{ex.bodyPart} • {ex.equipment}</Text>
                  </View>
                </View>
                <View style={styles.exerciseDetails}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Sets</Text>
                    <Text style={styles.detailValue}>{ex.sets}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{ex.exerciseType === 'time' ? 'Target Secs' : ex.exerciseType === 'weight_only' ? 'Target Laps' : 'Target Reps'}</Text>
                    <Text style={styles.detailValue}>{ex.targetReps}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Rest</Text>
                    <Text style={styles.detailValue}>{ex.restTime}s</Text>
                  </View>
                </View>
                {ex.instructions && (
                  <View style={styles.instructionsBox}>
                    <Text style={styles.instructionsTitle}>Instructions</Text>
                    <Text style={styles.instructionsText}>{ex.instructions}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  scrollView: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#9CA3AF' },
  deleteButton: { backgroundColor: '#EF4444', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  deleteButtonText: { color: '#fff', fontWeight: '600' },
  editTemplateButton: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginRight: 8 },
  editTemplateButtonText: { color: '#fff', fontWeight: '600' },
  headerButtons: { flexDirection: 'row' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  exerciseCard: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  exerciseInfo: { flex: 1 },
  exerciseName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  exerciseMeta: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  exerciseDetails: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  detailItem: { flex: 1, backgroundColor: '#111827', padding: 12, borderRadius: 8, alignItems: 'center' },
  detailLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  detailValue: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  instructionsBox: { backgroundColor: '#111827', padding: 12, borderRadius: 8, marginTop: 6 },
  instructionsTitle: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', marginBottom: 4 },
  instructionsText: { fontSize: 13, color: '#D1D5DB', lineHeight: 18 },
  supersetWrapper: { borderWidth: 1, borderColor: '#F59E0B', borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: '#1F293780' },
  supersetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  supersetTitle: { color: '#F59E0B', fontWeight: '700', fontSize: 15 },
  supersetInfo: { color: '#D1D5DB', fontSize: 13 },
  supersetExerciseCard: { backgroundColor: '#1F2937', padding: 12, borderRadius: 8, marginBottom: 6 },
});
