import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, StyleSheet, Alert, Share, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
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
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [newProfile, setNewProfile] = useState({
    name: '',
    equipment: [] as string[],
    isTravelMode: false
  });
  const [equipmentInput, setEquipmentInput] = useState('');
  const [availableEquipment, setAvailableEquipment] = useState<string[]>([]);
  const [showCustomEquipInput, setShowCustomEquipInput] = useState(false);
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
    // Load all distinct specific equipment from exercises
    const equip = db.getAllSync<{ se: string }>(
      "SELECT DISTINCT specific_equipment as se FROM exercises WHERE specific_equipment IS NOT NULL AND specific_equipment != '' ORDER BY specific_equipment"
    );
    setAvailableEquipment(equip.map(e => e.se));
  };

  const handleAddEquipment = () => {
    if (equipmentInput.trim() && !newProfile.equipment.includes(equipmentInput.trim())) {
      setNewProfile({
        ...newProfile,
        equipment: [...newProfile.equipment, equipmentInput.trim()]
      });
      // Also add to available list if new
      if (!availableEquipment.includes(equipmentInput.trim())) {
        setAvailableEquipment(prev => [...prev, equipmentInput.trim()].sort());
      }
      setEquipmentInput('');
      setShowCustomEquipInput(false);
    }
  };

  const toggleEquipment = (eq: string) => {
    setNewProfile(prev => ({
      ...prev,
      equipment: prev.equipment.includes(eq)
        ? prev.equipment.filter(e => e !== eq)
        : [...prev.equipment, eq]
    }));
  };

  const handleCreateProfile = () => {
    if (editingProfileId) {
      // Update existing profile
      db.runSync(
        'UPDATE gym_profiles SET name = ?, equipment = ?, is_travel_mode = ? WHERE id = ?',
        [newProfile.name, JSON.stringify(newProfile.equipment), newProfile.isTravelMode ? 1 : 0, editingProfileId]
      );
    } else {
      // Auto-activate if this is the first profile
      const count = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM gym_profiles');
      const isFirst = !count || count.c === 0;
      db.runSync(
        'INSERT INTO gym_profiles (name, equipment, is_active, is_travel_mode) VALUES (?, ?, ?, ?)',
        [newProfile.name, JSON.stringify(newProfile.equipment), isFirst ? 1 : 0, newProfile.isTravelMode ? 1 : 0]
      );
    }
    setShowModal(false);
    setEditingProfileId(null);
    setNewProfile({ name: '', equipment: [], isTravelMode: false });
    loadProfiles();
  };

  const openEditProfile = (profile: GymProfile) => {
    setEditingProfileId(profile.id);
    setNewProfile({ name: profile.name, equipment: [...profile.equipment], isTravelMode: profile.isTravelMode });
    setShowModal(true);
  };

  const handleActivate = (id: number) => {
    db.runSync('UPDATE gym_profiles SET is_active = 0');
    db.runSync('UPDATE gym_profiles SET is_active = 1 WHERE id = ?', [id]);
    loadProfiles();
  };

  const handleDelete = (id: number) => {
    if (profiles.length <= 1) {
      Alert.alert('Cannot Delete', 'You must have at least one gym profile.');
      return;
    }
    const wasActive = profiles.find(p => p.id === id)?.isActive;
    db.runSync('DELETE FROM gym_profiles WHERE id = ?', [id]);
    // If we deleted the active profile, activate the first remaining one
    if (wasActive) {
      db.runSync('UPDATE gym_profiles SET is_active = 1 WHERE id = (SELECT id FROM gym_profiles LIMIT 1)');
    }
    loadProfiles();
  };

  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');

  const handleExportData = () => {
    Alert.alert('Export Format', 'Choose export format', [
      { text: 'JSON (Full Backup)', onPress: exportJSON },
      { text: 'CSV (Workout Logs)', onPress: exportCSV },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const exportJSON = () => {
    const templates = db.getAllSync<any>('SELECT * FROM workout_templates');
    const templateExercises = db.getAllSync<any>('SELECT * FROM template_exercises');
    const workoutLogs = db.getAllSync<any>('SELECT * FROM workout_logs WHERE id IN (SELECT DISTINCT workout_log_id FROM set_logs)');
    const setLogs = db.getAllSync<any>('SELECT * FROM set_logs WHERE workout_log_id IN (SELECT DISTINCT workout_log_id FROM set_logs)');
    const gymProfilesData = db.getAllSync<any>('SELECT * FROM gym_profiles');
    const personalRecords = db.getAllSync<any>('SELECT * FROM personal_records WHERE workout_log_id IN (SELECT id FROM workout_logs WHERE id IN (SELECT DISTINCT workout_log_id FROM set_logs))');
    const bodyweightLog = db.getAllSync<any>('SELECT * FROM bodyweight_log');
    const userSettings = db.getAllSync<any>("SELECT * FROM user_settings WHERE key NOT LIKE 'rec_regen%' AND key NOT LIKE '%_fix_%' AND key NOT LIKE 'orphan_%' AND key NOT LIKE 'freestyle_%' AND key NOT LIKE 'specific_%' AND key NOT LIKE 'body_part_%' AND key NOT LIKE 'desc_fix_%' AND key NOT LIKE 'gym_equip_%'");
    const customExercises = db.getAllSync<any>('SELECT * FROM exercises WHERE is_custom = 1');
    const allExerciseNames = db.getAllSync<any>('SELECT id, name FROM exercises');

    Share.share({
      message: JSON.stringify({
        version: 1,
        exportDate: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
        templates, templateExercises, workoutLogs, setLogs,
        gymProfiles: gymProfilesData, personalRecords, bodyweightLog, userSettings, customExercises,
        exercises: allExerciseNames,
      }),
      title: 'GymTracker Backup',
    });
  };

  const exportCSV = () => {
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
    rows.forEach((row: any) => {
      csv += `${row.date},${row.workout_name || ''},${row.exercise_name},${row.set_number},${row.reps},${row.weight},${row.is_drop_set ? 'Yes' : 'No'}\n`;
    });
    Share.share({ message: csv, title: 'GymTracker Workouts' });
  };

  const handleImportData = () => {
    const text = importText.trim();
    if (!text) return;

    // Detect format: JSON starts with { or [, otherwise CSV
    if (text.startsWith('{')) {
      importJSON(text);
    } else {
      importCSV(text);
    }
  };

  const importCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      Alert.alert('Invalid CSV', 'The CSV file appears to be empty.');
      return;
    }

    // Parse header
    const header = lines[0].toLowerCase();
    const hasHeader = header.includes('date') && header.includes('exercise');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    Alert.alert('Import CSV', `Found ${dataLines.length} rows of workout data. Import?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Import', onPress: () => {
        // Group by date+workout to create workout logs
        const workouts = new Map<string, { date: string; workoutName: string; sets: { exercise: string; setNumber: number; reps: number; weight: number; dropSet: boolean }[] }>();

        for (const line of dataLines) {
          // Handle quoted CSV fields
          const parts = line.match(/(".*?"|[^,]+)/g)?.map(s => s.replace(/^"|"$/g, '').trim()) || [];
          if (parts.length < 5) continue;

          const date = parts[0];
          const workoutName = parts[1] || '';
          const exercise = parts[2];
          const setNumber = parseInt(parts[3]) || 1;
          const reps = parseInt(parts[4]) || 0;
          const weight = parseFloat(parts[5]) || 0;
          const dropSet = (parts[6] || '').toLowerCase() === 'yes';

          const key = `${date}_${workoutName}`;
          if (!workouts.has(key)) {
            workouts.set(key, { date, workoutName, sets: [] });
          }
          workouts.get(key)!.sets.push({ exercise, setNumber, reps, weight, dropSet });
        }

        // Helper to find or create exercise
        const getExerciseId = (name: string): number => {
          const row = db.getFirstSync<{ id: number }>('SELECT id FROM exercises WHERE LOWER(name) = LOWER(?)', [name]);
          if (row) return row.id;
          const res = db.runSync(
            'INSERT INTO exercises (name, body_part, equipment, instructions, is_custom) VALUES (?, ?, ?, ?, 1)',
            [name, 'Other', 'Other', '']
          );
          return Number(res.lastInsertRowId);
        };

        let importedWorkouts = 0;
        const templateExercises = new Map<string, Set<string>>();

        for (const [, workout] of workouts) {
          // Check for duplicate (same date + same exercises)
          const existing = db.getFirstSync<{ id: number }>(
            'SELECT id FROM workout_logs WHERE date = ?', [workout.date]
          );

          let templateId: number | null = null;
          if (workout.workoutName) {
            const tmpl = db.getFirstSync<{ id: number }>('SELECT id FROM workout_templates WHERE name = ?', [workout.workoutName]);
            templateId = tmpl?.id ?? null;
            // Track exercises per workout name for template creation
            if (!templateExercises.has(workout.workoutName)) {
              templateExercises.set(workout.workoutName, new Set());
            }
            for (const s of workout.sets) {
              templateExercises.get(workout.workoutName)!.add(s.exercise);
            }
          }

          const wRes = db.runSync(
            'INSERT INTO workout_logs (template_id, date, duration) VALUES (?, ?, 0)',
            [templateId, workout.date]
          );
          const wId = Number(wRes.lastInsertRowId);

          for (const s of workout.sets) {
            const exId = getExerciseId(s.exercise);
            db.runSync(
              'INSERT INTO set_logs (workout_log_id, exercise_id, set_number, reps, weight, is_drop_set) VALUES (?, ?, ?, ?, ?, ?)',
              [wId, exId, s.setNumber, s.reps, s.weight, s.dropSet ? 1 : 0]
            );
          }
          importedWorkouts++;
        }

        // Auto-create templates from workout names
        let templatesCreated = 0;
        for (const [name, exerciseNames] of templateExercises) {
          const exists = db.getFirstSync<{ id: number }>('SELECT id FROM workout_templates WHERE name = ?', [name]);
          if (exists) {
            // Link workouts to existing template
            db.runSync('UPDATE workout_logs SET template_id = ? WHERE template_id IS NULL AND date IN (SELECT date FROM workout_logs)', [exists.id]);
            continue;
          }

          const tRes = db.runSync(
            'INSERT INTO workout_templates (name, estimated_duration) VALUES (?, ?)',
            [name, exerciseNames.size * 4 * 120] // rough estimate
          );
          const tId = Number(tRes.lastInsertRowId);

          let order = 0;
          for (const exName of exerciseNames) {
            const exId = getExerciseId(exName);
            db.runSync(
              'INSERT INTO template_exercises (template_id, exercise_id, sets, target_reps, rest_time, exercise_order) VALUES (?, ?, 3, 10, 90, ?)',
              [tId, exId, order++]
            );
          }

          // Link workouts to new template
          db.runSync(
            'UPDATE workout_logs SET template_id = ? WHERE template_id IS NULL',
            [tId]
          );
          templatesCreated++;
        }

        setShowImportModal(false);
        setImportText('');
        loadProfiles();
        Alert.alert('Done', `Imported ${importedWorkouts} workouts.${templatesCreated > 0 ? ` Created ${templatesCreated} template(s).` : ''}`);
      }},
    ]);
  };

  const importJSON = (text: string) => {
    try {
      const backup = JSON.parse(text);
      if (!backup.version) {
        Alert.alert('Invalid Backup', 'This doesn\'t look like a valid GymTracker backup.');
        return;
      }

      Alert.alert('Import Data', 'This will add the backup data to your app. Existing data will not be deleted. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import', onPress: () => {
          // Import custom exercises
          if (backup.customExercises) {
            for (const ex of backup.customExercises) {
              const exists = db.getFirstSync<{ id: number }>('SELECT id FROM exercises WHERE LOWER(name) = LOWER(?)', [ex.name]);
              if (!exists) {
                db.runSync(
                  'INSERT INTO exercises (name, body_part, equipment, instructions, is_custom, specific_equipment) VALUES (?, ?, ?, ?, 1, ?)',
                  [ex.name, ex.body_part, ex.equipment, ex.instructions || '', ex.specific_equipment || '']
                );
              }
            }
          }

          // Import templates
          const templateIdMap: Record<number, number> = {};
          if (backup.templates) {
            for (const t of backup.templates) {
              const exists = db.getFirstSync<{ id: number }>('SELECT id FROM workout_templates WHERE name = ?', [t.name]);
              if (exists) {
                templateIdMap[t.id] = exists.id;
              } else {
                const res = db.runSync(
                  'INSERT INTO workout_templates (name, estimated_duration, is_active) VALUES (?, ?, ?)',
                  [t.name, t.estimated_duration || 0, t.is_active ?? 1]
                );
                templateIdMap[t.id] = Number(res.lastInsertRowId);
              }
            }
          }

          // Import template exercises
          if (backup.templateExercises) {
            // Build exercise ID-to-name map from backup
            const backupExNames: Record<number, string> = {};
            if (backup.exercises) {
              for (const ex of backup.exercises) backupExNames[ex.id] = ex.name;
            }
            if (backup.customExercises) {
              for (const ex of backup.customExercises) backupExNames[ex.id] = ex.name;
            }

            for (const te of backup.templateExercises) {
              const newTemplateId = templateIdMap[te.template_id];
              if (!newTemplateId) continue;

              // Resolve exercise by name from backup
              const exName = backupExNames[te.exercise_id];
              let exId: number | null = null;
              if (exName) {
                const row = db.getFirstSync<{ id: number }>('SELECT id FROM exercises WHERE LOWER(name) = LOWER(?)', [exName]);
                exId = row?.id ?? null;
              }
              if (!exId) {
                // Fallback: try direct ID
                const row = db.getFirstSync<{ id: number }>('SELECT id FROM exercises WHERE id = ?', [te.exercise_id]);
                exId = row?.id ?? null;
              }
              if (!exId) continue;

              const exists = db.getFirstSync<{ id: number }>(
                'SELECT id FROM template_exercises WHERE template_id = ? AND exercise_id = ?',
                [newTemplateId, exId]
              );
              if (!exists) {
                db.runSync(
                  'INSERT INTO template_exercises (template_id, exercise_id, sets, target_reps, rest_time, exercise_order, superset_group) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  [newTemplateId, exId, te.sets, te.target_reps, te.rest_time, te.exercise_order, te.superset_group]
                );
              }
            }
          }

          // Import gym profiles
          if (backup.gymProfiles) {
            for (const gp of backup.gymProfiles) {
              const exists = db.getFirstSync<{ id: number }>('SELECT id FROM gym_profiles WHERE name = ?', [gp.name]);
              if (!exists) {
                db.runSync(
                  'INSERT INTO gym_profiles (name, equipment, is_active, is_travel_mode) VALUES (?, ?, 0, ?)',
                  [gp.name, gp.equipment, gp.is_travel_mode || 0]
                );
              }
            }
          }

          // Import workout logs and set logs
          if (backup.workoutLogs && backup.setLogs) {
            // Build a map of old exercise IDs to names from the backup's custom exercises + existing DB
            const oldExIdToName: Record<number, string> = {};
            if (backup.customExercises) {
              for (const ex of backup.customExercises) {
                oldExIdToName[ex.id] = ex.name;
              }
            }
            // Also try to get names from setLogs by looking at what exercises exist
            // We need the full exercise list from the export — check if it's included
            if (backup.exercises) {
              for (const ex of backup.exercises) {
                oldExIdToName[ex.id] = ex.name;
              }
            }

            const workoutIdMap: Record<number, number> = {};
            for (const wl of backup.workoutLogs) {
              const newTemplateId = wl.template_id ? (templateIdMap[wl.template_id] ?? null) : null;
              const res = db.runSync(
                'INSERT INTO workout_logs (template_id, date, duration) VALUES (?, ?, ?)',
                [newTemplateId, wl.date, wl.duration || 0]
              );
              workoutIdMap[wl.id] = Number(res.lastInsertRowId);
            }

            // Build exercise name cache from template_exercises in backup
            if (backup.templateExercises && !backup.exercises) {
              // Try to resolve exercise names from template exercises
              for (const te of backup.templateExercises) {
                if (!oldExIdToName[te.exercise_id]) {
                  // Look up by ID in current DB (works if IDs happen to match)
                  const ex = db.getFirstSync<{ name: string }>('SELECT name FROM exercises WHERE id = ?', [te.exercise_id]);
                  if (ex) oldExIdToName[te.exercise_id] = ex.name;
                }
              }
            }

            let importedSets = 0;
            for (const sl of backup.setLogs) {
              const newWorkoutId = workoutIdMap[sl.workout_log_id];
              if (!newWorkoutId) continue;

              // Resolve exercise: try name lookup first, fall back to direct ID
              let exId: number | null = null;
              const exName = oldExIdToName[sl.exercise_id];
              if (exName) {
                const row = db.getFirstSync<{ id: number }>('SELECT id FROM exercises WHERE LOWER(name) = LOWER(?)', [exName]);
                exId = row?.id ?? null;
              }
              if (!exId) {
                // Try direct ID match
                const row = db.getFirstSync<{ id: number }>('SELECT id FROM exercises WHERE id = ?', [sl.exercise_id]);
                exId = row?.id ?? null;
              }
              if (!exId) continue; // skip if exercise not found

              db.runSync(
                'INSERT INTO set_logs (workout_log_id, exercise_id, set_number, reps, weight, is_drop_set, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [newWorkoutId, exId, sl.set_number, sl.reps, sl.weight, sl.is_drop_set || 0, sl.notes || null]
              );
              importedSets++;
            }
          }

          // Import bodyweight log
          if (backup.bodyweightLog) {
            for (const bw of backup.bodyweightLog) {
              const exists = db.getFirstSync<{ id: number }>('SELECT id FROM bodyweight_log WHERE date = ?', [bw.date]);
              if (!exists) {
                db.runSync('INSERT INTO bodyweight_log (date, weight) VALUES (?, ?)', [bw.date, bw.weight]);
              }
            }
          }

          // Import user settings (next_weight_, next_reps_, exercise_note_, gym_variant_)
          if (backup.userSettings) {
            for (const s of backup.userSettings) {
              db.runSync('INSERT OR IGNORE INTO user_settings (key, value) VALUES (?, ?)', [s.key, s.value]);
            }
          }

          setShowImportModal(false);
          setImportText('');
          loadProfiles();
          loadBodyweight();
          Alert.alert('Done', 'Data imported successfully.');
        }},
      ]);
    } catch (e) {
      Alert.alert('Error', 'Could not parse the backup data. Make sure you pasted the full JSON.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings & Gym</Text>
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

        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Backup & Restore</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={handleExportData}>
              <Text style={styles.buttonText}>Export Data</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: '#374151' }]} onPress={() => setShowImportModal(true)}>
              <Text style={styles.buttonText}>Import Data</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <TouchableOpacity style={styles.deleteAllBtn} onPress={() => {
            Alert.alert(
              'Delete All Data',
              'This will permanently delete all your workouts, templates, gym profiles, personal records, and settings. Only the exercise library will be kept. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete Everything', style: 'destructive', onPress: () => {
                  Alert.alert('Are you sure?', 'All your data will be lost forever.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Yes, Delete', style: 'destructive', onPress: () => {
                      db.runSync('DELETE FROM set_logs');
                      db.runSync('DELETE FROM workout_logs');
                      db.runSync('DELETE FROM template_exercises');
                      db.runSync('DELETE FROM workout_templates');
                      db.runSync('DELETE FROM personal_records');
                      db.runSync('DELETE FROM progression_recommendations');
                      db.runSync('DELETE FROM exercise_progression_config');
                      db.runSync('DELETE FROM bodyweight_log');
                      db.runSync('DELETE FROM gym_profiles');
                      db.runSync('DELETE FROM user_settings');
                      db.runSync('DELETE FROM exercises WHERE is_custom = 1');
                      // Recreate default gym profile
                      db.runSync("INSERT INTO gym_profiles (name, equipment, is_active, is_travel_mode) VALUES ('My Gym', '[]', 1, 0)");
                      loadProfiles();
                      loadSettings();
                      loadBodyweight();
                      Alert.alert('Done', 'All data has been deleted.');
                    }},
                  ]);
                }},
              ]
            );
          }}>
            <Text style={styles.deleteAllBtnText}>Delete All Data</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>Gym Profiles</Text>
          <TouchableOpacity style={styles.button} onPress={() => { setEditingProfileId(null); setNewProfile({ name: '', equipment: [], isTravelMode: false }); setShowModal(true); }}>
            <Text style={styles.buttonText}>Add Gym</Text>
          </TouchableOpacity>
        </View>
        {profiles.map(profile => (
          <View key={profile.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>{profile.name}</Text>
                {!!profile.isTravelMode && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Travel Mode</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.editButton]}
                  onPress={() => openEditProfile(profile)}
                >
                  <Text style={styles.buttonText}>Edit</Text>
                </TouchableOpacity>
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
            <Text style={styles.modalTitle}>{editingProfileId ? 'Edit Gym Profile' : 'Create Gym Profile'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Profile Name"
              placeholderTextColor="#6B7280"
              value={newProfile.name}
              onChangeText={text => setNewProfile({ ...newProfile, name: text })}
            />
            <Text style={styles.equipmentSectionLabel}>Equipment Available</Text>
            <ScrollView style={styles.equipmentGrid} contentContainerStyle={styles.equipmentGridContent}>
              {availableEquipment.map(eq => {
                const selected = newProfile.equipment.includes(eq);
                return (
                  <TouchableOpacity
                    key={eq}
                    style={[styles.equipmentChip, selected && styles.equipmentChipSelected]}
                    onPress={() => toggleEquipment(eq)}
                  >
                    <Text style={[styles.equipmentChipText, selected && styles.equipmentChipTextSelected]}>{eq}</Text>
                  </TouchableOpacity>
                );
              })}
              {showCustomEquipInput ? (
                <View style={styles.customEquipRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0, paddingVertical: 8 }]}
                    placeholder="Equipment name"
                    placeholderTextColor="#6B7280"
                    value={equipmentInput}
                    onChangeText={setEquipmentInput}
                    autoFocus
                  />
                  <TouchableOpacity style={styles.addButton} onPress={handleAddEquipment}>
                    <Text style={styles.buttonText}>Add</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.equipmentChip, styles.equipmentChipAdd]}
                  onPress={() => setShowCustomEquipInput(true)}
                >
                  <Text style={styles.equipmentChipText}>+ Add Custom</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => setNewProfile({ ...newProfile, isTravelMode: !newProfile.isTravelMode })}
            >
              <View style={[styles.checkboxBox, newProfile.isTravelMode && styles.checkboxChecked]} />
              <Text style={styles.checkboxLabel}>Travel Mode</Text>
            </TouchableOpacity>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={handleCreateProfile}>
                <Text style={styles.buttonText}>{editingProfileId ? 'Save' : 'Create'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton, { flex: 1 }]}
                onPress={() => { setShowModal(false); setEditingProfileId(null); setNewProfile({ name: '', equipment: [], isTravelMode: false }); setShowCustomEquipInput(false); setEquipmentInput(''); }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showImportModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Import Data</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 12 }}>Paste JSON (full backup) or CSV (workout logs). CSV format: Date,Workout,Exercise,Set,Reps,Weight(kg),DropSet</Text>
            <TextInput
              style={[styles.input, { height: 200, textAlignVertical: 'top' }]}
              placeholder="Paste backup JSON here..."
              placeholderTextColor="#6B7280"
              value={importText}
              onChangeText={setImportText}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={handleImportData}>
                <Text style={styles.buttonText}>Import</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.cancelButton, { flex: 1 }]} onPress={() => { setShowImportModal(false); setImportText(''); }}>
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
  editButton: { backgroundColor: '#374151' },
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
  equipmentSectionLabel: { color: '#9CA3AF', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  equipmentGrid: { maxHeight: 250, marginBottom: 12 },
  equipmentGridContent: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  equipmentChip: { backgroundColor: '#374151', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#374151' },
  equipmentChipSelected: { backgroundColor: '#1E3A8A', borderColor: '#3B82F6' },
  equipmentChipAdd: { borderStyle: 'dashed', borderColor: '#6B7280' },
  equipmentChipText: { color: '#9CA3AF', fontSize: 13 },
  equipmentChipTextSelected: { color: '#fff' },
  customEquipRow: { flexDirection: 'row', gap: 8, width: '100%', marginTop: 4 },
  addButton: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  checkbox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  checkboxBox: { width: 20, height: 20, borderWidth: 2, borderColor: '#6B7280', borderRadius: 4 },
  checkboxChecked: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  checkboxLabel: { color: '#D1D5DB', fontSize: 14 },
  modalButtons: { flexDirection: 'row', gap: 8 },
  cancelButton: { backgroundColor: '#374151' },
  deleteAllBtn: { backgroundColor: '#EF4444', padding: 14, borderRadius: 10, alignItems: 'center' },
  deleteAllBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  settingsSection: { backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
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
