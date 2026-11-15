# ShiftMate frontend architecture

The frontend is being incrementally decomposed from the legacy `app.js` bundle into ordered feature modules.

## Current structure

```text
assets/
  js/
    core.js          # Supabase client, shared state, DOM and messaging helpers
    auth.js          # Sign-in, sign-up, recovery and session bootstrap
    data.js          # Authenticated profile, rotation and shift data loading
    navigation.js    # Page navigation, motivation card and shift-moment scheduling
    dashboard.js     # Dashboard and rotation/rota view rendering
    rotations.js     # Rotation lifecycle and import workflow orchestration
    rota-import.js   # Workbook parsing, header detection and rota matching
    shifts.js        # Shift details and shift CRUD
    notes.js         # Shift notes CRUD
```

## Runtime model

This is a framework-free browser application. Modules are loaded as ordered classic scripts so existing global function/event-handler integration remains compatible during migration. Do not add `type="module"` without first migrating inline HTML handlers and shared state to explicit ES module exports.

## Dependency order

1. `core.js`
2. `auth.js`
3. `data.js`
4. `navigation.js`
5. `dashboard.js`
6. `rotations.js`
7. `rota-import.js`
8. `shifts.js`
9. `notes.js`

## Architecture principles for subsequent iterations

- Keep domain-specific behaviour in its feature module.
- Keep Supabase access behind data/repository functions; avoid duplicating query logic.
- Validate and normalize imported rota data at the import boundary.
- Keep secrets out of browser code; only the Supabase publishable key belongs in the client.
- Use database RLS as the authorization boundary.
- Move to explicit ES modules and a build tool in a separate migration after behaviour is covered by automated tests.
- Add unit tests for date/time parsing, rota header detection, name matching and notification scheduling before further decomposition.
- Add integration tests for auth, profile persistence, shift CRUD and RLS isolation.
- Keep native notification scheduling behind a platform adapter so browser and Capacitor implementations can evolve independently.

## Important migration note

The original `app.js` is retained as a rollback reference and is no longer loaded by `index.html`. Remove it only after the modular version has passed regression testing in web and Capacitor builds.
