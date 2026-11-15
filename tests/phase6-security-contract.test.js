import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20261115220000_phase6_production_hardening.sql", import.meta.url),
  "utf8"
);

test("Phase 6 denies browser access to legacy motivation claims", () => {
  assert.match(migration, /revoke all on table public\.motivation_generation_claims from anon, authenticated/i);
  assert.match(migration, /using \(false\) with check \(false\)/i);
});

test("privileged RPCs are not executable by anon or PUBLIC", () => {
  assert.match(migration, /revoke all on function public\.get_daily_motivation\(date\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.get_daily_motivation\(date\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.confirm_rota_import\(uuid, text, jsonb, date, date\) from public, anon/i);
});

test("owner RLS policies are scoped to authenticated users and init-plan auth.uid", () => {
  assert.match(migration, /alter policy "rotation owner all" on public\.rotations\s+to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /alter policy "shift owner all" on public\.shifts\s+to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /alter policy "note owner all" on public\.shift_notes\s+to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/i);
});

test("tenant ownership is enforced by composite foreign keys", () => {
  assert.match(migration, /rota_imports_user_rotation_owner_fkey/i);
  assert.match(migration, /shifts_user_rotation_owner_fkey/i);
  assert.match(migration, /shifts_user_import_owner_fkey/i);
  assert.match(migration, /shift_notes_user_shift_owner_fkey/i);
});

test("foreign-key performance indexes are included", () => {
  for (const index of [
    "audit_events_user_id_idx", "profiles_organisation_id_idx", "rota_imports_rotation_id_idx",
    "rota_imports_user_id_idx", "rotations_organisation_id_idx", "shift_notes_shift_id_idx",
    "shift_versions_user_id_idx", "shifts_import_id_idx", "user_motivation_history_quote_id_idx"
  ]) assert.match(migration, new RegExp(index, "i"));
});
