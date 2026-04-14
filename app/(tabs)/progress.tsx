import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import db from '@/lib/database';
import { Exercise, ProgressData } from '@/types';
import { getEffectiveWeight, getLatestBodyweight } from '@/lib/effective-weight';
import Icon from '@/components/Icon';
import BackToTop from '@/components/BackToTop';

export default function Progress() {
  const { exerciseId: exerciseIdParam } = useLocalSearchParams<{ exerciseId?: string }>();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<number | null>(null);
  const [progressData, setProgressData] = useState<ProgressData[]>([]);
  const [stats, setStats] = useState<{ maxWeight: number; totalVolume: number; workoutCount: number; estimated1RM: number } | null>(null);
  const [chartTab, setChartTab] = useState<'1rm' | 'volume' | 'weight'>('1rm');
  const [workoutChartTab, setWorkoutChartTab] = useState<'volume' | 'duration' | 'sets'>('volume');
  const [workoutOverview, setWorkoutOverview] = useState<{ date: string; volume: number; duration: number; sets: number; exercises: number; templateName: string | null }[]>([]);
  const [workoutFilter, setWorkoutFilter] = useState<string | null>(null);
  const [bodyPartFilter, setBodyPartFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'all' | '1m' | '3m' | '6m' | '1y'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const graphsY = useRef(0);
  const [scrollY, setScrollY] = useState(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(e.nativeEvent.contentOffset.y);
  };

  useFocusEffect(useCallback(() => {
    loadExercisesWithData();
    loadWorkoutOverview();
  }, [dateRange]));

  useEffect(() => {
    if (exerciseIdParam) {
      setSelectedExercise(Number(exerciseIdParam));
    }
  }, [exerciseIdParam]);

  const dateClause = dateRange === 'all' ? '' :
    dateRange === '1m' ? "AND wl.date >= date('now', '-30 days')" :
    dateRange === '3m' ? "AND wl.date >= date('now', '-90 days')" :
    dateRange === '6m' ? "AND wl.date >= date('now', '-180 days')" :
    "AND wl.date >= date('now', '-365 days')";

  const loadWorkoutOverview = () => {
    const bodyweight = getLatestBodyweight();
    const rows = db.getAllSync<{ id: number; date: string; duration: number | null; templateName: string | null }>(`
      SELECT wl.id, wl.date, wl.duration, wt.name as templateName
      FROM workout_logs wl
      LEFT JOIN workout_templates wt ON wl.template_id = wt.id
      WHERE 1=1 ${dateClause}
      ORDER BY wl.date DESC
      LIMIT 50
    `);
    const data = rows.map(row => {
      const sets = db.getAllSync<{ reps: number; weight: number; exerciseId: number }>(`
        SELECT sl.reps, sl.weight, sl.exercise_id as exerciseId FROM set_logs sl WHERE sl.workout_log_id = ?
      `, [row.id]);
      let volume = 0;
      const exerciseIds = new Set<number>();
      for (const s of sets) {
        const ew = getEffectiveWeight(s.weight, bodyweight);
        volume += s.reps * ew;
        exerciseIds.add(s.exerciseId);
      }
      return {
        date: row.date,
        volume: Math.round(volume),
        duration: row.duration || 0,
        sets: sets.length,
        exercises: exerciseIds.size,
        templateName: row.templateName,
      };
    });
    setWorkoutOverview(data);
  };

  const loadExercisesWithData = () => {
    const result = db.getAllSync<any>(`
      SELECT DISTINCT e.id, e.name, e.body_part as bodyPart, e.equipment,
             COUNT(DISTINCT sl.workout_log_id) as workoutCount,
             MAX(sl.weight) as maxWeight
      FROM exercises e
      JOIN set_logs sl ON e.id = sl.exercise_id
      JOIN workout_logs wl ON sl.workout_log_id = wl.id
      WHERE 1=1 ${dateClause}
      GROUP BY e.id
      ORDER BY workoutCount DESC, e.name
    `);
    setExercises(result);
  };

  useEffect(() => {
    if (selectedExercise) {
      const bodyweight = getLatestBodyweight();

      // Get raw set data per workout date
      const rawData = db.getAllSync<{ date: string; reps: number; weight: number; isDrop: number }>(`
        SELECT wl.date, sl.reps, sl.weight, sl.is_drop_set as isDrop
        FROM set_logs sl
        JOIN workout_logs wl ON sl.workout_log_id = wl.id
        WHERE sl.exercise_id = ? AND sl.is_drop_set = 0 ${dateClause}
        ORDER BY wl.date DESC, sl.set_number
      `, [selectedExercise]);

      // Group by date and compute effective weight
      const dateMap = new Map<string, { maxWeight: number; totalVolume: number; estimated1RM: number }>();
      for (const row of rawData) {
        const ew = getEffectiveWeight(row.weight, bodyweight);
        const entry = dateMap.get(row.date) || { maxWeight: 0, totalVolume: 0, estimated1RM: 0 };
        entry.maxWeight = Math.max(entry.maxWeight, ew);
        entry.totalVolume += row.reps * ew;
        const e1rm = row.reps === 1 ? ew : ew * (1 + row.reps / 30);
        if (ew > 0) entry.estimated1RM = Math.max(entry.estimated1RM, e1rm);
        dateMap.set(row.date, entry);
      }

      const data = Array.from(dateMap.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 20)
        .map(([date, d]) => ({
          date,
          maxWeight: d.maxWeight,
          totalVolume: d.totalVolume,
          estimated1RM: Math.round(d.estimated1RM * 10) / 10,
        }));

      setProgressData(data);

      if (data.length > 0) {
        const totalVolume = data.reduce((sum, d) => sum + d.totalVolume, 0);
        const maxWeight = Math.max(...data.map(d => d.maxWeight));
        const estimated1RM = Math.round(Math.max(...data.map(d => d.estimated1RM || 0)) * 10) / 10;
        setStats({ maxWeight, totalVolume, workoutCount: data.length, estimated1RM });
      }
    }
  }, [selectedExercise, dateRange]);

  const selectedExerciseData = exercises.find(e => e.id === selectedExercise);

  // Muscle group volume data (last 7 days) — uses effective weight for counterweight exercises
  const muscleVolume = !selectedExercise ? (() => {
    const bodyweight = getLatestBodyweight();
    const rawRows = db.getAllSync<{ bodyPart: string; reps: number; weight: number }>(`
      SELECT e.body_part as bodyPart, sl.reps, sl.weight
      FROM set_logs sl
      JOIN exercises e ON sl.exercise_id = e.id
      JOIN workout_logs wl ON sl.workout_log_id = wl.id
      WHERE wl.date >= date('now', '-7 days')
    `);
    const volMap = new Map<string, number>();
    for (const r of rawRows) {
      const ew = getEffectiveWeight(r.weight, bodyweight);
      volMap.set(r.bodyPart, (volMap.get(r.bodyPart) || 0) + r.reps * ew);
    }
    return Array.from(volMap.entries())
      .map(([bodyPart, volume]) => ({ bodyPart, volume }))
      .sort((a, b) => b.volume - a.volume);
  })() : [];
  const maxMuscleVolume = muscleVolume.length > 0 ? Math.max(...muscleVolume.map(m => m.volume)) : 1;

  // PR board data
  const [prFilter, setPrFilter] = useState<'all' | '3m' | '1m'>('all');
  const prDateClause = prFilter === '3m' ? "AND pr.date >= date('now', '-90 days')" : prFilter === '1m' ? "AND pr.date >= date('now', '-30 days')" : '';
  const prWorkoutClause = (() => {
    if (!workoutFilter) return '';
    const templateRow = db.getFirstSync<{ id: number }>(
      'SELECT id FROM workout_templates WHERE name = ?', [workoutFilter]
    );
    if (!templateRow) return '';
    const exIds = db.getAllSync<{ exerciseId: number }>(
      'SELECT exercise_id as exerciseId FROM template_exercises WHERE template_id = ?', [templateRow.id]
    );
    if (exIds.length === 0) return 'AND 1=0';
    return `AND pr.exercise_id IN (${exIds.map(e => e.exerciseId).join(',')})`;
  })();
  const prGlobalDateClause = dateRange === 'all' ? '' :
    dateRange === '1m' ? "AND pr.date >= date('now', '-30 days')" :
    dateRange === '3m' ? "AND pr.date >= date('now', '-90 days')" :
    dateRange === '6m' ? "AND pr.date >= date('now', '-180 days')" :
    "AND pr.date >= date('now', '-365 days')";
  const personalRecords = !selectedExercise ? db.getAllSync<{ exerciseName: string; recordType: string; value: number; date: string }>(`
    SELECT e.name as exerciseName, pr.record_type as recordType, pr.value, pr.date
    FROM personal_records pr
    JOIN exercises e ON pr.exercise_id = e.id
    WHERE pr.id IN (
      SELECT pr2.id FROM personal_records pr2
      WHERE pr2.exercise_id = pr.exercise_id AND pr2.record_type = pr.record_type ${prDateClause} ${prGlobalDateClause}
      ORDER BY pr2.value DESC LIMIT 1
    ) ${prWorkoutClause}
    ORDER BY e.name, pr.record_type
  `) : [];

  // Unique workout names for filter — use actual templates, not just logged workouts
  const workoutNames = db.getAllSync<{ name: string }>(
    'SELECT name FROM workout_templates ORDER BY name'
  ).map(r => r.name);
  const filteredOverview = workoutFilter
    ? workoutOverview.filter(w => w.templateName === workoutFilter)
    : workoutOverview;

  // Filter exercises by selected workout template and body part
  const filteredExercises = (() => {
    let result = exercises;
    if (workoutFilter) {
      const templateRow = db.getFirstSync<{ id: number }>(
        'SELECT id FROM workout_templates WHERE name = ?', [workoutFilter]
      );
      if (templateRow) {
        const templateExIds = db.getAllSync<{ exercise_id: number }>(
          'SELECT DISTINCT exercise_id FROM template_exercises WHERE template_id = ?', [templateRow.id]
        );
        const idSet = new Set(templateExIds.map(r => r.exercise_id));
        result = result.filter(e => idSet.has(e.id));
      }
    }
    if (bodyPartFilter) {
      result = result.filter(e => e.bodyPart.toLowerCase().includes(bodyPartFilter.toLowerCase()));
    }
    return result;
  })();

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} style={styles.scrollView} onScroll={onScroll} scrollEventThrottle={100}>
        <Text style={styles.title}>Progress Tracking</Text>

        {!selectedExercise ? (
          <>
            <Text style={styles.subtitle}>Select an exercise to view progress</Text>
            <View style={styles.filterBar}>
              <TouchableOpacity
                style={[styles.filterToggleBtn, showFilters && styles.filterToggleBtnActive]}
                onPress={() => setShowFilters(!showFilters)}
              >
                <Icon name="search" size={14} color={showFilters ? '#fff' : '#9CA3AF'} />
                <Text style={[styles.filterToggleText, showFilters && styles.filterToggleTextActive]}>
                  Filters{(workoutFilter || bodyPartFilter || dateRange !== 'all') ? ` (${[workoutFilter, bodyPartFilter, dateRange !== 'all' ? dateRange : null].filter(Boolean).length})` : ''}
                </Text>
              </TouchableOpacity>
              {workoutOverview.length >= 2 && (
                <TouchableOpacity
                  style={styles.graphsJumpBtn}
                  onPress={() => scrollRef.current?.scrollTo({ y: graphsY.current, animated: true })}
                >
                  <Icon name="chart" size={14} color="#fff" />
                  <Text style={styles.graphsJumpBtnText}>Graphs</Text>
                </TouchableOpacity>
              )}
            </View>
            {showFilters && (
              <View style={styles.filterBox}>
                <Text style={styles.filterLabel}>Workout</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipRow}>
                  <View style={styles.filterChipRowContent}>
                    <TouchableOpacity
                      style={[styles.filterChip, !workoutFilter && styles.filterChipActive]}
                      onPress={() => setWorkoutFilter(null)}
                    >
                      <Text style={[styles.filterChipText, !workoutFilter && styles.filterChipTextActive]}>All</Text>
                    </TouchableOpacity>
                    {workoutNames.map(name => (
                      <TouchableOpacity
                        key={name}
                        style={[styles.filterChip, workoutFilter === name && styles.filterChipActive]}
                        onPress={() => setWorkoutFilter(workoutFilter === name ? null : name)}
                      >
                        <Text style={[styles.filterChipText, workoutFilter === name && styles.filterChipTextActive]}>{name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <Text style={styles.filterLabel}>Body Part</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipRow}>
                  <View style={styles.filterChipRowContent}>
                    <TouchableOpacity
                      style={[styles.filterChip, !bodyPartFilter && styles.filterChipActive]}
                      onPress={() => setBodyPartFilter(null)}
                    >
                      <Text style={[styles.filterChipText, !bodyPartFilter && styles.filterChipTextActive]}>All</Text>
                    </TouchableOpacity>
                    {[...new Set(exercises.map(e => e.bodyPart.split(',')[0].trim()))].sort().map(bp => (
                      <TouchableOpacity
                        key={bp}
                        style={[styles.filterChip, bodyPartFilter === bp && styles.filterChipActive]}
                        onPress={() => setBodyPartFilter(bodyPartFilter === bp ? null : bp)}
                      >
                        <Text style={[styles.filterChipText, bodyPartFilter === bp && styles.filterChipTextActive]}>{bp}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <Text style={styles.filterLabel}>Date Range</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipRow}>
                  <View style={styles.filterChipRowContent}>
                    {([['all', 'All Time'], ['1m', '1 Month'], ['3m', '3 Months'], ['6m', '6 Months'], ['1y', '1 Year']] as const).map(([key, label]) => (
                      <TouchableOpacity
                        key={key}
                        style={[styles.filterChip, dateRange === key && styles.filterChipActive]}
                        onPress={() => setDateRange(key)}
                      >
                        <Text style={[styles.filterChipText, dateRange === key && styles.filterChipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
            {filteredExercises.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No workout data yet</Text>
                <Text style={styles.emptySubtext}>Start logging workouts to track your progress</Text>
              </View>
            ) : (
              filteredExercises.map(ex => (
                <TouchableOpacity
                  key={ex.id}
                  style={styles.exerciseCard}
                  onPress={() => setSelectedExercise(ex.id)}
                >
                  <View style={styles.exerciseHeader}>
                    <Text style={styles.exerciseName}>{ex.name}</Text>
                    <Text style={styles.exerciseMeta}>{ex.bodyPart}</Text>
                  </View>
                  <View style={styles.exerciseStats}>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{ex.workoutCount}</Text>
                      <Text style={styles.statLabel}>Workouts</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{ex.maxWeight}kg</Text>
                      <Text style={styles.statLabel}>Max Weight</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}

            {workoutOverview.length >= 2 && (
              <View style={styles.workoutOverviewSection} onLayout={e => { graphsY.current = e.nativeEvent.layout.y; }}>
                <Text style={styles.sectionTitle}>Workout Overview</Text>
                <View style={styles.chartTabs}>
                  {(['volume', 'duration', 'sets'] as const).map(tab => (
                    <TouchableOpacity key={tab} style={[styles.chartTab, workoutChartTab === tab && styles.chartTabActive]} onPress={() => setWorkoutChartTab(tab)}>
                      <Text style={[styles.chartTabText, workoutChartTab === tab && styles.chartTabTextActive]}>
                        {tab === 'volume' ? 'Volume' : tab === 'duration' ? 'Duration' : 'Sets'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {filteredOverview.length >= 2 ? (() => {
                  const sorted = [...filteredOverview].reverse();
                  const labels = sorted.map(d => d.date.slice(5));
                  const values = sorted.map(d => {
                    if (workoutChartTab === 'volume') return d.volume;
                    if (workoutChartTab === 'duration') return d.duration;
                    return d.sets;
                  });
                  const screenWidth = Dimensions.get('window').width - 48;
                  const displayLabels = labels.length > 8
                    ? labels.filter((_, i) => i % Math.ceil(labels.length / 8) === 0)
                    : labels;
                  return (
                    <LineChart
                      data={{ labels: displayLabels, datasets: [{ data: values.length > 0 ? values : [0] }] }}
                      width={screenWidth}
                      height={200}
                      yAxisSuffix={workoutChartTab === 'duration' ? 'm' : ''}
                      chartConfig={{
                        backgroundColor: '#1F2937',
                        backgroundGradientFrom: '#1F2937',
                        backgroundGradientTo: '#1F2937',
                        decimalPlaces: 0,
                        color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`,
                        labelColor: () => '#9CA3AF',
                        propsForDots: { r: '4', strokeWidth: '2', stroke: '#F59E0B' },
                      }}
                      bezier
                      style={{ borderRadius: 12 }}
                    />
                  );
                })() : (
                  <View style={styles.noDataBox}>
                    <Text style={styles.noDataText}>Not enough data for this filter</Text>
                  </View>
                )}
                <View style={styles.workoutSummaryRow}>
                  <View style={styles.workoutSummaryCard}>
                    <Text style={styles.workoutSummaryValue}>{filteredOverview.length}</Text>
                    <Text style={styles.workoutSummaryLabel}>Workouts</Text>
                  </View>
                  <View style={styles.workoutSummaryCard}>
                    <Text style={styles.workoutSummaryValue}>
                      {filteredOverview.length > 0 ? Math.round(filteredOverview.reduce((s, w) => s + w.volume, 0) / filteredOverview.length) : 0}
                    </Text>
                    <Text style={styles.workoutSummaryLabel}>Avg Volume</Text>
                  </View>
                  <View style={styles.workoutSummaryCard}>
                    <Text style={styles.workoutSummaryValue}>
                      {filteredOverview.length > 0 ? Math.round(filteredOverview.reduce((s, w) => s + w.duration, 0) / filteredOverview.length) : 0}m
                    </Text>
                    <Text style={styles.workoutSummaryLabel}>Avg Duration</Text>
                  </View>
                  <View style={styles.workoutSummaryCard}>
                    <Text style={styles.workoutSummaryValue}>
                      {filteredOverview.length > 0 ? Math.round(filteredOverview.reduce((s, w) => s + w.sets, 0) / filteredOverview.length) : 0}
                    </Text>
                    <Text style={styles.workoutSummaryLabel}>Avg Sets</Text>
                  </View>
                </View>
              </View>
            )}

            {muscleVolume.length > 0 && (
              <View style={styles.heatmapSection}>
                <Text style={styles.sectionTitle}>Weekly Muscle Volume</Text>
                <View style={styles.heatmapGrid}>
                  {muscleVolume.map(m => {
                    const intensity = m.volume / maxMuscleVolume;
                    const bg = intensity > 0.7 ? '#F59E0B' : intensity > 0.4 ? '#3B82F6' : '#374151';
                    return (
                      <View key={m.bodyPart} style={[styles.heatmapCard, { backgroundColor: bg }]}>
                        <Text style={styles.heatmapLabel}>{m.bodyPart}</Text>
                        <Text style={styles.heatmapValue}>{Math.round(m.volume)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {personalRecords.length > 0 && (
              <View style={styles.prBoardSection}>
                <Text style={styles.sectionTitle}>Personal Records</Text>
                <View style={styles.prFilterRow}>
                  {(['all', '3m', '1m'] as const).map(f => (
                    <TouchableOpacity key={f} style={[styles.chartTab, prFilter === f && styles.chartTabActive]} onPress={() => setPrFilter(f)}>
                      <Text style={[styles.chartTabText, prFilter === f && styles.chartTabTextActive]}>
                        {f === 'all' ? 'All Time' : f === '3m' ? '3 Months' : '1 Month'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {(() => {
                  const grouped = new Map<string, typeof personalRecords>();
                  for (const pr of personalRecords) {
                    const arr = grouped.get(pr.exerciseName) || [];
                    arr.push(pr);
                    grouped.set(pr.exerciseName, arr);
                  }
                  return Array.from(grouped.entries()).map(([name, prs]) => (
                    <View key={name} style={styles.prBoardCard}>
                      <Text style={styles.prBoardExercise}>{name}</Text>
                      {prs.map((pr, i) => (
                        <View key={i} style={styles.prBoardRow}>
                          <Text style={styles.prBoardType}>
                            {pr.recordType === 'max_weight' ? 'Max Weight' : pr.recordType === 'max_volume' ? 'Best Volume' : 'Est. 1RM'}
                          </Text>
                          <Text style={styles.prBoardValue}>{pr.value}{pr.recordType !== 'max_volume' ? 'kg' : ''}</Text>
                          <Text style={styles.prBoardDate}>{pr.date}</Text>
                        </View>
                      ))}
                    </View>
                  ));
                })()}
              </View>
            )}
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.backButton} onPress={() => setSelectedExercise(null)}>
              <Icon name="chevronLeft" size={24} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.exerciseTitle}>{selectedExerciseData?.name}</Text>
            <Text style={styles.exerciseSubtitle}>{selectedExerciseData?.bodyPart} • {selectedExerciseData?.equipment}</Text>

            {stats && (
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statCardValue}>{stats.maxWeight}kg</Text>
                  <Text style={styles.statCardLabel}>Max Weight</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statCardValue}>{stats.estimated1RM}kg</Text>
                  <Text style={styles.statCardLabel}>Est. 1RM</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statCardValue}>{stats.workoutCount}</Text>
                  <Text style={styles.statCardLabel}>Workouts</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statCardValue}>{Math.round(stats.totalVolume)}</Text>
                  <Text style={styles.statCardLabel}>Total Volume</Text>
                </View>
              </View>
            )}

            {stats && progressData.length >= 2 && (
              <View style={styles.chartSection}>
                <View style={styles.chartTabs}>
                  {(['1rm', 'volume', 'weight'] as const).map(tab => (
                    <TouchableOpacity key={tab} style={[styles.chartTab, chartTab === tab && styles.chartTabActive]} onPress={() => setChartTab(tab)}>
                      <Text style={[styles.chartTabText, chartTab === tab && styles.chartTabTextActive]}>
                        {tab === '1rm' ? 'Est. 1RM' : tab === 'volume' ? 'Volume' : 'Top Set'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {(() => {
                  const sorted = [...progressData].reverse();
                  const labels = sorted.map(d => d.date.slice(5)); // MM-DD
                  const values = sorted.map(d => {
                    if (chartTab === '1rm') return Math.round(((d as any).estimated1RM || 0) * 10) / 10;
                    if (chartTab === 'volume') return Math.round(d.totalVolume);
                    return d.maxWeight;
                  });
                  const screenWidth = Dimensions.get('window').width - 48;
                  return (
                    <LineChart
                      data={{ labels: labels.length > 8 ? labels.filter((_, i) => i % Math.ceil(labels.length / 8) === 0) : labels, datasets: [{ data: values.length > 0 ? values : [0] }] }}
                      width={screenWidth}
                      height={200}
                      yAxisSuffix={chartTab === 'volume' ? '' : 'kg'}
                      chartConfig={{
                        backgroundColor: '#1F2937',
                        backgroundGradientFrom: '#1F2937',
                        backgroundGradientTo: '#1F2937',
                        decimalPlaces: chartTab === 'volume' ? 0 : 1,
                        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                        labelColor: () => '#9CA3AF',
                        propsForDots: { r: '4', strokeWidth: '2', stroke: '#3B82F6' },
                      }}
                      bezier
                      style={{ borderRadius: 12 }}
                    />
                  );
                })()}
              </View>
            )}

            <View style={styles.historySection}>
              <Text style={styles.sectionTitle}>Recent Workouts</Text>
              {progressData.map((data, index) => (
                <View key={index} style={styles.historyCard}>
                  <Text style={styles.historyDate}>{data.date}</Text>
                  <View style={styles.historyStats}>
                    <View style={styles.historyStat}>
                      <Text style={styles.historyStatLabel}>Max Weight</Text>
                      <Text style={styles.historyStatValue}>{data.maxWeight}kg</Text>
                    </View>
                    <View style={styles.historyStat}>
                      <Text style={styles.historyStatLabel}>Volume</Text>
                      <Text style={styles.historyStatValue}>{Math.round(data.totalVolume)}</Text>
                    </View>
                    <View style={styles.historyStat}>
                      <Text style={styles.historyStatLabel}>Est. 1RM</Text>
                      <Text style={styles.historyStatValue}>{Math.round((data as any).estimated1RM * 10) / 10}kg</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <BackToTop scrollY={scrollY} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  scrollView: { flex: 1, padding: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#9CA3AF', marginBottom: 24 },
  emptyState: { backgroundColor: '#1F2937', padding: 32, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  emptyText: { fontSize: 18, color: '#fff', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  exerciseCard: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  exerciseHeader: { marginBottom: 12 },
  exerciseName: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 4 },
  exerciseMeta: { fontSize: 13, color: '#9CA3AF' },
  exerciseStats: { flexDirection: 'row', gap: 24 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#3B82F6' },
  statLabel: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  backButton: { marginBottom: 8, paddingVertical: 4 },
  exerciseTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  exerciseSubtitle: { fontSize: 14, color: '#9CA3AF', marginBottom: 24 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard: { width: '47%', backgroundColor: '#1F2937', padding: 16, borderRadius: 12, alignItems: 'center' },
  statCardValue: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  statCardLabel: { fontSize: 12, color: '#9CA3AF' },
  historySection: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  historyCard: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  historyDate: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  historyStats: { flexDirection: 'row', gap: 24 },
  historyStat: {},
  historyStatLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  historyStatValue: { fontSize: 18, fontWeight: 'bold', color: '#3B82F6' },
  chartSection: { marginBottom: 24 },
  chartTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chartTab: { backgroundColor: '#374151', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  chartTabActive: { backgroundColor: '#3B82F6' },
  chartTabText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  chartTabTextActive: { color: '#fff' },
  heatmapSection: { marginTop: 8, marginBottom: 24 },
  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heatmapCard: { width: '31%', padding: 12, borderRadius: 10, alignItems: 'center' },
  heatmapLabel: { color: '#fff', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  heatmapValue: { color: '#D1D5DB', fontSize: 11 },
  prBoardSection: { marginBottom: 24 },
  prFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  prBoardCard: { backgroundColor: '#1F2937', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  prBoardExercise: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 8 },
  prBoardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  prBoardType: { flex: 1, fontSize: 13, color: '#D1D5DB' },
  prBoardValue: { fontSize: 14, fontWeight: 'bold', color: '#F59E0B', marginRight: 8 },
  prBoardDate: { fontSize: 11, color: '#6B7280' },
  workoutOverviewSection: { marginBottom: 24 },
  filterBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  filterToggleBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, gap: 6 },
  filterToggleBtnActive: { backgroundColor: '#1E3A8A' },
  filterToggleText: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
  filterToggleTextActive: { color: '#fff' },
  filterBox: { backgroundColor: '#1F2937', borderRadius: 12, padding: 14, marginBottom: 16 },
  filterLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  filterChipRow: { marginBottom: 8 },
  filterChipRowContent: { flexDirection: 'row', gap: 8 },
  filterChip: { backgroundColor: '#374151', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  filterChipActive: { backgroundColor: '#3B82F6' },
  filterChipText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  graphsJumpBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, gap: 6 },
  graphsJumpBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  noDataBox: { backgroundColor: '#1F2937', padding: 24, borderRadius: 12, alignItems: 'center' },
  noDataText: { color: '#6B7280', fontSize: 14 },
  workoutSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  workoutSummaryCard: { width: '47%', backgroundColor: '#1F2937', padding: 12, borderRadius: 10, alignItems: 'center' },
  workoutSummaryValue: { fontSize: 20, fontWeight: 'bold', color: '#F59E0B', marginBottom: 2 },
  workoutSummaryLabel: { fontSize: 11, color: '#9CA3AF' },
});
