import { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import db from '@/lib/database';

interface DayWorkout {
  date: string;
  categories: string[];
  templateName: string | null;
  duration: number;
  totalSets: number;
  totalVolume: number;
}

// Map specific body_part values from exercises.json to broad categories
const BODY_PART_CATEGORY: Record<string, string> = {
  'Chest': 'Chest',
  'Lats': 'Back',
  'Back (Lower)': 'Back',
  'Trapezius': 'Shoulders',
  'Deltoids': 'Shoulders',
  'Quadriceps': 'Legs',
  'Hamstrings': 'Legs',
  'Gluteals': 'Legs',
  'Calves': 'Legs',
  'Adductors': 'Legs',
  'Abductors': 'Legs',
  'Biceps': 'Arms',
  'Triceps': 'Arms',
  'Forearms': 'Arms',
  'Abdominals (Lower)': 'Core',
  'Cardio': 'Cardio',
  'Other': 'Other',
};

const BODY_PART_COLORS: Record<string, string> = {
  'Chest': '#EF4444',
  'Back': '#3B82F6',
  'Shoulders': '#F59E0B',
  'Legs': '#10B981',
  'Arms': '#8B5CF6',
  'Core': '#EC4899',
  'Cardio': '#06B6D4',
  'Other': '#6B7280',
};

function getBodyPartColor(bodyPart: string): string {
  const category = BODY_PART_CATEGORY[bodyPart] || 'Other';
  return BODY_PART_COLORS[category] || BODY_PART_COLORS['Other'];
}

export default function CalendarScreen() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart); // 0=Sun

  // Load workout data for the month
  const monthStr = format(currentMonth, 'yyyy-MM');
  const workoutMap = useMemo(() => {
    const rows = db.getAllSync<{ date: string; templateName: string | null; duration: number; totalSets: number; totalVolume: number }>(`
      SELECT wl.date,
             wt.name as templateName,
             wl.duration,
             (SELECT COUNT(*) FROM set_logs sl3 WHERE sl3.workout_log_id = wl.id) as totalSets,
             (SELECT COALESCE(SUM(sl4.reps * sl4.weight), 0) FROM set_logs sl4 WHERE sl4.workout_log_id = wl.id) as totalVolume
      FROM workout_logs wl
      LEFT JOIN workout_templates wt ON wl.template_id = wt.id
      WHERE wl.date LIKE ? || '%'
      ORDER BY wl.date
    `, [monthStr]);

    // Get body parts per date with total reps for ordering
    const bodyPartRows = db.getAllSync<{ date: string; bodyPart: string; totalReps: number }>(`
      SELECT wl.date, e.body_part as bodyPart, SUM(sl.reps) as totalReps
      FROM set_logs sl
      JOIN exercises e ON sl.exercise_id = e.id
      JOIN workout_logs wl ON sl.workout_log_id = wl.id
      WHERE wl.date LIKE ? || '%'
      GROUP BY wl.date, e.body_part
    `, [monthStr]);

    // Group by date → category with summed reps, then sort descending
    const dateCats = new Map<string, Map<string, number>>();
    for (const r of bodyPartRows) {
      const cat = BODY_PART_CATEGORY[r.bodyPart] || 'Other';
      if (!dateCats.has(r.date)) dateCats.set(r.date, new Map());
      const catMap = dateCats.get(r.date)!;
      catMap.set(cat, (catMap.get(cat) || 0) + r.totalReps);
    }

    const map = new Map<string, DayWorkout>();
    for (const w of rows) {
      map.set(w.date, {
        ...w,
        categories: dateCats.has(w.date)
          ? Array.from(dateCats.get(w.date)!.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([cat]) => cat)
          : ['Other'],
      });
    }
    return map;
  }, [monthStr]);

  const selectedWorkout = selectedDate ? workoutMap.get(selectedDate) : null;

  // Get exercises for selected date
  const selectedExercises = selectedDate ? db.getAllSync<{ name: string; bodyPart: string; sets: number; volume: number }>(`
    SELECT e.name, e.body_part as bodyPart, COUNT(*) as sets, SUM(sl.reps * sl.weight) as volume
    FROM set_logs sl
    JOIN exercises e ON sl.exercise_id = e.id
    JOIN workout_logs wl ON sl.workout_log_id = wl.id
    WHERE wl.date = ?
    GROUP BY e.id
    ORDER BY sl.id
  `, [selectedDate]) : [];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <Text style={styles.navArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{format(currentMonth, 'MMMM yyyy')}</Text>
          <TouchableOpacity onPress={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <Text style={styles.navArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.weekHeader}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <Text key={d} style={styles.weekDay}>{d}</Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {Array.from({ length: startDayOfWeek }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.dayCell} />
          ))}
          {daysInMonth.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const workout = workoutMap.get(dateStr);
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
            return (
              <TouchableOpacity
                key={dateStr}
                style={[styles.dayCell, isSelected && styles.dayCellSelected, isToday && styles.dayCellToday]}
                onPress={() => setSelectedDate(workout ? dateStr : null)}
              >
                <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>{format(day, 'd')}</Text>
                {workout && (
                  <View style={styles.dotsRow}>
                    {workout.categories.map((cat) => (
                      <View key={cat} style={[styles.workoutDot, { backgroundColor: BODY_PART_COLORS[cat] || BODY_PART_COLORS['Other'] }]} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedWorkout && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryDate}>{selectedDate}</Text>
            {selectedWorkout.templateName && <Text style={styles.summaryTemplate}>{selectedWorkout.templateName}</Text>}
            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{selectedWorkout.duration}m</Text>
                <Text style={styles.summaryStatLabel}>Duration</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{selectedWorkout.totalSets}</Text>
                <Text style={styles.summaryStatLabel}>Sets</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{Math.round(selectedWorkout.totalVolume)}</Text>
                <Text style={styles.summaryStatLabel}>Volume</Text>
              </View>
            </View>
            {selectedExercises.map((ex, i) => (
              <View key={i} style={styles.exRow}>
                <View style={[styles.exDot, { backgroundColor: getBodyPartColor(ex.bodyPart) }]} />
                <Text style={styles.exName}>{ex.name}</Text>
                <Text style={styles.exDetail}>{ex.sets}s • {Math.round(ex.volume)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Legend */}
        <View style={styles.legend}>
          {Object.entries(BODY_PART_COLORS).filter(([k]) => k !== 'Other').map(([category, color]) => (
            <View key={category} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{category}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  scrollView: { flex: 1, padding: 16 },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  navArrow: { fontSize: 32, color: '#3B82F6', paddingHorizontal: 16 },
  monthTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  weekHeader: { flexDirection: 'row', marginBottom: 8 },
  weekDay: { flex: 1, textAlign: 'center', color: '#6B7280', fontSize: 12, fontWeight: '600' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dayCellSelected: { backgroundColor: '#1E3A8A', borderRadius: 8 },
  dayCellToday: { borderWidth: 1, borderColor: '#3B82F6', borderRadius: 8 },
  dayNumber: { color: '#D1D5DB', fontSize: 14 },
  dayNumberSelected: { color: '#fff', fontWeight: 'bold' },
  workoutDot: { width: 5, height: 5, borderRadius: 2.5 },
  dotsRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  summaryCard: { backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginTop: 16 },
  summaryDate: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  summaryTemplate: { fontSize: 14, color: '#3B82F6', marginBottom: 12 },
  summaryStats: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  summaryStat: { alignItems: 'center' },
  summaryStatValue: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  summaryStatLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  exRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  exDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  exName: { flex: 1, color: '#D1D5DB', fontSize: 14 },
  exDetail: { color: '#6B7280', fontSize: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16, marginBottom: 32 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  legendText: { color: '#9CA3AF', fontSize: 11 },
});
