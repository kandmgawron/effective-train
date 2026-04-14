import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface SetTimerProps {
  duration: number;
  onComplete: () => void;
}

export default function SetTimer({ duration, onComplete }: SetTimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeRef = useRef(Date.now() + duration * 1000);

  useEffect(() => {
    endTimeRef.current = Date.now() + duration * 1000;
    setTimeLeft(duration);

    intervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        onComplete();
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [duration]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = duration > 0 ? timeLeft / duration : 0;

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Rest</Text>
          <Text style={styles.timer}>
            {minutes}:{seconds.toString().padStart(2, '0')}
          </Text>
          <TouchableOpacity style={styles.skipBtn} onPress={onComplete}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  inner: {
    backgroundColor: '#1E3A8A',
    borderRadius: 12,
    overflow: 'hidden',
  },
  progressBar: {
    height: 3,
    backgroundColor: '#374151',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#3B82F6',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  timer: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  skipBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  skipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
