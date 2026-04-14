import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

type WorkoutMode = 'active' | 'quick' | null;

interface WorkoutContextType {
  workoutMode: WorkoutMode;
  setWorkoutMode: (mode: WorkoutMode) => void;
  elapsedSeconds: number;
  paused: boolean;
  togglePause: () => void;
}

const WorkoutContext = createContext<WorkoutContextType>({
  workoutMode: null,
  setWorkoutMode: () => {},
  elapsedSeconds: 0,
  paused: false,
  togglePause: () => {},
});

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number>(0);

  const startTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (startTimeRef.current && !paused) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
  };

  useEffect(() => {
    if (workoutMode === 'active') {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
        setElapsedSeconds(0);
      }
      startTimer();
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      startTimeRef.current = null;
      setElapsedSeconds(0);
      setPaused(false);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [workoutMode]);

  const togglePause = () => {
    if (paused) {
      // Resume: adjust start time to account for paused duration
      if (startTimeRef.current) {
        const pausedDuration = Date.now() - pausedAtRef.current;
        startTimeRef.current += pausedDuration;
      }
      setPaused(false);
      startTimer();
    } else {
      // Pause
      pausedAtRef.current = Date.now();
      setPaused(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  };

  return (
    <WorkoutContext.Provider value={{ workoutMode, setWorkoutMode, elapsedSeconds, paused, togglePause }}>
      {children}
    </WorkoutContext.Provider>
  );
}

export const useWorkout = () => useContext(WorkoutContext);

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
