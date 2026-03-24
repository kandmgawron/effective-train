import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import db from '@/lib/database';
import { GymProfile } from '@/types';
import { useTheme } from '@/lib/theme';
import Icon from '@/components/Icon';
import BackToTop from '@/components/BackToTop';

export default function GymProfiles() {
  const [profiles, setProfiles] = useState<GymProfile[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const [scrollY, setScrollY] = useState(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => { setScrollY(e.nativeEvent.contentOffset.y); };
  const [showModal, setShowModal] = useState(false);
  const [newProfile, setNewProfile] = useState({
    name: '',
    equipment: [] as string[],
    isTravelMode: false
  });
  const [equipmentInput, setEquipmentInput] = useState('');
  const [unitPref, setUnitPref] = useState('kg');
  const [experience, setExperience] = useState('intermediate');
  const [bodyweightInput, setBodyweightInput] = useState('');
  const [bodyweightHistory, setBodyweightHistory] = useState<{ id: number; date: string; weight: number }[]>([]);
  const [latestBodyweight, setLatestBodyweight] = useState<number | null>(null);
  const { mode, setMode, colors } = useTheme();
  const router = useRouter();

  useEffect(() => {
    loadProfiles();
    loadSettings();
    loadBodyweight();
  }, []);

  const loadSettings = () => {
    const unit = db.getFirstSync<{ value: string }>("SELECT value FROM user_settings WHERE key = 'unit_preference'");
    if (unit) setUnitPref(unit.value); else db.runSync("INSERT OR IGNORE INTO user_settings (key, value) VALUES ('unit_preference', 'kg')");
    const exp = db.getFirstSync<{ value: string }>("SELECT value FROM user_settings WHERE key = 'training_experience'");
    if (exp) setExperience(exp.value); else db.runSync("INSERT OR IGNORE INTO user_settings (key, value) VALUES ('training_experience', 'intermediate')");
  };

  const updateSetting = (key: string, value: string) => {
    db.runSync("INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)", [key, value]);
    if (key === 'unit_preference') setUnitPref(value);
    if (key === 'training_experience') setExperience(value);
  };

  const loadBodyweight = () => {
    const history = db.getAllSync<{ id: number; date: string; weight: number }>(
      'SELECT id, date, weight FROM bodyweight_log ORDER BY date DESC LIMIT 10'
    );
    setBodyweightHistory(history);
    if (history.length > 0) setLatestBodyweight(history[0].weight);
  };

  const logBodyweight = () => {
    const w = parseFloat(bodyweightInput);
    if (!w || w <= 0) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    // Upsert: replace if same date exists
    db.runSync('DELETE FROM bodyweight_log WHERE date = ?', [today]);
    db.runSync('INSERT INTO bodyweight_log (date, weight) VALUES (?, ?)', [today, w]);
    setBodyweightInput('');
    loadBodyweight();
  };

  const loadProfiles = () => {
    const result = db.getAllSync<any>(
      'SELECT id, name, equipment, is_active as isActive, is_travel_mode as isTravelMode FROM gym_profiles'
    );
    setProfiles(result.map(p => ({ ...p, equipment: JSON.parse(p.equipment) })));
  };

  const handleAddEquipment = () => {
    if (equipmentInput.trim()) {
      setNewProfile({
        ...newProfile,
        equipment: [...newProfile.equipment, equipmentInput.trim()]
      });
      setEquipmentInput('');
    }
  };

  const handleCreateProfile = () => {
    db.runSync(
      'INSERT INTO gym_profiles (name, equipment, is_active, is_travel_mode) VALUES (?, ?, 0, ?)',
      [newProfile.name, JSON.stringify(newProfile.equipment), newProfile.isTravelMode ? 1 : 0]
    );
    setShowModal(false);
    setNewProfile({ name: '', equipment: [], isTravelMode: false });
    loadProfiles();
  };

  const handleActivate = (id: number) => {
    db.runSync('UPDATE gym_profiles SET is_active = 0');
    db.runSync('UPDATE gym_profiles SET is_active = 1 WHERE id = ?', [id]);
    loadProfiles();
  };

  const handleDelete = (id: number) => {
    db.runSync('DELETE FROM gym_profiles WHERE id = ?', [id]);
    loadProfiles();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings & Gym</Text>
        <TouchableOpacity style={styles.button} onPress={() => setShowModal(true)}>
          <Text style={styles.buttonText}>Add Gym</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={styles.scrollView} onScroll={onScroll} scrollEventThrottle={100}>
        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <Text style={styles.settingLabel}>Weight Unit</Text>
          <View style={styles.settingRow}>
            {['kg', 'lbs'].map(u => (
              <TouchableOpacity key={u} style={[styles.settingChip, unitPref === u && styles.settingChipActive]} onPress={() => updateSetting('unit_preference', u)}>
                <Text style={[styles.settingChipText, unitPref === u && styles.settingChipTextActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.settingLabel}>Training Experience</Text>
          <View style={styles.settingRow}>
            {['beginner', 'intermediate', 'advanced'].map(e => (
              <TouchableOpacity key={e} style={[styles.settingChip, experience === e && styles.settingChipActive]} onPress={() => updateSetting('training_experience', e)}>
                <Text style={[styles.settingChipText, experience === e && styles.settingChipTextActive]}>{e.charAt(0).toUpperCase() + e.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.settingLabel}>Theme</Text>
          <View style={styles.settingRow}>
            {(['dark', 'light'] as const).map(t => (
              <TouchableOpacity key={t} style={[styles.settingChip, mode === t && styles.settingChipActive]} onPress={() => setMode(t)}>
                <Text style={[styles.settingChipText, mode === t && styles.settingChipTextActive]}>{t === 'dark' ? 'Dark' : 'Light'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Bodyweight</Text>
          {latestBodyweight && (
            <Text style={styles.latestBw}>Current: {latestBodyweight} {unitPref}</Text>
          )}
          <View style={styles.bwInputRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder={`Weight (${unitPref})`}
              placeholderTextColor="#6B7280"
              value={bodyweightInput}
              onChangeText={setBodyweightInput}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={styles.button} onPress={logBodyweight}>
              <Text style={styles.buttonText}>Log</Text>
            </TouchableOpacity>
          </View>
          {bodyweightHistory.length > 0 && (
            <View style={styles.bwHistory}>
              {bodyweightHistory.slice(0, 5).map(bw => (
                <View key={bw.id} style={styles.bwRow}>
                  <Text style={styles.bwDate}>{bw.date}</Text>
                  <Text style={styles.bwWeight}>{bw.weight} {unitPref}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.navLink} onPress={() => router.push('/exercises')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="search" size={18} color="#fff" />
            <Text style={styles.navLinkText}>Exercise Library</Text>
          </View>
          <Text style={styles.navLinkSubtext}>Browse and manage exercises</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Gym Profiles</Text>
        {profiles.map(profile => (
          <View key={profile.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>{profile.name}</Text>
                {profile.isTravelMode && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Travel Mode</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardActions}>
                {!profile.isActive ? (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.activateButton]}
                    onPress={() => handleActivate(profile.id)}
                  >
                    <Text style={styles.buttonText}>Activate</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.actionButton, styles.activeButton]}>
                    <Text style={styles.buttonText}>Active</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDelete(profile.id)}
                >
                  <Text style={styles.buttonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.equipmentList}>
              {profile.equipment.map((eq: string) => (
                <View key={eq} style={styles.equipmentTag}>
                  <Text style={styles.equipmentText}>{eq}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Gym Profile</Text>
            <TextInput
              style={styles.input}
              placeholder="Profile Name"
              placeholderTextColor="#6B7280"
              value={newProfile.name}
              onChangeText={text => setNewProfile({ ...newProfile, name: text })}
            />
            <View style={styles.equipmentInput}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Equipment"
                placeholderTextColor="#6B7280"
                value={equipmentInput}
                onChangeText={setEquipmentInput}
              />
              <TouchableOpacity style={styles.addButton} onPress={handleAddEquipment}>
                <Text style={styles.buttonText}>Add</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.equipmentList}>
              {newProfile.equipment.map(eq => (
                <View key={eq} style={styles.equipmentTag}>
                  <Text style={styles.equipmentText}>{eq}</Text>
                  <TouchableOpacity
                    onPress={() => setNewProfile({
                      ...newProfile,
                      equipment: newProfile.equipment.filter(e => e !== eq)
                    })}
                  >
                    <Text style={styles.removeText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => setNewProfile({ ...newProfile, isTravelMode: !newProfile.isTravelMode })}
            >
              <View style={[styles.checkboxBox, newProfile.isTravelMode && styles.checkboxChecked]} />
              <Text style={styles.checkboxLabel}>Travel Mode</Text>
            </TouchableOpacity>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={handleCreateProfile}>
                <Text style={styles.buttonText}>Create</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton, { flex: 1 }]}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  button: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  infoBox: { backgroundColor: '#1E3A8A', borderColor: '#3B82F6', borderWidth: 1, padding: 12, borderRadius: 8, marginBottom: 16 },
  infoText: { color: '#D1D5DB', fontSize: 13 },
  scrollView: { flex: 1 },
  card: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  badge: { backgroundColor: '#EA580C', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  badgeText: { color: '#fff', fontSize: 11 },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  activateButton: { backgroundColor: '#3B82F6' },
  activeButton: { backgroundColor: '#3B82F6' },
  deleteButton: { backgroundColor: '#EF4444' },
  equipmentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  equipmentTag: { backgroundColor: '#374151', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  equipmentText: { color: '#fff', fontSize: 13 },
  removeText: { color: '#EF4444', fontSize: 18, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#1F2937', padding: 24, borderRadius: 12 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  input: { backgroundColor: '#374151', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 12 },
  equipmentInput: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addButton: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  checkbox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  checkboxBox: { width: 20, height: 20, borderWidth: 2, borderColor: '#6B7280', borderRadius: 4 },
  checkboxChecked: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  checkboxLabel: { color: '#D1D5DB', fontSize: 14 },
  modalButtons: { flexDirection: 'row', gap: 8 },
  cancelButton: { backgroundColor: '#374151' },
  settingsSection: { backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  settingLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  settingRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  settingChip: { backgroundColor: '#374151', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  settingChipActive: { backgroundColor: '#3B82F6' },
  settingChipText: { color: '#9CA3AF', fontSize: 14 },
  settingChipTextActive: { color: '#fff' },
  latestBw: { color: '#3B82F6', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  bwInputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  bwHistory: { marginTop: 4 },
  bwRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#374151' },
  bwDate: { color: '#9CA3AF', fontSize: 13 },
  bwWeight: { color: '#fff', fontSize: 14, fontWeight: '600' },
  navLink: { backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 16 },
  navLinkText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  navLinkSubtext: { color: '#9CA3AF', fontSize: 13, marginTop: 4 },
});
