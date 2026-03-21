# Home Reading Backfill — Design Spec

**Date:** 2026-03-21
**Scope:** Change HomeReadingRegister multiple-read buttons from same-day count markers to individual sessions on consecutive previous days.

## Summary

Currently, when a teacher taps "2", "3", "4" or "+" on the HomeReadingRegister, a single session is created with a `[COUNT:N]` note. This breaks streak calculation because the streak calculator only sees one session on one day. The fix: create N individual sessions, one per day going backward from the selected date.

## Behaviour

When a teacher selects a student, picks a date (e.g. Friday 21 Mar), and taps "3":
- Session 1: Friday 21 Mar (the selected date)
- Session 2: Thursday 20 Mar
- Session 3: Wednesday 19 Mar

Each session has:
- `bookId`: student's current book
- `location`: `'home'`
- `assessment`: `null`
- `notes`: empty string
- `date`: the calculated date

No days are skipped (weekends included — children still read on weekends).

If a previous day already has sessions, the new home session is added alongside them (no overwrite, no skip).

## What Gets Removed

- The `[COUNT:N]` notes pattern — no longer written
- The `[COUNT:N]` parsing in `getStudentReadingStatus` — old `[COUNT:N]` sessions become regular single sessions (they'll show as ✓ on their date)
- The "multiple count" dialog (the "+" button's custom number dialog) — replaced by the same backfill logic with a custom number

## Grid Display

No change to display logic. Each day with one session shows ✓. Each day with multiple sessions (e.g. existing school session + new home session) shows the count. This already works via `READING_STATUS.READ` vs `READING_STATUS.MULTIPLE`.

## Clearing

Clearing only removes home sessions on the selected date (unchanged). Backfilled sessions on previous days are independent entries — clearing one day doesn't cascade.

## Existing Data

Old `[COUNT:N]` sessions remain in the database. With the count parsing removed, they display as a regular single ✓ on their date. No migration needed.

## Streak Impact

Since each day now has its own session row, the streak calculator correctly sees consecutive days of reading.

## Files Changed

1. `src/components/sessions/HomeReadingRegister.js`:
   - Rewrite the READ/MULTIPLE branch of `handleRecordReading` to create N sessions on N consecutive days (going backward from selected date)
   - Remove `[COUNT:N]` parsing from `getStudentReadingStatus` (the `sessionWithCount` / `match` logic)
   - Remove the multiple count dialog state and JSX (`multipleCountDialog`, `multipleCount`, `handleMultipleConfirm`)
   - Update `handleMultipleClick` to use the same backfill flow with a custom number input
