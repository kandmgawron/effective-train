import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import db from '@/lib/database';
import { WorkoutTemplate } from '@/types';
import Icon from '@/components/Icon';

export default function WorkoutTemplates() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      loadTemplates();
    }, [])
  );

  const loadTemplates = () => {
    const result = db.getAllSync<WorkoutTemplate>(
      'SELECT id, name, estimated_duration as estimatedDuration FROM workout_templates'
    );
    setTemplates(result);
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
});
