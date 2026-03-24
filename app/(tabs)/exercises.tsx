import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, StyleSheet } from 'react-native';
import db from '@/lib/database';
import { Exercise, ExerciseProgressionConfig } from '@/types';

export default function ExerciseLibrary() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [bodyParts, setBodyParts] = useState<string[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBodyPart, setSelectedBodyPart] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editExercise, setEditExercise] = useState<{ id: number; name: string; bodyParts: string[]; equipment: string; instructions: string } | null>(null);
  const [newExercise, setNewExercise] = useState({
    name: '',
    bodyParts: [] as string[],
    equipment: '',
    instructions: ''
  });
  const [progressionConfig, setProgressionConfig] = useState<ExerciseProgressionConfig | null>(null);

  const loadProgressionConfig = (exerciseId: number) => {
    let config = db.getFirstSync<any>(
      `SELECT id, exercise_id as exerciseId, progression_rule as progressionRule,
              rep_range_min as repRangeMin, rep_range_max as repRangeMax,
              weight_increment as weightIncrement, sensitivity
       FROM exercise_progression_config WHERE exercise_id = ?`, [exerciseId]
    );
    if (!config) {
      const exInfo = db.getFirstSync<{ movementType: string }>(
        "SELECT COALESCE(movement_type, 'compound') as movementType FROM exercises WHERE id = ?", [exerciseId]
      );
      const defaultIncrement = exInfo?.movementType === 'isolation' ? 1.25 : 2.5;
      db.runSync(
        'INSERT INTO exercise_progression_config (exercise_id, weight_increment) VALUES (?, ?)', [exerciseId, defaultIncrement]
      );
      config = db.getFirstSync<any>(
        `SELECT id, exercise_id as exerciseId, progression_rule as progressionRule,
                rep_range_min as repRangeMin, rep_range_max as repRangeMax,
                weight_increment as weightIncrement, sensitivity
         FROM exercise_progression_config WHERE exercise_id = ?`, [exerciseId]
      );
    }
    setProgressionConfig(config);
  };

  const saveProgressionConfig = () => {
    if (!progressionConfig) return;
    db.runSync(
      `UPDATE exercise_progression_config SET progression_rule=?, rep_range_min=?, rep_range_max=?, weight_increment=?, sensitivity=? WHERE exercise_id=?`,
      [progressionConfig.progressionRule, progressionConfig.repRangeMin, progressionConfig.repRangeMax, progressionConfig.weightIncrement, progressionConfig.sensitivity, progressionConfig.exerciseId]
    );
  };

  const selectExercise = (ex: Exercise) => {
    setSelectedExercise(ex);
    loadProgressionConfig(ex.id);
  };

  const closeExerciseDetail = () => {
    if (progressionConfig) saveProgressionConfig();
    setSelectedExercise(null);
    setProgressionConfig(null);
  };

  useEffect(() => {
    loadExercises();
    const parts = db.getAllSync<{ body_part: string }>('SELECT DISTINCT body_part FROM exercises ORDER BY body_part');
    setBodyParts(parts.map(p => p.body_part));
    const equip = db.getAllSync<{ equipment: string }>('SELECT DISTINCT equipment FROM exercises ORDER BY equipment');
    setEquipmentTypes(equip.map(e => e.equipment));
  }, []);

  useEffect(() => {
    loadExercises();
  }, [searchQuery, selectedBodyPart, selectedEquipment]);

  const loadExercises = () => {
    let query = 'SELECT id, name, body_part as bodyPart, equipment, instructions, is_custom as isCustom FROM exercises WHERE 1=1';
    const params: string[] = [];

    if (searchQuery.trim()) {
      query += ' AND name LIKE ?';
      params.push(`%${searchQuery.trim()}%`);
    }
    if (selectedBodyPart) {
      query += ' AND body_part = ?';
      params.push(selectedBodyPart);
    }
    if (selectedEquipment) {
      query += ' AND equipment = ?';
      params.push(selectedEquipment);
    }
    query += ' ORDER BY name';

    const result = db.getAllSync<Exercise>(query, params);
    setExercises(result);
  };

  const clearFilters = () => {
    setSelectedBodyPart('');
    setSelectedEquipment('');
    setShowFilterModal(false);
  };

  const activeFilterCount = (selectedBodyPart ? 1 : 0) + (selectedEquipment ? 1 : 0);

  const handleAddExercise = () => {
    if (!newExercise.name.trim() || newExercise.bodyParts.length === 0 || !newExercise.equipment) return;
    const bodyPartStr = newExercise.bodyParts.join(', ');
    db.runSync(
      'INSERT INTO exercises (name, body_part, equipment, instructions, is_custom) VALUES (?, ?, ?, ?, 1)',
      [newExercise.name, bodyPartStr, newExercise.equipment, newExercise.instructions]
    );
    setShowAddModal(false);
    setNewExercise({ name: '', bodyParts: [], equipment: '', instructions: '' });
    loadExercises();
  };

  const toggleNewBodyPart = (bp: string) => {
    setNewExercise(prev => ({
      ...prev,
      bodyParts: prev.bodyParts.includes(bp)
        ? prev.bodyParts.filter(b => b !== bp)
        : [...prev.bodyParts, bp],
    }));
  };

  const toggleEditBodyPart = (bp: string) => {
    if (!editExercise) return;
    setEditExercise({
      ...editExercise,
      bodyParts: editExercise.bodyParts.includes(bp)
        ? editExercise.bodyParts.filter(b => b !== bp)
        : [...editExercise.bodyParts, bp],
    });
  };

  const openEditExercise = () => {
    if (!selectedExercise) return;
    const parts = selectedExercise.bodyPart.split(',').map(s => s.trim()).filter(Boolean);
    setEditExercise({
      id: selectedExercise.id,
      name: selectedExercise.name,
      bodyParts: parts,
      equipment: selectedExercise.equipment,
      instructions: selectedExercise.instructions || '',
    });
  };

  const handleSaveEditExercise = () => {
    if (!editExercise || !editExercise.name.trim() || editExercise.bodyParts.length === 0 || !editExercise.equipment) return;
    const bodyPartStr = editExercise.bodyParts.join(', ');
    db.runSync(
      'UPDATE exercises SET name = ?, body_part = ?, equipment = ?, instructions = ? WHERE id = ?',
      [editExercise.name, bodyPartStr, editExercise.equipment, editExercise.instructions, editExercise.id]
    );
    setEditExercise(null);
    setSelectedExercise(null);
    setProgressionConfig(null);
    loadExercises();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Exercises</Text>
        <TouchableOpacity style={styles.button} onPress={() => setShowAddModal(true)}>
          <Text style={styles.buttonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search exercises..."
          placeholderTextColor="#6B7280"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity
          style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
          onPress={() => setShowFilterModal(true)}
        >
          <Text style={styles.filterButtonText}>
            Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.resultCount}>{exercises.length} exercises</Text>

      <ScrollView style={styles.scrollView}>
        {exercises.map(ex => (
          <TouchableOpacity
            key={ex.id}
            style={styles.card}
            onPress={() => selectExercise(ex)}
          >
            <Text style={styles.cardTitle}>{ex.name}</Text>
            <View style={styles.cardMeta}>
              <Text style={styles.cardMetaText}>{ex.bodyPart}</Text>
              <Text style={styles.cardMetaText}>•</Text>
              <Text style={styles.cardMetaText}>{ex.equipment}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filter Modal */}
      <Modal visible={showFilterModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filter Exercises</Text>
            
            <Text style={styles.filterLabel}>Body Part</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
              <TouchableOpacity
                style={[styles.chip, !selectedBodyPart && styles.chipActive]}
                onPress={() => setSelectedBodyPart('')}
              >
                <Text style={styles.chipText}>All</Text>
              </TouchableOpacity>
              {bodyParts.map(bp => (
                <TouchableOpacity
                  key={bp}
                  style={[styles.chip, selectedBodyPart === bp && styles.chipActive]}
                  onPress={() => setSelectedBodyPart(bp)}
                >
                  <Text style={styles.chipText}>{bp}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.filterLabel}>Equipment</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
              <TouchableOpacity
                style={[styles.chip, !selectedEquipment && styles.chipActive]}
                onPress={() => setSelectedEquipment('')}
              >
                <Text style={styles.chipText}>All</Text>
              </TouchableOpacity>
              {equipmentTypes.map(eq => (
                <TouchableOpacity
                  key={eq}
                  style={[styles.chip, selectedEquipment === eq && styles.chipActive]}
                  onPress={() => setSelectedEquipment(eq)}
                >
                  <Text style={styles.chipText}>{eq}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={() => setShowFilterModal(false)}>
                <Text style={styles.buttonText}>Apply</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.cancelButton, { flex: 1 }]} onPress={clearFilters}>
                <Text style={styles.buttonText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Exercise Detail Modal */}
      <Modal visible={!!selectedExercise} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>{selectedExercise?.name}</Text>
              <View style={styles.modalMeta}>
                <Text style={styles.modalMetaText}>Body Part: {selectedExercise?.bodyPart}</Text>
                <Text style={styles.modalMetaText}>Equipment: {selectedExercise?.equipment}</Text>
              </View>
              {selectedExercise?.instructions ? (
                <View style={styles.instructionsBox}>
                  <Text style={styles.instructionsTitle}>Instructions</Text>
                  <Text style={styles.instructionsText}>{selectedExercise.instructions}</Text>
                </View>
              ) : null}

              {progressionConfig && (
                <View style={styles.progressionSection}>
                  <Text style={styles.progressionTitle}>Progression Config</Text>

                  <Text style={styles.configLabel}>Rule</Text>
                  <View style={styles.configRow}>
                    {(['double_progression', 'linear'] as const).map(rule => (
                      <TouchableOpacity key={rule} style={[styles.configChip, progressionConfig.progressionRule === rule && styles.configChipActive]}
                        onPress={() => setProgressionConfig({ ...progressionConfig, progressionRule: rule })}>
                        <Text style={styles.configChipText}>{rule === 'double_progression' ? 'Double Progression' : 'Linear'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.configInputRow}>
                    <View style={styles.configInputGroup}>
                      <Text style={styles.configLabel}>Rep Min</Text>
                      <TextInput style={styles.configInput} value={String(progressionConfig.repRangeMin)} keyboardType="number-pad"
                        onChangeText={v => setProgressionConfig({ ...progressionConfig, repRangeMin: parseInt(v) || 0 })} />
                    </View>
                    <View style={styles.configInputGroup}>
                      <Text style={styles.configLabel}>Rep Max</Text>
                      <TextInput style={styles.configInput} value={String(progressionConfig.repRangeMax)} keyboardType="number-pad"
                        onChangeText={v => setProgressionConfig({ ...progressionConfig, repRangeMax: parseInt(v) || 0 })} />
                    </View>
                    <View style={styles.configInputGroup}>
                      <Text style={styles.configLabel}>Increment</Text>
                      <TextInput style={styles.configInput} value={String(progressionConfig.weightIncrement)} keyboardType="decimal-pad"
                        onChangeText={v => setProgressionConfig({ ...progressionConfig, weightIncrement: parseFloat(v) || 0 })} />
                    </View>
                  </View>

                  <Text style={styles.configLabel}>Sensitivity</Text>
                  <View style={styles.configRow}>
                    {(['aggressive', 'moderate', 'conservative'] as const).map(s => (
                      <TouchableOpacity key={s} style={[styles.configChip, progressionConfig.sensitivity === s && styles.configChipActive]}
                        onPress={() => setProgressionConfig({ ...progressionConfig, sensitivity: s })}>
                        <Text style={styles.configChipText}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
            <View style={styles.detailButtons}>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={openEditExercise}>
                <Text style={styles.buttonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.cancelButton, { flex: 1 }]} onPress={closeExerciseDetail}>
                <Text style={styles.buttonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Exercise Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>Add New Exercise</Text>
              <TextInput
                style={styles.input}
                placeholder="Name"
                placeholderTextColor="#6B7280"
                value={newExercise.name}
                onChangeText={text => setNewExercise({ ...newExercise, name: text })}
              />

              <Text style={styles.filterLabel}>Body Part (select one or more)</Text>
              <View style={styles.chipWrap}>
                {bodyParts.map(bp => (
                  <TouchableOpacity
                    key={bp}
                    style={[styles.chip, newExercise.bodyParts.includes(bp) && styles.chipActive]}
                    onPress={() => toggleNewBodyPart(bp)}
                  >
                    <Text style={[styles.chipText, newExercise.bodyParts.includes(bp) && styles.chipTextActive]}>{bp}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterLabel}>Equipment</Text>
              <View style={styles.chipWrap}>
                {equipmentTypes.map(eq => (
                  <TouchableOpacity
                    key={eq}
                    style={[styles.chip, newExercise.equipment === eq && styles.chipActive]}
                    onPress={() => setNewExercise({ ...newExercise, equipment: eq })}
                  >
                    <Text style={[styles.chipText, newExercise.equipment === eq && styles.chipTextActive]}>{eq}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Instructions"
                placeholderTextColor="#6B7280"
                value={newExercise.instructions}
                onChangeText={text => setNewExercise({ ...newExercise, instructions: text })}
                multiline
              />
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, { flex: 1 }, (!newExercise.name.trim() || newExercise.bodyParts.length === 0 || !newExercise.equipment) && styles.buttonDisabled]}
                onPress={handleAddExercise}
              >
                <Text style={styles.buttonText}>Add Exercise</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton, { flex: 1 }]}
                onPress={() => { setShowAddModal(false); setNewExercise({ name: '', bodyParts: [], equipment: '', instructions: '' }); }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Exercise Modal */}
      <Modal visible={!!editExercise} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>Edit Exercise</Text>
              {editExercise && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Name"
                    placeholderTextColor="#6B7280"
                    value={editExercise.name}
                    onChangeText={text => setEditExercise({ ...editExercise, name: text })}
                  />

                  <Text style={styles.filterLabel}>Body Part (select one or more)</Text>
                  <View style={styles.chipWrap}>
                    {bodyParts.map(bp => (
                      <TouchableOpacity
                        key={bp}
                        style={[styles.chip, editExercise.bodyParts.includes(bp) && styles.chipActive]}
                        onPress={() => toggleEditBodyPart(bp)}
                      >
                        <Text style={[styles.chipText, editExercise.bodyParts.includes(bp) && styles.chipTextActive]}>{bp}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.filterLabel}>Equipment</Text>
                  <View style={styles.chipWrap}>
                    {equipmentTypes.map(eq => (
                      <TouchableOpacity
                        key={eq}
                        style={[styles.chip, editExercise.equipment === eq && styles.chipActive]}
                        onPress={() => setEditExercise({ ...editExercise, equipment: eq })}
                      >
                        <Text style={[styles.chipText, editExercise.equipment === eq && styles.chipTextActive]}>{eq}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Instructions"
                    placeholderTextColor="#6B7280"
                    value={editExercise.instructions}
                    onChangeText={text => setEditExercise({ ...editExercise, instructions: text })}
                    multiline
                  />
                </>
              )}
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, { flex: 1 }, (!editExercise?.name.trim() || !editExercise?.bodyParts.length || !editExercise?.equipment) && styles.buttonDisabled]}
                onPress={handleSaveEditExercise}
              >
                <Text style={styles.buttonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton, { flex: 1 }]}
                onPress={() => setEditExercise(null)}
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
  container: { flex: 1, backgroundColor: '#111827', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  button: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  cancelButton: { backgroundColor: '#374151' },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  searchInput: { flex: 1, backgroundColor: '#374151', color: '#fff', padding: 12, borderRadius: 8 },
  filterButton: { backgroundColor: '#374151', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  filterButtonActive: { backgroundColor: '#3B82F6' },
  filterButtonText: { color: '#fff', fontWeight: '600' },
  resultCount: { color: '#9CA3AF', marginBottom: 12 },
  scrollView: { flex: 1 },
  card: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  cardMeta: { flexDirection: 'row', gap: 8, marginTop: 8 },
  cardMetaText: { fontSize: 14, color: '#9CA3AF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#1F2937', padding: 24, borderRadius: 12, maxHeight: '80%' },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  modalMeta: { marginBottom: 16 },
  modalMetaText: { color: '#9CA3AF', marginBottom: 4 },
  instructionsBox: { backgroundColor: '#111827', padding: 16, borderRadius: 8, marginBottom: 16 },
  instructionsTitle: { fontWeight: '600', color: '#fff', marginBottom: 8 },
  instructionsText: { color: '#D1D5DB' },
  input: { backgroundColor: '#374151', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 12 },
  textArea: { height: 80, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 8 },
  filterLabel: { color: '#9CA3AF', marginBottom: 8, fontWeight: '600' },
  filterChips: { marginBottom: 16, maxHeight: 40 },
  chip: { backgroundColor: '#374151', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, marginRight: 8 },
  chipActive: { backgroundColor: '#3B82F6' },
  chipText: { color: '#9CA3AF', fontSize: 14 },
  chipTextActive: { color: '#fff' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  buttonDisabled: { opacity: 0.4 },
  detailButtons: { flexDirection: 'row', gap: 8 },
  progressionSection: { backgroundColor: '#111827', padding: 14, borderRadius: 8, marginBottom: 16 },
  progressionTitle: { fontSize: 16, fontWeight: 'bold', color: '#F59E0B', marginBottom: 12 },
  configLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  configRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  configChip: { backgroundColor: '#374151', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  configChipActive: { backgroundColor: '#3B82F6' },
  configChipText: { color: '#fff', fontSize: 13 },
  configInputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  configInputGroup: { flex: 1 },
  configInput: { backgroundColor: '#374151', color: '#fff', padding: 10, borderRadius: 6, fontSize: 16, textAlign: 'center' },
});
