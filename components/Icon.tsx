import React from 'react';
import Svg, { Path, Circle, Line } from 'react-native-svg';

const ICON_PATHS: Record<string, string[]> = {
  // Notes / notepad
  notes: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  // Swap / arrows
  swap: ['M16 3l4 4-4 4', 'M20 7H4', 'M8 21l-4-4 4-4', 'M4 17h16'],
  // Chart / progress
  chart: ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  // Dumbbell / strength
  dumbbell: ['M6.5 6.5h11', 'M6.5 17.5h11', 'M6.5 6.5v11', 'M17.5 6.5v11', 'M2 9.5v5', 'M22 9.5v5', 'M6.5 12H2', 'M22 12h-4.5'],
  // Link / chain (superset)
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  // Trophy
  trophy: ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2z'],
  // Target / crosshair
  target: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z', 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  // Timer / clock
  timer: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M12 6v6l4 2'],
  // Arrow up
  arrowUp: ['M12 19V5', 'M5 12l7-7 7 7'],
  // Arrow down
  arrowDown: ['M12 5v14', 'M19 12l-7 7-7-7'],
  // Refresh / cycle
  refresh: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10', 'M20.49 15a9 9 0 0 1-14.85 3.36L1 14'],
  // Shuffle
  shuffle: ['M16 3h5v5', 'M4 20L21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'],
  // Moon
  moon: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'],
  // Sun
  sun: ['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M12 1v2', 'M12 21v2', 'M4.22 4.22l1.42 1.42', 'M18.36 18.36l1.42 1.42', 'M1 12h2', 'M21 12h2', 'M4.22 19.78l1.42-1.42', 'M18.36 5.64l1.42-1.42'],
  // Search
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
  // Calendar
  calendar: ['M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  // Clipboard / manage
  clipboard: ['M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z'],
  // Trending up
  trendingUp: ['M23 6l-9.5 9.5-5-5L1 18'],
  // Zzz / sleep / snooze
  zzz: ['M4 19h4l-4 4h4', 'M10 11h4l-4 4h4', 'M16 3h4l-4 4h4'],
  // Weight / barbell
  weight: ['M6.5 6.5h11v11h-11z'],
  // Chevron left (back)
  chevronLeft: ['M15 18l-6-6 6-6'],
};

interface IconProps {
  name: keyof typeof ICON_PATHS;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function Icon({ name, size = 16, color = '#D1D5DB', strokeWidth = 2 }: IconProps) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => (
        <Path key={i} d={d} />
      ))}
    </Svg>
  );
}
