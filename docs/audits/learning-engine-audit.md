# Workbook and learning-engine audit

Audit date: 2026-11-03. The source workbook was found at `/home/gilbert/Downloads/Physics_Mission_Control.xlsx` and opened with `openpyxl 3.1.2`. It contains six sheets: Mission Control, Session Log, Weekly Review, Analytics, Daily Engine, and Setup. Workbook formulas and the app implementation were compared statically; the workbook itself was not modified.

## Formula comparison

| Rule | Workbook | App implementation |
|---|---|---|
| Active day | Sum of daily minutes > 0 or attempted problems > 0 | Same |
| XP | Base daily XP + daily correct × XP per correct + rounded (daily aggregate accuracy × max bonus); no-attempt day has no accuracy bonus | Same; multiple sessions aggregate first |
| Current day | `PENDING` until end of day; keep previous streak/score | Same |
| Missed past day | Reset streak; subtract decay from score, floor at zero | Same |
| XP history | Sum of daily XP; no decay | Same |
| Weekly status | Both active days and attempts target => ON TARGET; some activity => BUILDING; completed empty week => MISSED; current empty week => “-” | Same status rules are now represented by `summarizeWeek` |
| Level/rank | `INT(total XP / XP per level) + 1`; highest attained rank threshold | Same |
| Topic status | Aggregate correct/attempted: mastery/developing/focus thresholds; no attempts => no data | Same; no minimum sample size exists in workbook |

The workbook setup defaults are: program start 2026-09-14, base 10 XP per active day, 2 XP per correct answer, max accuracy bonus 10, missed-day decay 5, weekly goals 5 active days/15 problems/180 minutes, streak badge every 7 days, mastery 80%, developing 60%, 100 XP per level; ranks Cadet 1, Navigator 3, Operator 5, Specialist 8, Commander 12, Architect 18. The workbook explicitly labels 180 minutes, 80%, 60%, and 100 XP as added assumptions, not original user-defined values.

The workbook bounds Session Log to 500 rows, topic analytics to 15 slots, and Daily Engine/Weekly Review to a 365-day horizon. The app intentionally computes an unbounded date range from configured program start through today and does not inherit those spreadsheet limits. Pre-start sessions contribute to lifetime session/time/problem/accuracy totals but not engine XP, score, or streak, matching the Setup note.

## Verification and discrepancy

The workbook’s sample Session Log record on 2026-10-13 has 6 attempts, 5 correct, and 25 minutes. The engine produces 28 XP (`10 + 5×2 + round(5/6×10)`), current score 28 from zero, and streak 1 when evaluated on that date. This is covered by the automated test suite.

The web UI currently presents the current weekly review rather than the workbook’s long multi-week calculated table. The calculation helper supports week metrics and the completed-empty-week MISSED state, but users cannot browse a complete automatically calculated weekly history. Spreadsheet-only dashboards, Focus Radar, recent challenge detail, accuracy-by-difficulty chart, and 365-day daily table are not all reproduced as app screens. Those are product gaps, not formula mismatches.

XP is derived in the browser from source session records. There is no XP transaction ledger or award mutation to double-grant today; repeated upserts use session UUIDs. The current merge code can still choose a stale local copy over the cloud copy. Server-authoritative reward history is not implemented.
