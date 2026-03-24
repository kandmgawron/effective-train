# Gym Tracker - iOS App

A comprehensive fitness tracking application for iPhone, inspired by FitNotes.

## Features

- Define and manage workouts with exercises, sets, reps, and weights
- Set timers between sets
- Track performance with metrics over time
- Exercise library with form instructions and body part filtering
- Custom exercise creation
- Equipment management with gym profiles
- Travel mode for temporary equipment changes
- Progressive overload guidance (auto-increment weights, drop set suggestions)
- Estimated workout completion times
- CSV export for workout data analysis

## Tech Stack

- React Native with Expo SDK 55
- TypeScript
- Expo Router for navigation
- SQLite for local database
- React 19 with New Architecture

## Getting Started

```bash
# Install dependencies
npm install

# Start Expo development server
npm start
```

Then:
- Press `i` to open iOS simulator
- Or scan QR code with Expo Go app on your iPhone

## Security

✅ Zero vulnerabilities
✅ All dependencies up to date
✅ Expo SDK 55 (latest stable)

## Project Structure

```
/app              # App screens (Expo Router)
  /(tabs)         # Tab navigation screens
  /_layout.tsx    # Root layout
/components       # Reusable components
/lib              # Database and utilities
/types            # TypeScript types
```
