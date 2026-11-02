# Learning calculations

MENYA uses the supplied Physics Mission Control workbook as the source for its default scoring rules. These defaults are configurable in Profile & Settings and are recalculated over the saved session history.

## Daily records

A calendar date is active when its sessions contain more than zero study minutes or more than zero attempted problems. The app combines all sessions on a date before calculating accuracy and XP:

- Daily accuracy = total correct problems / total attempted problems. It is blank when no problems were attempted.
- Active-day XP = base active-day XP + (correct problems × XP per correct answer) + rounded (daily accuracy × maximum accuracy bonus). A minutes-only active day receives base XP and no accuracy bonus.
- Current streak increments on an active day. An inactive current date is pending and preserves the previous streak. An inactive past date resets the streak.
- Current score adds active-day XP and subtracts the missed-day decay on inactive past days, with a floor of zero. XP total never decays.

The app builds daily rows dynamically from the configured program start date through today; it does not retain the workbook's 365-row engine cap. Duplicate session UUIDs are collapsed with the last copy winning, matching last-write sync semantics. Historical session edits cause summaries to recalculate. Dates use the browser's local calendar.

## Weekly targets, level, and mastery

Weekly status is ON TARGET when both the practice-day and attempted-problem targets are met; it is BUILDING when there is some recorded activity but both targets are not met; a completed empty week is MISSED, while an empty week still in progress is shown as “—”. Weekly minutes are tracked as a separate configurable target and are not part of the workbook's ON TARGET test.

Level is `floor(total XP / XP per level) + 1`. Rank is the highest configured rank threshold reached. Topic accuracy pools all recorded attempts for that topic. It is MASTERED at or above the mastery threshold, DEVELOPING at or above the developing threshold, and FOCUS below that; topics without attempts have no accuracy classification.

## Workbook defaults

Defaults from Setup: program start 2026-09-14; 10 XP per active day; 2 XP per correct answer; accuracy bonus up to 10 XP; 5 score points lost per missed past day; weekly goals of 5 active days, 15 attempts, and 180 minutes; 7-day streak milestone; mastery at 80%, developing at 60%; 100 XP per level. The workbook marks the 180-minute, 80%, 60%, and 100 XP values as added assumptions; they are editable defaults, not confirmed source rules. Rank thresholds are Cadet (1), Navigator (3), Operator (5), Specialist (8), Commander (12), and Architect (18).

## Reference calculation

For one active date with 6 attempts, 5 correct answers, and 25 study minutes: accuracy is 5/6; XP is `10 + (5 × 2) + round((5/6) × 10) = 28`; the score is 28 when starting from zero, and the streak is one day. Multiple sessions on the same date are aggregated before applying this formula.
