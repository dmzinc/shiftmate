# ShiftMate Capacitor QA checklist

## Build and boot
- [ ] Clean npm install completes
- [ ] npm run build:mobile creates www/index.html, www/app.js and www/vendor.js
- [ ] Generated mobile HTML contains no Supabase or SheetJS CDN references
- [ ] Capacitor doctor reports no configuration errors
- [ ] Android project builds and launches
- [ ] iOS project builds and launches on macOS
- [ ] Core app boots without internet access after first install

## Authentication
- [ ] Sign up, email verification and sign in
- [ ] Password reset opens the app, not localhost
- [ ] Expired/invalid recovery links show a recoverable error
- [ ] Sign out clears account-scoped local data

## Rota and files
- [ ] Import .xlsx, .xls and .csv from Android Downloads/document provider
- [ ] Import .xlsx, .xls and .csv from iOS Files/iCloud Drive
- [ ] Large workbook parsing does not freeze the UI
- [ ] Add/edit/delete shifts and rotations
- [ ] Notes add/edit/delete and survive app restart

## Offline and sync
- [ ] Previously synced rota available in airplane mode
- [ ] Offline shift and note edits persist after force-close
- [ ] Queue resumes after network returns
- [ ] Retries are idempotent
- [ ] Concurrent edits create visible conflicts
- [ ] User A data never appears in User B local store
- [ ] Sign-out/account switch clears private local data and queued operations

## Notifications
- [ ] Local reminder permission request is contextual
- [ ] Reminder schedules respect user's timezone
- [ ] Editing/deleting a shift updates/cancels reminders
- [ ] Android FCM token registration and revocation
- [ ] iOS APNs/FCM token registration and revocation
- [ ] Push delivery is sent only from trusted server code

## Store readiness
- [ ] App icons and launch screens
- [ ] Privacy policy and support URL
- [ ] Data safety / App Privacy declarations
- [ ] Signed Android AAB
- [ ] TestFlight build
- [ ] Accessibility and device-size smoke tests
