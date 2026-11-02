# Data migration

On first load for an account, MENYA checks IndexedDB first. If no workspace exists, it reads the corresponding legacy `menya.workspace.v2` key (user-suffixed for authenticated accounts), normalizes it, writes the workspace and account marker, then reads it back and verifies the copy. The original localStorage value is not removed.

The anonymous key is migrated only to the anonymous workspace. Authentication never automatically uploads or merges it. After sign-in, the Settings screen offers an explicit import action; matching session/plan IDs and review weeks are not duplicated, and the anonymous copy remains intact. The cloud schema migration backfills sessions, topics, plans, reviews, profiles/settings, and audit logs to version 1 generic records while preserving all old tables and rows. Apply the SQL migration to a development Supabase project first; do not apply it to production without authorization.

The current local schema uses a versioned IndexedDB database and creates stores during upgrade. Later schema changes must increment `DATABASE_VERSION` and preserve existing data in `onupgradeneeded`. No destructive browser migration is included.
