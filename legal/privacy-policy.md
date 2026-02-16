# Privacy Policy

**Stack My Trails**
Last updated: February 15, 2026

## Overview

Stack My Trails is a personal fitness visualization app that reads your workout routes from Apple Health and displays them on a map. Your data stays on your device. We do not collect or store any user data on external servers. The only network requests the app makes are to Apple's geocoding service to convert workout coordinates into place names (see Location section below).

## Data We Access

### Workout Routes (Apple HealthKit)

We read workout route data (GPS coordinates, timestamps, activity types, and weather metadata) from Apple Health. This data is used solely to:

- Display your workout routes on a map
- Stack multiple routes together for visualization
- Generate poster images you can save or share
- Filter routes by area, date, and activity type

Workout data is imported explicitly by you and stored locally in an on-device database. We never read or write health data in the background.

### Location

We use your device's location services for two purposes:

1. **Reverse geocoding** — converting GPS coordinates of your workout routes into human-readable place names (e.g., city and region). This is done via Apple's built-in geocoding service, which means the coordinates of your workout route centers are sent to Apple's servers for lookup. We cache the resulting location names locally on your device to minimize these requests. No other data is transmitted. Apple's handling of this data is governed by [Apple's Privacy Policy](https://www.apple.com/legal/privacy/).

2. **Show My Location on the map** — when you manually enable this option in the Settings tab, your current position is displayed on the stacked trails map. This helps you discover new or unvisited routes in your area. This feature is off by default and can be toggled on or off at any time. Your live location is used only for on-screen display and is never stored or transmitted.

### Photo Library

When you choose to save a poster image, we request permission to write to your photo library. We do not read or access your existing photos.

## Data Storage

All data is stored locally on your device:

- Workout routes are stored in a local SQLite database
- Export settings and preferences are stored on-device
- No cloud storage, no remote databases, no servers

## Data Export and Backup

You can export your trail data to a local file for backup purposes. This file is stored on your device and shared only if you explicitly choose to do so. The exported file contains your workout routes and is signed for integrity verification. Importing a backup merges data into the local database.

## Data We Do NOT Collect

- No personal identifiers (name, email, Apple ID)
- No analytics or usage tracking
- No advertising data
- No crash reporting to third parties
- No data transmitted to external servers (except coordinates sent to Apple for reverse geocoding as described above)
- No cookies or web tracking

## Third-Party Services

Stack My Trails does not use any third-party analytics, advertising, or tracking services. The app operates entirely offline after installation. Map tiles are loaded from Apple Maps, which is governed by Apple's own privacy policy.

## Data Deletion

You can delete all imported trail data at any time from the Settings tab within the app. Uninstalling the app removes all stored data from your device.

## Children's Privacy

Stack My Trails does not knowingly collect data from children under 13. The app does not collect any personal data from any user.

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last updated" date above.

## Contact

If you have questions about this privacy policy, please open an issue at:
https://github.com/anthropics/stack-my-trails/issues
