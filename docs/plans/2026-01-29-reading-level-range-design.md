# Reading Level Range Design

## Overview

Replace the single reading level field for students with a min-max range to better reflect how students are assessed. Expand the maximum level from 5 to 13 and support decimal precision (one decimal place).

## Background

Students are assessed using Accelerated Reader (AR) levels, which range from 1.0 (early first readers) to 13.0 (adult-level complexity). Assessments produce a range rather than a single level - for example, a Year 5 student might have a range of 5.0-12.9, meaning they read confidently at 5.0 and can stretch up to 12.9.

## Data Model Changes

**Current state:** Students have a single `reading_level` field (integer 1-5).

**New state:** Students will have two decimal fields:
- `reading_level_min` (decimal 1.0-13.0, one decimal place)
- `reading_level_max` (decimal 1.0-13.0, one decimal place)

**Migration strategy:**
- Existing students with level X → min: X-0.5, max: X+0.5
- Edge case: level 1 → min: 1.0, max: 1.5 (can't go below 1.0)
- Students with no level set → leave both fields null

**Validation rules:**
- Min must be ≤ Max
- Both must be between 1.0 and 13.0
- One decimal place precision

## Student Input UI

**Location:** Student edit form (where reading level is currently set)

**New UI components:**
- Two text input fields side by side: "Min Level" and "Max Level"
- Number inputs accepting decimals (step="0.1", min="1.0", max="13.0")
- Small visual bar beneath showing the range on a 1-13 scale (read-only, for visual reference)
- Validation message if min > max

**Removing:**
- Current dropdown with text descriptions

**Display elsewhere:**
- Student cards/lists show range as "5.2 - 8.7" instead of single number
- Null/unset displays as "Not assessed" or similar

## Library Filtering

**Behavior:**
- When viewing Library for a specific student, filter shows books where the book's reading level falls within the student's min-max range
- Example: Student range 5.2-8.7 → show books with reading level 5.2 to 8.7
- Books with no reading level set are included (not excluded)

**Books:**
- Books keep their existing single reading level (already supports decimals)
- No changes needed to book data model

**UI:**
- When filtering by a student's range, display "Showing books for [Student Name] (5.2-8.7)"

## AI Recommendations

**New UI element:** When requesting recommendations, teacher selects a focus mode:
- **Consolidation** - Books from the lower half of the range (building confidence)
- **Challenge** - Books from the upper half of the range (stretching ability)
- **Balanced** - Books across the full range (default)

**AI prompt context:**

```
This student's reading ability is assessed using Accelerated Reader (AR) levels, which range from 1.0 (early first readers) to 13.0 (adult-level complexity). Their assessed range is [min] to [max] - they read confidently at the lower end and can stretch to the upper end with engagement.

Use these levels as a guide for book difficulty rather than looking for exact matches. The teacher has requested [consolidation/challenge/balanced] recommendations.
```

**Focus mode guidance in prompt:**
- **Consolidation**: "Recommend books appropriate for the lower end of their range (around X-Y AR level difficulty) to build fluency and confidence"
- **Challenge**: "Recommend books appropriate for the upper end of their range (around X-Y AR level difficulty) to stretch their abilities"
- **Balanced**: "Recommend a mix across their ability range"

## Implementation Areas

**Database:**
- Migration to add `reading_level_min` and `reading_level_max` columns (DECIMAL)
- Migration to convert existing `reading_level` values to range (X-0.5 to X+0.5)
- Drop original `reading_level` column after migration (or keep for rollback safety)

**Backend (Worker):**
- Update student CRUD endpoints to handle min/max fields
- Update Library filtering logic to use range comparison
- Update AI recommendation prompt builder with AR level context and focus mode

**Frontend:**
- Student edit form: Replace dropdown with two decimal inputs + visual range bar
- Student display (cards/tables): Show range format "5.2 - 8.7"
- Library: Update any level filter UI to work with ranges
- Recommendations: Add focus mode selector (Consolidation/Challenge/Balanced)

**Validation:**
- Frontend and backend: min ≤ max, both within 1.0-13.0, one decimal place
