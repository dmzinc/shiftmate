# ShiftMate mobile implementation plan

## Product decisions

- Platforms: Android and iOS.
- Runtime: Capacitor 8.
- Experience: native-feeling application, not an external-site wrapper.
- Offline: full offline rota viewing and note/shift editing, with queued sync.
- Notifications: local shift reminders and remote push notifications.
- Backend remains Supabase; the web experience remains supported.

## Current repository baseline

The current app is a single-page HTML/CSS/JavaScript application (`index.html` + `app.js`) using Supabase JS and SheetJS from CDN URLs. It currently has no npm manifest, no Capacitor project, no native platform projects, no offline data layer, and no notification registration flow.

This branch adds Capacitor dependency/configuration scaffolding. It does not claim that native builds, offline sync, or push delivery are complete.

## Stage 0 — branch and toolchain

1. Install Node.js 22 LTS or newer, npm, Android Studio + Android SDK.
2. For iOS builds, use macOS with Xcode and CocoaPods.
3. Run `npm install`.
4. Run `npx cap add android` and `npx cap add ios` (iOS command must run on macOS).
5. Run `npm run cap:sync`, then open the native projects.
6. Keep generated signing keys, provisioning profiles, keystores, service-account JSON, and APNs keys out of Git.

## Stage 1 — make the web app a reliable mobile web bundle

Before generating release builds:
- Replace CDN dependencies (Supabase JS and SheetJS) with pinned npm dependencies and bundle them locally. A mobile app must not depend on a CDN being reachable to boot.
- Move the web app into a dedicated `www/` directory and set Capacitor `webDir: 'www'`. The current root webDir is transitional scaffolding only.
- Add mobile responsive QA for login, password recovery deep links, Excel/CSV file selection, large workbook parsing, modals, keyboard resizing, and accessibility.
- Use HTTPS for all backend traffic; do not embed service-role keys. The Supabase publishable/anon key is expected to be public and protected by RLS.

## Stage 2 — native app experience

Integrate and test:
- App lifecycle and deep links using `@capacitor/app`.
- Status bar, splash screen, keyboard resizing, haptics.
- Native file picker / Files integration for .xlsx, .xls and .csv imports. Verify iCloud Drive and Android document providers.
- Network status messaging and retry controls.
- Platform-specific icons, launch screens, permissions, privacy disclosures and store metadata.

Password reset and email confirmation URLs must use a verified HTTPS app link / Universal Link and an app URL scheme fallback. Configure matching Supabase Auth redirect allow-lists and native Android App Links / iOS Universal Links. Never redirect production users to localhost.

## Stage 3 — offline-first data architecture (required for the chosen full-offline scope)

Do not treat a service-worker cache as offline data support. Implement an explicit local database and sync engine.

Recommended design:
- Local SQLite database with encryption at rest on device; use a supported Capacitor SQLite plugin and verify its current compatibility before adoption.
- Tables: rotations, shifts, shift_notes, sync_queue, sync_metadata.
- Scope every local row by authenticated Supabase user ID. Clear the local database on sign-out/account switch.
- Read screens from SQLite first; refresh from Supabase when online.
- Mutations write locally and enqueue an operation in the same transaction.
- Sync queue operations carry UUID, entity, entity ID, operation, payload, user ID, created_at, retry count and idempotency key.
- Process the queue when connectivity returns and on app resume. Use bounded exponential backoff.
- Add server-side updated_at/version fields and soft-delete/tombstone handling before enabling offline edits.
- Conflict policy: never silently overwrite. Use optimistic concurrency/version checks; surface a conflict resolution UI for concurrent edits. Notes can use append-only versions; shift/rotation edits require field-aware conflict handling.
- Show clear per-record pending/synced/conflict states and a last-sync timestamp.
- Do not cache sensitive rota or note content in shared browser caches.

Acceptance criteria:
1. A user can open previously synced rotations and shifts in airplane mode.
2. A user can create/edit/delete shifts and notes offline.
3. Closing/restarting the app does not lose queued changes.
4. Reconnecting syncs each operation exactly once (idempotently).
5. A second device's concurrent edits produce a visible conflict, not silent data loss.
6. Signing out removes local user data and pending operations.

## Stage 4 — notifications

Local reminders:
- Schedule/cancel reminders on-device from the user's rota.
- Store reminder preferences and timezone per user.
- Reconcile scheduled reminders after rota changes, app updates and timezone changes.
- Request notification permission contextually, not immediately at first launch.

Push notifications:
- Add a device registration table with owner-only RLS and unique device token.
- Register FCM on Android and APNs (or APNs via FCM) on iOS.
- Send push only from a trusted server/Edge Function using secrets stored server-side.
- Never send service-role credentials or FCM/APNs secrets to the client.
- Provide device revocation on logout and token rotation handling.
- Keep shift details out of lock-screen notifications by default; let users opt in to detailed previews.

## Stage 5 — security, privacy and compliance

- Confirm RLS for every user-owned table and test cross-account access.
- Store only the minimum data required locally; encrypt it at rest.
- Use platform secure storage for refresh-token/key material where supported.
- Apply biometric unlock as an additional local gate, not as a replacement for Supabase authentication.
- Provide privacy policy, data deletion/export process, permission rationale and store privacy declarations.
- Review healthcare-data handling and avoid collecting patient-identifiable information in notes.

## Stage 6 — release and QA gates

Android:
- Build signed AAB, test on physical Android devices, validate file import, notifications, deep links, offline sync, rotation changes, and upgrade path.
- Internal testing track before production.

iOS:
- Build/archive with Xcode on macOS, test on physical iPhones, validate Files/iCloud import, APNs, Universal Links, offline sync and background behaviour.
- TestFlight before App Store submission.

Release gates for both:
- Authentication and password recovery.
- Email verification deep links.
- Rota import for the known workbook layouts plus unseen layouts.
- Offline CRUD + sync + conflict tests.
- Local reminders and remote push.
- RLS/security regression and account isolation.
- Accessibility, small-screen layout, performance, crash-free smoke test.

## Immediate next implementation tasks

1. Add package dependencies and Capacitor config (this branch).
2. Convert the root static app into a `www/` bundle and vendor runtime dependencies.
3. Generate Android and iOS projects with Capacitor CLI.
4. Implement the encrypted local database and sync queue before advertising full offline support.
5. Implement deep links and notification registration.
6. Run device QA and create signed store builds.

## Important deployment note

Render currently serves the web app. This mobile branch should not be merged into the production branch until the web app remains deployable and mobile build checks pass. Capacitor native projects are built separately from Render; Render remains the web hosting target.
