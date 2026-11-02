# MENYA

**Learn. Understand. Evolve.**

A responsive learning workspace built with React, TypeScript, and Vite. The web MVP records study activity, helps organize topics, plans study blocks, calculates learning summaries, supports weekly reflections, and exports user data.

## Start

```sh
npm install
npm run dev
```

Run the learning-engine checks with `npm test`. Create a production build with `npm run build`; preview it with `npm run preview`.

## Current product scope

- Study-session capture, historical editing, deletion, and local persistence.
- Topic lists, study planner, weekly reviews, analytics, achievements, and settings.
- A transparent, rule-based topic cue. No AI provider is called.
- Browser-local storage and JSON export work without a backend.
- Optional Supabase email/password authentication and per-user sync are wired when credentials are configured. Apply the included schema/RLS migration before using a Supabase project. No live migration has been applied from this workspace.
- Cloud synchronization is an MVP upsert flow, not a durable offline queue or conflict resolver. Group notes remain local.

## Learning calculations

The supplied Physics Mission Control workbook was inspected and its daily XP, streak, score-decay, weekly target, level, rank, and topic mastery rules now provide the app's configurable defaults. The 180-minute weekly target, 80% mastery threshold, 60% developing threshold, and 100 XP per level are marked as added assumptions in the workbook. See [the calculation guide](docs/calculations-learning-engine.md) for formulas and edge cases. The app expands the workbook's limited calculation rows to a dynamic history.

## Supabase setup

Copy `.env.example` to `.env.local`, fill in a Supabase project URL and anon key, and apply migrations using the Supabase CLI. Restart Vite after changing environment values. Never put a service-role key in a browser environment variable.

See `docs/architecture/stack-and-release.md` and `docs/product/implementation-audit.md` for architecture, privacy boundaries, and remaining integration work.
# menya
# menya
