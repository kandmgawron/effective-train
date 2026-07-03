import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Modal, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SetTimerProps {
  duration: number;
  onComplete: () => void;
}

export default function SetTimer({ duration, onComplete }: SetTimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [fullScreen, setFullScreen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeRef = useRef(Date.now() + duration * 1000);
  const flashOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    endTimeRef.current = Date.now() + duration * 1000;
    setTimeLeft(duration);

    intervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);

      // Go full screen at 10 seconds
      if (remaining <= 10 && remaining > 0 && !fullScreen) {
        setFullScreen(true);
      }

      if (remaining <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        // ponytail: haptics + flash for completion signal
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Animated.sequence([
          Animated.timing(flashOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.timing(flashOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(flashOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.timing(flashOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => {
          setFullScreen(false);
          onComplete();
        });
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [duration]);

  const handleSkip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setFullScreen(false);
    onComplete();
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = duration > 0 ? timeLeft / duration : 0;

  // Full screen countdown for last 10 seconds
  if (fullScreen) {
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent>
        <View style={styles.fullScreenContainer}>
          <Animated.View style={[styles.fullScreenFlash, { opacity: flashOpacity }]} pointerEvents="none" />
          <Text style={styles.fullScreenTime}>{timeLeft}</Text>
          <Text style={styles.fullScreenLabel}>seconds</Text>
          <TouchableOpacity style={styles.fullScreenSkip} onPress={handleSkip}>
            <Text style={styles.fullScreenSkipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

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
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
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
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    zIndex: 10,
  },
  fullScreenTime: {
    color: '#fff',
    fontSize: 120,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  fullScreenLabel: {
    color: '#9CA3AF',
    fontSize: 20,
    marginTop: 8,
  },
  fullScreenSkip: {
    position: 'absolute',
    bottom: 80,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  fullScreenSkipText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
