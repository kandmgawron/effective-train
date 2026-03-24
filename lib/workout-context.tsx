import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

type WorkoutMode = 'active' | 'quick' | null;

interface WorkoutContextType {
  workoutMode: WorkoutMode;
  setWorkoutMode: (mode: WorkoutMode) => void;
  elapsedSeconds: number;
}

const WorkoutContext = createContext<WorkoutContextType>({
  workoutMode: null,
  setWorkoutMode: () => {},
  elapsedSeconds: 0,
});

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (workoutMode === 'active') {
      startTimeRef.current = Date.now();
      setElapsedSeconds(0);
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [workoutMode]);

  return (
    <WorkoutContext.Provider value={{ workoutMode, setWorkoutMode, elapsedSeconds }}>
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
