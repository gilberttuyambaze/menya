# MENYA implementation roadmap

Priorities reflect this audit. Production deployment and mobile work should wait for the critical data-integrity foundations.

## Critical

1. **Establish reliable account sync.** Dependency: Supabase dev project and repository abstraction. Add IndexedDB durability, per-account outbox, idempotency keys, retries, tombstones, optimistic concurrency, and explicit conflict resolution. Acceptance: offline create/edit/delete survives reload; duplicate retries do not duplicate records; a two-device edit produces a visible conflict; account switch never crosses data.
2. **Complete database verification and tenant integrity.** Dependency: disposable Supabase project. Apply the full migration chain; test each table's RLS with two users; constrain session-topic ownership; verify grants and auth configuration. Acceptance: unauthorized cross-user select/write/delete and cross-tenant topic links fail; all legitimate owner operations pass.
3. **Make scoring authoritative before competitive/valuable rewards.** Dependency: finalized, versioned calculation spec. Add a trusted calculation/correction function and immutable XP ledger with unique idempotency key. Acceptance: replayed event cannot duplicate XP; correction/deletion produces auditable compensating entries; client cannot write authoritative rewards.

## High

1. **Improve domain model and navigation.** Add shareable URL routes, explicit subjects/modules and topic IDs, and historical review summaries. Acceptance: direct URL/reload works for each primary route; topic ownership and historical references remain valid after rename/delete.
2. **Build out analytics and goals from verified records.** Add daily/weekly/month views, target history, mastery trends, and spreadsheet-equivalent Focus Radar/difficulty insights without fabricated metrics. Acceptance: every displayed value traces to the shared engine and matches fixture calculations.
3. **Security and account lifecycle.** Password recovery, account deletion/export against server data, profile management, abuse controls. Acceptance: auth flows and data deletion tested in a staging Supabase project; no privileged key reaches browser bundles.
4. **Accessibility and design consistency.** Align gold token to `#FFD700`, audit all light/dark components, keyboard/screen-reader states, contrast and reduced motion. Acceptance: WCAG AA contrast checks and desktop/tablet/mobile browser review documented.
5. **Test coverage.** Add database authorization, repository/outbox, component and browser E2E tests. Acceptance: critical learning rules, two-user isolation, offline replay/conflict, CRUD, and responsive navigation run in CI.

## Medium

1. Learning goals, rescheduling, recurring schedules and local/browser notifications; acceptance includes time zone, permission denial, and opt-out tests.
2. Groups with explicit membership, invitations, selective sharing and RLS; acceptance includes owner/member/outsider permission tests.
3. Secure AI learning endpoint with consent, data minimization and rate limits; acceptance includes secret scanning and prompt/data boundary review. No API keys in browser code.

## Low / later platform phases

1. Android packaging with Capacitor after web repository and offline contract stabilizes.
2. Native notification/background sync adapters and Play Store release checks.
3. iOS packaging and platform-specific permission, notification, privacy, and App Store review.

## External prerequisites

Supabase development and production projects, auth email/redirect policy, secret management, CI/deployment credentials, and app-store accounts are external setup. Do not claim them configured until independently verified.
