import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import db from '@/lib/database';
import { Exercise, TemplateExercise } from '@/types';
import Icon from '@/components/Icon';

export default function EditTemplate() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [templateName, setTemplateName] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<TemplateExercise[]>([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [editingExercise, setEditingExercise] = useState<TemplateExercise | null>(null);
  const [showSupersetPicker, setShowSupersetPicker] = useState(false);
  const [supersetSelection, setSupersetSelection] = useState<Set<number>>(new Set());
  const [editingSupersetGroup, setEditingSupersetGroup] = useState<number | null>(null);

  useEffect(() => { loadExercises(); loadTemplate(); }, [id]);

  const loadExercises = () => {
    setExercises(db.getAllSync<Exercise>(
      "SELECT id, name, body_part as bodyPart, equipment, instructions, is_custom as isCustom, COALESCE(exercise_type, 'standard') as exerciseType FROM exercises ORDER BY name"
    ));
  };

  const loadTemplate = () => {
    const t = db.getFirstSync<{ name: string }>('SELECT name FROM workout_templates WHERE id = ?', [id]);
    if (t) setTemplateName(t.name);
    setSelectedExercises(db.getAllSync<any>(`
      SELECT te.id, te.template_id as templateId, te.exercise_id as exerciseId,
             e.name as exerciseName, e.body_part as bodyPart, e.equipment,
             e.instructions, te.sets, te.target_reps as targetReps,
             te.rest_time as restTime, te.exercise_order as "order",
             te.superset_group as supersetGroup,
             COALESCE(e.exercise_type, 'standard') as exerciseType
      FROM template_exercises te JOIN exercises e ON te.exercise_id = e.id
      WHERE te.template_id = ? ORDER BY te.exercise_order
    `, [id]));
  };

  const getNextSupersetGroup = (): number => {
    const groups = selectedExercises.map(e => e.supersetGroup).filter((g): g is number => g != null);
    return groups.length > 0 ? Math.max(...groups) + 1 : 1;
  };

  const openSupersetPicker = (existingGroup?: number) => {
    if (existingGroup != null) {
      setSupersetSelection(new Set(selectedExercises.filter(e => e.supersetGroup === existingGroup).map(e => e.id)));
      setEditingSupersetGroup(existingGroup);
    } else {
      setSupersetSelection(new Set());
      setEditingSupersetGroup(null);
    }
    setShowSupersetPicker(true);
  };

  const toggleSupersetSelection = (exId: number) => {
    setSupersetSelection(prev => { const n = new Set(prev); if (n.has(exId)) n.delete(exId); else n.add(exId); return n; });
  };

  const saveSupersetGroup = () => {
    if (supersetSelection.size < 2) return;
    const groupId = editingSupersetGroup ?? getNextSupersetGroup();
    setSelectedExercises(prev => prev.map(ex => {
      if (editingSupersetGroup != null && ex.supersetGroup === editingSupersetGroup)
        return { ...ex, supersetGroup: supersetSelection.has(ex.id) ? groupId : null };
      if (supersetSelection.has(ex.id)) return { ...ex, supersetGroup: groupId };
      return ex;
    }));
    setShowSupersetPicker(false); setSupersetSelection(new Set()); setEditingSupersetGroup(null);
  };

  const removeSupersetGroup = (groupId: number) => {
    setSelectedExercises(prev => prev.map(ex => ex.supersetGroup === groupId ? { ...ex, supersetGroup: null } : ex));
  };

  const handleAddExercise = (exercise: Exercise) => {
    setSelectedExercises(prev => [...prev, {
      id: Date.now(), templateId: Number(id), exerciseId: exercise.id,
      exerciseName: exercise.name, bodyPart: exercise.bodyPart, equipment: exercise.equipment,
      instructions: exercise.instructions, sets: 3, targetReps: 10, restTime: 90,
      order: selectedExercises.length, supersetGroup: null,
      exerciseType: (exercise as any).exerciseType || 'standard',
    }]);
    setShowExercisePicker(false);
  };

  const handleUpdateExercise = (updated: TemplateExercise) => {
    setSelectedExercises(prev => prev.map(ex => ex.id === updated.id ? updated : ex));
    setEditingExercise(null);
  };

  const handleRemoveExercise = (exId: number) => {
    setSelectedExercises(prev => {
      const updated = prev.filter(ex => ex.id !== exId);
      const gc: Record<number, number> = {};
      updated.forEach(ex => { if (ex.supersetGroup != null) gc[ex.supersetGroup] = (gc[ex.supersetGroup] || 0) + 1; });
      return updated.map(ex => ex.supersetGroup != null && (gc[ex.supersetGroup] || 0) < 2 ? { ...ex, supersetGroup: null } : ex);
    });
  };

  const moveExercise = (fromIdx: number, dir: -1 | 1) => {
    const toIdx = fromIdx + dir;
    if (toIdx < 0 || toIdx >= selectedExercises.length) return;
    const updated = [...selectedExercises];
    [updated[fromIdx], updated[toIdx]] = [updated[toIdx], updated[fromIdx]];
    setSelectedExercises(updated.map((ex, i) => ({ ...ex, order: i })));
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim() || selectedExercises.length === 0) return;
    const gc: Record<number, number> = {};
    selectedExercises.forEach(ex => { if (ex.supersetGroup != null) gc[ex.supersetGroup] = (gc[ex.supersetGroup] || 0) + 1; });
    const cleaned = selectedExercises.map(ex => ex.supersetGroup != null && (gc[ex.supersetGroup] || 0) < 2 ? { ...ex, supersetGroup: null } : ex);

    const groupSets: Record<number, number> = {};
    let totalTime = 0;
    cleaned.forEach(ex => {
      if (ex.supersetGroup != null) {
        if (!groupSets[ex.supersetGroup]) groupSets[ex.supersetGroup] = 0;
        groupSets[ex.supersetGroup] = Math.max(groupSets[ex.supersetGroup], ex.sets);
      } else {
        // Non-superset: each set = ~90s (lifting + setup) + rest
        totalTime += ex.sets * (90 + ex.restTime);
      }
    });
    for (const g of Object.keys(groupSets)) {
      const gn = Number(g);
      const members = cleaned.filter(e => e.supersetGroup === gn);
      const maxRest = Math.max(...members.map(e => e.restTime));
      // Superset round: do each exercise (~90s each) back-to-back, then rest
      const liftingPerRound = members.length * 90;
      const rounds = groupSets[gn];
      totalTime += rounds * (liftingPerRound + maxRest);
    }

    db.runSync('UPDATE workout_templates SET name = ?, estimated_duration = ? WHERE id = ?',
      [templateName, totalTime, id]);
    db.runSync('DELETE FROM template_exercises WHERE template_id = ?', [id]);
    cleaned.forEach((ex, i) => {
      db.runSync('INSERT INTO template_exercises (template_id, exercise_id, sets, target_reps, rest_time, exercise_order, superset_group) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, ex.exerciseId, ex.sets, ex.targetReps, ex.restTime, i, ex.supersetGroup ?? null]);
    });
    router.back();
  };

  // Build render groups: consecutive exercises with same supersetGroup get grouped
  // Non-superset exercises or different groups start new entries
  const renderGroups: { supersetGroup: number | null; exercises: TemplateExercise[] }[] = [];
  const seen = new Set<number>(); // track which superset groups we've rendered
  selectedExercises.forEach((ex) => {
    if (ex.supersetGroup != null) {
      if (!seen.has(ex.supersetGroup)) {
        seen.add(ex.supersetGroup);
        renderGroups.push({ supersetGroup: ex.supersetGroup, exercises: selectedExercises.filter(e => e.supersetGroup === ex.supersetGroup) });
      }
    } else {
      renderGroups.push({ supersetGroup: null, exercises: [ex] });
    }
  });

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <Text style={styles.title}>Edit Template</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Template Name</Text>
          <TextInput style={styles.input} value={templateName} onChangeText={setTemplateName}
            placeholder="e.g., Push Day, Leg Day" placeholderTextColor="#6B7280" />
        </View>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Exercises ({selectedExercises.length})</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.addButton} onPress={() => setShowExercisePicker(true)}>
              <Text style={styles.buttonText}>+ Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addSupersetBtn, selectedExercises.length < 2 && { opacity: 0.4 }]}
              onPress={() => openSupersetPicker()}
              disabled={selectedExercises.length < 2}
            >
              <Text style={styles.addSupersetBtnText}>Add Superset</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentInner}>
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
                  <View style={styles.supersetActions}>
                    <TouchableOpacity onPress={() => openSupersetPicker(group.supersetGroup!)}>
                      <Text style={styles.supersetEditBtn}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeSupersetGroup(group.supersetGroup!)}>
                      <Text style={styles.supersetRemoveBtn}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {members.map((item) => {
                  const globalIdx = selectedExercises.indexOf(item);
                  return (
                    <View key={item.id} style={styles.supersetExerciseCard}>
                      <View style={styles.exerciseHeader}>
                        <View style={styles.exerciseInfo}>
                          <Text style={styles.exerciseName}>{item.exerciseName}</Text>
                          <Text style={styles.exerciseMeta}>{item.bodyPart} • {item.equipment}</Text>
                        </View>
                        <TouchableOpacity onPress={() => handleRemoveExercise(item.id)}>
                          <Text style={styles.removeButton}>×</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.repsText}>{item.targetReps} {item.exerciseType === 'time' ? 'sec' : item.exerciseType === 'weight_only' ? 'laps' : 'reps'}</Text>
                      <View style={styles.cardActions}>
                        <TouchableOpacity style={styles.moveBtn} onPress={() => moveExercise(globalIdx, -1)}>
                          <Text style={styles.moveBtnText}>▲</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.moveBtn} onPress={() => moveExercise(globalIdx, 1)}>
                          <Text style={styles.moveBtnText}>▼</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.editButton} onPress={() => setEditingExercise(item)}>
                          <Text style={styles.editButtonText}>Edit</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          }

          const item = group.exercises[0];
          const globalIdx = selectedExercises.indexOf(item);
          return (
            <View key={item.id} style={styles.exerciseCard}>
              <View style={styles.exerciseHeader}>
                <View style={styles.exerciseInfo}>
                  <Text style={styles.exerciseName}>{item.exerciseName}</Text>
                  <Text style={styles.exerciseMeta}>{item.bodyPart} • {item.equipment}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveExercise(item.id)}>
                  <Text style={styles.removeButton}>×</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.exerciseDetails}>
                <Text style={styles.detailText}>{item.sets} sets × {item.targetReps} {item.exerciseType === 'time' ? 'sec' : item.exerciseType === 'weight_only' ? 'laps' : 'reps'}</Text>
                <Text style={styles.detailText}>Rest: {item.restTime}s</Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.moveBtn} onPress={() => moveExercise(globalIdx, -1)}>
                  <Text style={styles.moveBtnText}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.moveBtn} onPress={() => moveExercise(globalIdx, 1)}>
                  <Text style={styles.moveBtnText}>▼</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editButton} onPress={() => setEditingExercise(item)}>
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.saveButton, (!templateName.trim() || selectedExercises.length === 0) && styles.saveButtonDisabled]}
          onPress={handleSaveTemplate}
          disabled={!templateName.trim() || selectedExercises.length === 0}
        >
          <Text style={styles.saveButtonText}>Save Template</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteTemplateBtn}
          onPress={() => {
            Alert.alert('Delete Template', 'Are you sure? This will permanently delete this template.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => {
                db.runSync('DELETE FROM template_exercises WHERE template_id = ?', [id]);
                db.runSync('DELETE FROM workout_templates WHERE id = ?', [id]);
                router.back();
                router.back();
              }},
            ]);
          }}
        >
          <Text style={styles.deleteTemplateBtnText}>Delete Template</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Exercise Picker Modal */}
      <Modal visible={showExercisePicker} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Exercise</Text>
            <TouchableOpacity onPress={() => { setShowExercisePicker(false); setExerciseSearch(''); }}>
              <Icon name="chevronLeft" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercises..."
              placeholderTextColor="#6B7280"
              value={exerciseSearch}
              onChangeText={setExerciseSearch}
              autoFocus
            />
          </View>
          <ScrollView style={styles.modalScroll}>
            {exercises.filter(ex => !exerciseSearch || ex.name.toLowerCase().includes(exerciseSearch.toLowerCase()) || ex.bodyPart.toLowerCase().includes(exerciseSearch.toLowerCase())).map(ex => (
              <TouchableOpacity key={ex.id} style={styles.exerciseOption} onPress={() => handleAddExercise(ex)}>
                <Text style={styles.exerciseOptionName}>{ex.name}</Text>
                <Text style={styles.exerciseOptionMeta}>{ex.bodyPart} • {ex.equipment}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Exercise Modal */}
      <Modal visible={!!editingExercise} animationType="slide" transparent>
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalContent}>
            <Text style={styles.modalTitle}>Edit Exercise</Text>
            {editingExercise && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Sets</Text>
                  <TextInput style={styles.input} value={String(editingExercise.sets)}
                    onChangeText={text => setEditingExercise({ ...editingExercise, sets: parseInt(text) || 0 })} keyboardType="number-pad" />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{editingExercise.exerciseType === 'time' ? 'Target Seconds' : editingExercise.exerciseType === 'weight_only' ? 'Target Laps' : 'Target Reps'}</Text>
                  <TextInput style={styles.input} value={String(editingExercise.targetReps)}
                    onChangeText={text => setEditingExercise({ ...editingExercise, targetReps: parseInt(text) || 0 })} keyboardType="number-pad" />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Rest Time (seconds)</Text>
                  <TextInput style={styles.input} value={String(editingExercise.restTime)}
                    onChangeText={text => setEditingExercise({ ...editingExercise, restTime: parseInt(text) || 0 })} keyboardType="number-pad" />
                </View>
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={() => handleUpdateExercise(editingExercise)}>
                    <Text style={styles.buttonText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.button, styles.cancelButton, { flex: 1 }]} onPress={() => setEditingExercise(null)}>
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Superset Picker Modal */}
      <Modal visible={showSupersetPicker} animationType="slide" transparent>
        <View style={styles.editModalOverlay}>
          <View style={styles.supersetPickerContent}>
            <Text style={styles.modalTitle}>
              {editingSupersetGroup != null ? `Edit Superset ${editingSupersetGroup}` : 'Create Superset'}
            </Text>
            <Text style={styles.supersetPickerHint}>Select 2 or more exercises to group</Text>
            <ScrollView style={styles.supersetPickerScroll}>
              {selectedExercises.map((ex, i) => {
                const isSelected = supersetSelection.has(ex.id);
                const inOtherGroup = ex.supersetGroup != null && ex.supersetGroup !== editingSupersetGroup;
                return (
                  <TouchableOpacity
                    key={ex.id}
                    style={[styles.supersetPickerItem, isSelected && styles.supersetPickerItemSelected, inOtherGroup && styles.supersetPickerItemDisabled]}
                    onPress={() => !inOtherGroup && toggleSupersetSelection(ex.id)}
                    disabled={inOtherGroup}
                  >
                    <Text style={[styles.supersetPickerCheck, isSelected && styles.supersetPickerCheckSelected]}>
                      {isSelected ? '✓' : '○'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.supersetPickerName, inOtherGroup && { color: '#6B7280' }]}>
                        {i + 1}. {ex.exerciseName}
                      </Text>
                      {inOtherGroup && (
                        <Text style={styles.supersetPickerInGroup}>Already in Superset {ex.supersetGroup}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, { flex: 1 }, supersetSelection.size < 2 && { opacity: 0.4 }]}
                onPress={saveSupersetGroup}
                disabled={supersetSelection.size < 2}
              >
                <Text style={styles.buttonText}>
                  {supersetSelection.size < 2 ? 'Select 2+' : `Save (${supersetSelection.size} exercises)`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton, { flex: 1 }]}
                onPress={() => { setShowSupersetPicker(false); setSupersetSelection(new Set()); setEditingSupersetGroup(null); }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  topSection: { padding: 16, paddingBottom: 0 },
  scrollContent: { flex: 1 },
  scrollContentInner: { paddingHorizontal: 16, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 24 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, color: '#fff', marginBottom: 8, fontWeight: '600' },
  input: { backgroundColor: '#374151', color: '#fff', padding: 12, borderRadius: 8, fontSize: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  headerActions: { flexDirection: 'row', gap: 8 },
  addButton: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addSupersetBtn: { backgroundColor: '#78350F', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addSupersetBtnText: { color: '#F59E0B', fontSize: 13, fontWeight: '600' },
  buttonText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  exerciseCard: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  exerciseInfo: { flex: 1 },
  exerciseName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  exerciseMeta: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  removeButton: { fontSize: 32, color: '#EF4444', fontWeight: 'bold', paddingHorizontal: 8 },
  exerciseDetails: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  detailText: { fontSize: 14, color: '#D1D5DB' },
  repsText: { fontSize: 14, color: '#D1D5DB', marginBottom: 8 },
  cardActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  moveBtn: { backgroundColor: '#374151', width: 32, height: 32, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  moveBtnText: { color: '#9CA3AF', fontSize: 14 },
  editButton: { backgroundColor: '#374151', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  editButtonText: { color: '#fff', fontSize: 13 },
  supersetWrapper: { borderWidth: 1, borderColor: '#F59E0B', borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: '#1F293780' },
  supersetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
  supersetTitle: { color: '#F59E0B', fontWeight: '700', fontSize: 15 },
  supersetInfo: { color: '#D1D5DB', fontSize: 13 },
  supersetActions: { flexDirection: 'row', gap: 12, marginLeft: 'auto' },
  supersetEditBtn: { color: '#3B82F6', fontSize: 13, fontWeight: '600' },
  supersetRemoveBtn: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  supersetExerciseCard: { backgroundColor: '#1F2937', padding: 12, borderRadius: 8, marginBottom: 6 },
  saveButton: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 12, marginTop: 16, marginBottom: 32 },
  saveButtonDisabled: { backgroundColor: '#374151', opacity: 0.5 },
  saveButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  deleteTemplateBtn: { backgroundColor: '#EF4444', padding: 14, borderRadius: 12, marginTop: 8, marginBottom: 40, alignItems: 'center' },
  deleteTemplateBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#111827' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#374151' },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  closeButton: { fontSize: 40, color: '#fff', fontWeight: 'bold' },
  modalScroll: { flex: 1, padding: 16 },
  searchInput: { backgroundColor: '#374151', color: '#fff', padding: 12, borderRadius: 8, fontSize: 16 },
  exerciseOption: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  exerciseOptionName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  exerciseOptionMeta: { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  editModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 16 },
  editModalContent: { backgroundColor: '#1F2937', padding: 24, borderRadius: 12 },
  modalButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  button: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  cancelButton: { backgroundColor: '#374151' },
  supersetPickerContent: { backgroundColor: '#1F2937', padding: 24, borderRadius: 12, maxHeight: '80%' },
  supersetPickerHint: { color: '#9CA3AF', fontSize: 13, marginBottom: 12 },
  supersetPickerScroll: { maxHeight: 400 },
  supersetPickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, marginBottom: 4 },
  supersetPickerItemSelected: { backgroundColor: '#F59E0B20' },
  supersetPickerItemDisabled: { opacity: 0.5 },
  supersetPickerCheck: { fontSize: 18, color: '#6B7280', marginRight: 12, width: 24, textAlign: 'center' },
  supersetPickerCheckSelected: { color: '#F59E0B' },
  supersetPickerName: { color: '#fff', fontSize: 15 },
  supersetPickerInGroup: { color: '#F59E0B', fontSize: 11, marginTop: 2 },
});
