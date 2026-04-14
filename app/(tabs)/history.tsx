import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, Share, Modal, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import db from '@/lib/database';
import { WorkoutLog } from '@/types';
import Icon from '@/components/Icon';
import BackToTop from '@/components/BackToTop';

interface SetDetail {
  id: number;
  exerciseName: string;
  setNumber: number;
  reps: number;
  weight: number;
  isDropSet: boolean;
  notes: string | null;
}

export default function WorkoutHistory() {
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<WorkoutLog | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [scrollY, setScrollY] = useState(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => { setScrollY(e.nativeEvent.contentOffset.y); };
  const [setDetails, setSetDetails] = useState<SetDetail[]>([]);
  const router = useRouter();

  useFocusEffect(useCallback(() => { loadLogs(); }, []));

  const loadLogs = () => {
    const result = db.getAllSync<WorkoutLog>(`
      SELECT wl.id, wl.template_id as templateId, wl.date, wl.duration,
             wt.name as templateName
      FROM workout_logs wl
      LEFT JOIN workout_templates wt ON wl.template_id = wt.id
      ORDER BY wl.date DESC
    `);
    setLogs(result);
  };

  const [editing, setEditing] = useState(false);
  const [editSets, setEditSets] = useState<SetDetail[]>([]);
  const [editName, setEditName] = useState('');
  const [editDuration, setEditDuration] = useState('');

  const openWorkoutDetail = (log: WorkoutLog) => {
    const sets = db.getAllSync<SetDetail>(`
      SELECT sl.id, e.name as exerciseName, sl.set_number as setNumber,
             sl.reps, sl.weight, sl.is_drop_set as isDropSet, sl.notes
      FROM set_logs sl
      JOIN exercises e ON sl.exercise_id = e.id
      WHERE sl.workout_log_id = ?
      ORDER BY sl.id
    `, [log.id]);
    setSetDetails(sets);
    setEditSets(sets);
    setEditing(false);
    setSelectedLog(log);
  };

  const deleteWorkout = (logId: number) => {
    Alert.alert('Delete Workout', 'This will permanently delete this workout and all its sets.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          // Clean up recs for exercises that will lose all data
          const delExIds = db.getAllSync<{ exerciseId: number }>(
            'SELECT DISTINCT exercise_id as exerciseId FROM set_logs WHERE workout_log_id = ?', [logId]
          );
          db.runSync('DELETE FROM set_logs WHERE workout_log_id = ?', [logId]);
          db.runSync('DELETE FROM personal_records WHERE workout_log_id = ?', [logId]);
          for (const { exerciseId } of delExIds) {
            const remaining = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM set_logs WHERE exercise_id = ?', [exerciseId]);
            if (!remaining || remaining.c === 0) {
              db.runSync('DELETE FROM progression_recommendations WHERE exercise_id = ?', [exerciseId]);
            }
          }
          db.runSync('DELETE FROM workout_logs WHERE id = ?', [logId]);
          setSelectedLog(null);
          setEditing(false);
          loadLogs();
        }
      }
    ]);
  };

  const startEditing = () => {
    setEditSets(setDetails.map(s => ({ ...s })));
    setEditName(selectedLog?.templateName || 'Freestyle Workout');
    setEditDuration(String(selectedLog?.duration ?? 0));
    setEditing(true);
  };

  const updateEditSet = (idx: number, field: 'reps' | 'weight', value: string) => {
    setEditSets(prev => prev.map((s, i) => i === idx ? { ...s, [field]: field === 'reps' ? (parseInt(value) || 0) : (parseFloat(value) || 0) } : s));
  };

  const saveEdits = () => {
    for (const s of editSets) {
      db.runSync('UPDATE set_logs SET reps = ?, weight = ? WHERE id = ?', [s.reps, s.weight, s.id]);
    }
    if (selectedLog) {
      const newDuration = parseInt(editDuration) || 0;
      db.runSync('UPDATE workout_logs SET duration = ? WHERE id = ?', [newDuration, selectedLog.id]);
      // Update template name if it changed and has a template
      if (selectedLog.templateId && editName !== selectedLog.templateName) {
        db.runSync('UPDATE workout_templates SET name = ? WHERE id = ?', [editName, selectedLog.templateId]);
      }
      // Store custom name for freestyle workouts via user_settings
      if (!selectedLog.templateId && editName !== 'Freestyle Workout') {
        db.runSync(
          "INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)",
          [`workout_name_${selectedLog.id}`, editName]
        );
      }
      setSelectedLog({ ...selectedLog, templateName: editName, duration: newDuration });
    }
    setSetDetails(editSets);
    setEditing(false);
    loadLogs();
  };

  const cancelEditing = () => {
    setEditSets(setDetails.map(s => ({ ...s })));
    setEditing(false);
  };

  const handleExport = () => {
    const rows = db.getAllSync<any>(`
      SELECT wl.date, wt.name as workout_name, e.name as exercise_name,
             sl.set_number, sl.reps, sl.weight, sl.is_drop_set
      FROM set_logs sl
      JOIN workout_logs wl ON sl.workout_log_id = wl.id
      LEFT JOIN workout_templates wt ON wl.template_id = wt.id
      JOIN exercises e ON sl.exercise_id = e.id
      ORDER BY wl.date, wl.id, sl.exercise_id, sl.set_number
    `);
    let csv = 'Date,Workout,Exercise,Set,Reps,Weight(kg),DropSet\n';
    rows.forEach((row) => {
      csv += `${row.date},${row.workout_name || ''},${row.exercise_name},${row.set_number},${row.reps},${row.weight},${row.is_drop_set ? 'Yes' : 'No'}\n`;
    });
    Share.share({ message: csv, title: 'Workout Export' });
  };

  // Group sets by exercise for the detail view
  const displayDetailSets = editing ? editSets : setDetails;
  const groupedSets: { exercise: string; sets: (SetDetail & { flatIdx: number })[] }[] = [];
  displayDetailSets.forEach((s, idx) => {
    const last = groupedSets[groupedSets.length - 1];
    if (last && last.exercise === s.exerciseName) {
      last.sets.push({ ...s, flatIdx: idx });
    } else {
      groupedSets.push({ exercise: s.exerciseName, sets: [{ ...s, flatIdx: idx }] });
    }
  });

  const totalVolume = setDetails.reduce((sum, s) => sum + s.reps * Math.abs(s.weight), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.calendarButton} onPress={() => router.push('/calendar')}>
            <Icon name="calendar" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
            <Text style={styles.buttonText}>Export</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={styles.scrollView} onScroll={onScroll} scrollEventThrottle={100}>
        {logs.map(log => (
          <TouchableOpacity key={log.id} style={styles.card} onPress={() => openWorkoutDetail(log)}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>{log.templateName || 'Freestyle Workout'}</Text>
                <Text style={styles.cardDate}>{log.date}</Text>
              </View>
              <Text style={styles.duration}>{log.duration} min</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={selectedLog !== null} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setSelectedLog(null); setEditing(false); }} style={styles.backButton}>
              <Icon name="chevronLeft" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              {editing ? (
                <>
                  <TextInput
                    style={styles.editNameInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Workout name"
                    placeholderTextColor="#6B7280"
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                    <Text style={styles.modalSubtitle}>{selectedLog?.date} •</Text>
                    <TextInput
                      style={styles.editDurationInput}
                      value={editDuration}
                      onChangeText={setEditDuration}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor="#6B7280"
                    />
                    <Text style={styles.modalSubtitle}>min</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.modalTitle}>{selectedLog?.templateName || 'Freestyle Workout'}</Text>
                  <Text style={styles.modalSubtitle}>{selectedLog?.date} • {selectedLog?.duration} min • {Math.round(totalVolume / 1000 * 10) / 10}t volume</Text>
                </>
              )}
            </View>
            {editing ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.saveBtn} onPress={saveEdits}>
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={cancelEditing}>
                  <Text style={styles.cancelEditText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.editBtn} onPress={startEditing}>
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.modalScroll}>
            {groupedSets.map((group, gIdx) => (
              <View key={gIdx} style={styles.exerciseBlock}>
                <Text style={styles.exerciseTitle}>{group.exercise}</Text>
                <View style={styles.setHeaderRow}>
                  <Text style={styles.setHeaderText}>Set</Text>
                  <Text style={styles.setHeaderText}>Reps</Text>
                  <Text style={styles.setHeaderText}>Weight</Text>
                  <Text style={styles.setHeaderText}>Vol</Text>
                </View>
                {group.sets.map((s, sIdx) => (
                  <View key={sIdx}>
                    <View style={[styles.setRow, s.isDropSet && styles.setRowFailed]}>
                      <Text style={styles.setCellNum}>{s.setNumber}</Text>
                      {editing ? (
                        <>
                          <TextInput
                            style={styles.editInput}
                            value={String(s.reps)}
                            onChangeText={v => updateEditSet(s.flatIdx, 'reps', v)}
                            keyboardType="number-pad"
                          />
                          <TextInput
                            style={styles.editInput}
                            value={String(s.weight)}
                            onChangeText={v => updateEditSet(s.flatIdx, 'weight', v)}
                            keyboardType="decimal-pad"
                          />
                        </>
                      ) : (
                        <>
                          <Text style={styles.setCell}>{s.reps}</Text>
                          <Text style={styles.setCell}>{s.weight} kg</Text>
                        </>
                      )}
                      <Text style={styles.setCellVol}>{Math.round(s.reps * Math.abs(s.weight))}</Text>
                    </View>
                    {s.notes ? <Text style={styles.setNote}><Icon name="notes" size={12} color="#9CA3AF" /> {s.notes}</Text> : null}
                  </View>
                ))}
              </View>
            ))}

            {setDetails.length === 0 && (
              <Text style={styles.emptyText}>No sets recorded for this workout.</Text>
            )}

            <TouchableOpacity style={styles.deleteButton} onPress={() => selectedLog && deleteWorkout(selectedLog.id)}>
              <Text style={styles.deleteButtonText}>Delete Workout</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
      <BackToTop scrollY={scrollY} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  exportButton: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  calendarButton: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  scrollView: { flex: 1 },
  card: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  cardDate: { fontSize: 14, color: '#9CA3AF', marginTop: 4 },
  duration: { fontSize: 14, color: '#9CA3AF' },
  modalContainer: { flex: 1, backgroundColor: '#111827' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#374151', gap: 12 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  modalSubtitle: { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  backButton: { paddingTop: 2 },
  modalScroll: { flex: 1, padding: 16 },
  exerciseBlock: { backgroundColor: '#1F2937', borderRadius: 12, padding: 14, marginBottom: 12 },
  exerciseTitle: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 10 },
  setHeaderRow: { flexDirection: 'row', marginBottom: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#374151' },
  setHeaderText: { flex: 1, color: '#6B7280', fontSize: 12, fontWeight: '600' },
  setRow: { flexDirection: 'row', paddingVertical: 6 },
  setRowFailed: { opacity: 0.5 },
  setCellNum: { flex: 1, color: '#9CA3AF', fontSize: 14 },
  setCell: { flex: 1, color: '#fff', fontSize: 14 },
  setCellVol: { flex: 1, color: '#D1D5DB', fontSize: 14 },
  setNote: { color: '#9CA3AF', fontSize: 12, marginLeft: 4, marginBottom: 4 },
  emptyText: { color: '#6B7280', fontSize: 14, textAlign: 'center', marginTop: 32 },
  deleteButton: { backgroundColor: '#EF4444', padding: 14, borderRadius: 10, marginTop: 24, marginBottom: 40, alignItems: 'center' },
  deleteButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  editBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  editBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  saveBtn: { backgroundColor: '#10B981', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cancelEditText: { color: '#9CA3AF', fontSize: 14, paddingVertical: 6 },
  editInput: { flex: 1, color: '#fff', fontSize: 14, backgroundColor: '#374151', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, textAlign: 'center' },
  editNameInput: { color: '#fff', fontSize: 20, fontWeight: 'bold', backgroundColor: '#374151', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  editDurationInput: { color: '#fff', fontSize: 13, backgroundColor: '#374151', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, width: 40, textAlign: 'center' },
});
