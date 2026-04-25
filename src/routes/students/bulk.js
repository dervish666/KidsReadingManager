/**
 * Bulk student import.
 *
 * Used by the CSV import wizard. Deduplicates by name (case-insensitive),
 * validates each row's reading-level range, and inserts in 100-statement
 * batches to stay within D1's per-batch ceiling.
 */

import { Hono } from 'hono';
import { generateId } from '../../utils/helpers.js';
import { validateBulkImport, validateReadingLevelRange } from '../../utils/validation.js';
import { badRequestError, forbiddenError } from '../../middleware/errorHandler.js';
import { auditLog } from '../../middleware/tenant.js';
import { permissions } from '../../utils/crypto.js';
import { getDB, isMultiTenantMode } from '../../utils/routeHelpers.js';
import { addStudents as addStudentsKV } from '../../services/kvService.js';

const bulkRouter = new Hono();

bulkRouter.post('/bulk', auditLog('import', 'student'), async (c) => {
  const body = await c.req.json();

  const validation = validateBulkImport(body);
  if (!validation.isValid) {
    throw badRequestError(validation.errors.join(', '));
  }

  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');

    const userRole = c.get('userRole');
    if (!permissions.canManageStudents(userRole)) {
      throw forbiddenError();
    }

    const seen = new Set();
    const dedupedStudents = body.filter((s) => {
      const key = (s.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (let i = 0; i < dedupedStudents.length; i++) {
      const student = dedupedStudents[i];
      const rangeValidation = validateReadingLevelRange(
        student.readingLevelMin,
        student.readingLevelMax
      );
      if (!rangeValidation.isValid) {
        throw badRequestError(`Student at index ${i}: ${rangeValidation.errors[0]}`);
      }
    }

    const students = dedupedStudents.map((student) => {
      const rangeValidation = validateReadingLevelRange(
        student.readingLevelMin,
        student.readingLevelMax
      );
      return {
        id: student.id || generateId(),
        name: student.name,
        classId: student.classId || null,
        readingLevelMin: rangeValidation.normalizedMin ?? null,
        readingLevelMax: rangeValidation.normalizedMax ?? null,
        likes: student.likes || [],
        dislikes: student.dislikes || [],
      };
    });

    const batchSize = 100;
    const savedStudents = [];

    for (let i = 0; i < students.length; i += batchSize) {
      const batch = students.slice(i, i + batchSize);
      const statements = batch.map((student) => {
        return db
          .prepare(
            `INSERT INTO students (id, organization_id, name, class_id, reading_level_min, reading_level_max, likes, dislikes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            student.id,
            organizationId,
            student.name,
            student.classId,
            student.readingLevelMin,
            student.readingLevelMax,
            JSON.stringify(student.likes),
            JSON.stringify(student.dislikes),
            userId
          );
      });

      await db.batch(statements);
      savedStudents.push(...batch);
    }

    return c.json(savedStudents, 201);
  }

  const newStudents = body.map((student) => ({
    id: student.id || generateId(),
    name: student.name,
    classId: student.classId || null,
    lastReadDate: student.lastReadDate || null,
    readingSessions: student.readingSessions || [],
    likes: student.likes || [],
    dislikes: student.dislikes || [],
    readingLevelMin: student.readingLevelMin || null,
    readingLevelMax: student.readingLevelMax || null,
  }));

  const savedStudents = await addStudentsKV(c.env, newStudents);
  return c.json(savedStudents, 201);
});

export { bulkRouter };
