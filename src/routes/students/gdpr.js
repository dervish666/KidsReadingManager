/**
 * GDPR-related student routes.
 *
 *   DELETE /:id/erase       — Article 17 hard delete (admin, requires confirm)
 *   PUT    /:id/restrict    — Article 18 processing restriction toggle
 *   PUT    /:id/ai-opt-out  — per-student AI opt-out
 *   GET    /:id/export      — Article 15 Subject Access Request (JSON or CSV)
 *
 * The erase path is FK-safe (sessions → preferences → student) and adds
 * Wonde-synced students to `wonde_erased_students` so the next sync doesn't
 * re-create the row.
 */

import { Hono } from 'hono';
import { generateId, csvRow } from '../../utils/helpers.js';
import { forbiddenError } from '../../middleware/errorHandler.js';
import { requireAdmin, auditLog } from '../../middleware/tenant.js';
import { permissions } from '../../utils/crypto.js';
import {
  getDB,
  isMultiTenantMode,
  safeJsonParse,
  requireStudent,
} from '../../utils/routeHelpers.js';

const gdprRouter = new Hono();

gdprRouter.delete('/:id/erase', requireAdmin(), auditLog('erase', 'student'), async (c) => {
  const { id } = c.req.param();

  if (!isMultiTenantMode(c)) {
    return c.json({ error: 'Erasure requires multi-tenant mode' }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  if (!body.confirm) {
    return c.json({ error: 'Erasure requires { "confirm": true } in request body' }, 400);
  }

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const userId = c.get('userId');

  // Include inactive students — erasure applies regardless of soft-delete state
  const student = await db
    .prepare(
      `SELECT id, name, wonde_student_id FROM students
       WHERE id = ? AND organization_id = ?`
    )
    .bind(id, organizationId)
    .first();

  if (!student) {
    return c.json({ error: 'Student not found' }, 404);
  }

  const sessionCount = await db
    .prepare('SELECT COUNT(*) as count FROM reading_sessions WHERE student_id = ?')
    .bind(id)
    .first();
  const prefCount = await db
    .prepare('SELECT COUNT(*) as count FROM student_preferences WHERE student_id = ?')
    .bind(id)
    .first();

  const rightsLogId = generateId();
  const statements = [
    db
      .prepare(
        `INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, requested_by, status, completed_at)
         VALUES (?, ?, 'erasure', 'student', ?, ?, 'completed', datetime('now'))`
      )
      .bind(rightsLogId, organizationId, id, userId),

    // FK order: sessions → preferences → student
    db.prepare('DELETE FROM reading_sessions WHERE student_id = ?').bind(id),
    db.prepare('DELETE FROM student_preferences WHERE student_id = ?').bind(id),
    db.prepare('DELETE FROM students WHERE id = ?').bind(id),

    // Anonymise prior audit_log entries that referenced this student
    db
      .prepare(
        `UPDATE audit_log SET entity_id = 'erased', details = NULL
         WHERE entity_type = 'student' AND entity_id = ? AND organization_id = ?`
      )
      .bind(id, organizationId),
  ];

  if (student.wonde_student_id) {
    statements.push(
      db
        .prepare(
          `INSERT INTO wonde_erased_students (id, organization_id, wonde_student_id)
           VALUES (?, ?, ?)`
        )
        .bind(generateId(), organizationId, student.wonde_student_id)
    );
  }

  await db.batch(statements);

  return c.json({
    message: 'Student data erased successfully',
    erased: {
      readingSessions: sessionCount.count,
      preferences: prefCount.count,
      studentRecord: 1,
      auditEntriesAnonymised: true,
      wondeExcluded: Boolean(student.wonde_student_id),
    },
  });
});

gdprRouter.put('/:id/restrict', requireAdmin(), auditLog('restrict', 'student'), async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json({ error: 'Restriction requires multi-tenant mode' }, 400);
  }

  const { id } = c.req.param();
  const body = await c.req.json();
  const restricted = Boolean(body.restricted);

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const userId = c.get('userId');

  const student = await db
    .prepare(`SELECT id, processing_restricted FROM students WHERE id = ? AND organization_id = ?`)
    .bind(id, organizationId)
    .first();

  if (!student) {
    return c.json({ error: 'Student not found' }, 404);
  }

  await db.batch([
    db
      .prepare(
        `UPDATE students SET processing_restricted = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(restricted ? 1 : 0, id),

    db
      .prepare(
        `INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, requested_by, status, completed_at, notes)
         VALUES (?, ?, 'restriction', 'student', ?, ?, 'completed', datetime('now'), ?)`
      )
      .bind(
        generateId(),
        organizationId,
        id,
        userId,
        restricted ? 'Processing restricted' : 'Processing restriction lifted'
      ),
  ]);

  return c.json({
    message: restricted ? 'Processing restricted for student' : 'Processing restriction lifted',
    processingRestricted: restricted,
  });
});

gdprRouter.put('/:id/ai-opt-out', async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json({ error: 'AI opt-out requires multi-tenant mode' }, 400);
  }

  const { id } = c.req.param();
  const body = await c.req.json();
  const optOut = Boolean(body.optOut);

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');

  const userRole = c.get('userRole');
  if (!permissions.canManageStudents(userRole)) {
    throw forbiddenError();
  }

  await requireStudent(db, id, organizationId);

  await db
    .prepare(
      `UPDATE students SET ai_opt_out = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(optOut ? 1 : 0, id)
    .run();

  return c.json({
    message: optOut
      ? 'AI recommendations disabled for student'
      : 'AI recommendations enabled for student',
    aiOptOut: optOut,
  });
});

gdprRouter.get('/:id/export', requireAdmin(), async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json({ error: 'Export requires multi-tenant mode' }, 400);
  }

  const { id } = c.req.param();
  const format = (c.req.query('format') || 'json').toLowerCase();

  if (!['json', 'csv'].includes(format)) {
    return c.json({ error: 'Unsupported format. Use ?format=json or ?format=csv' }, 400);
  }

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const userId = c.get('userId');

  // Include inactive — SAR applies regardless of status
  const student = await db
    .prepare(
      `SELECT s.*, c.name as class_name, b.title as current_book_title, b.author as current_book_author
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       LEFT JOIN books b ON s.current_book_id = b.id
       WHERE s.id = ? AND s.organization_id = ?`
    )
    .bind(id, organizationId)
    .first();

  if (!student) {
    return c.json({ error: 'Student not found' }, 404);
  }

  const org = await db
    .prepare('SELECT name FROM organizations WHERE id = ?')
    .bind(organizationId)
    .first();

  const sessions = await db
    .prepare(
      `SELECT rs.*, b.title as book_title, b.author as book_author, u.name as recorded_by_name
       FROM reading_sessions rs
       LEFT JOIN books b ON rs.book_id = b.id
       LEFT JOIN users u ON rs.recorded_by = u.id
       WHERE rs.student_id = ?
       ORDER BY rs.session_date DESC`
    )
    .bind(id)
    .all();

  const preferences = await db
    .prepare(
      `SELECT sp.preference_type, g.name as genre_name
       FROM student_preferences sp
       LEFT JOIN genres g ON sp.genre_id = g.id
       WHERE sp.student_id = ?`
    )
    .bind(id)
    .all();

  const auditEntries = await db
    .prepare(
      `SELECT action, entity_type, details, created_at
       FROM audit_log
       WHERE entity_type = 'student' AND entity_id = ? AND organization_id = ?
       ORDER BY created_at DESC`
    )
    .bind(id, organizationId)
    .all();

  await db
    .prepare(
      `INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, requested_by, status, completed_at)
       VALUES (?, ?, 'access', 'student', ?, ?, 'completed', datetime('now'))`
    )
    .bind(generateId(), organizationId, id, userId)
    .run();

  const exportData = {
    metadata: {
      exportDate: new Date().toISOString(),
      exportFormat: 'GDPR Article 15 Subject Access Request',
      organization: org?.name || organizationId,
      dataController: 'Scratch IT LTD',
    },
    student: {
      name: student.name,
      class: student.class_name || null,
      yearGroup: student.year_group || null,
      readingLevelMin: student.reading_level_min,
      readingLevelMax: student.reading_level_max,
      senStatus: student.sen_status || null,
      pupilPremium: Boolean(student.pupil_premium),
      ealStatus: student.eal_status || null,
      freeSchoolMeals: Boolean(student.fsm),
      notes: student.notes || null,
      currentBook: student.current_book_title || null,
      currentBookAuthor: student.current_book_author || null,
      processingRestricted: Boolean(student.processing_restricted),
      aiOptOut: Boolean(student.ai_opt_out),
      isActive: Boolean(student.is_active),
      createdAt: student.created_at,
      updatedAt: student.updated_at,
    },
    preferences: (preferences.results || []).map((p) => ({
      type: p.preference_type,
      genre: p.genre_name,
    })),
    readingSessions: (sessions.results || []).map((s) => ({
      date: s.session_date,
      bookTitle: s.book_title || s.book_title_manual || null,
      bookAuthor: s.book_author || s.book_author_manual || null,
      pagesRead: s.pages_read,
      durationMinutes: s.duration_minutes,
      assessment: s.assessment,
      notes: s.notes,
      location: s.location || 'school',
      recordedBy: s.recorded_by_name || null,
    })),
    auditTrail: (auditEntries.results || []).map((a) => ({
      action: a.action,
      entityType: a.entity_type,
      details: a.details ? safeJsonParse(a.details, a.details) : null,
      timestamp: a.created_at,
    })),
  };

  if (format === 'csv') {
    const lines = [];
    lines.push(`# GDPR Article 15 Subject Access Request`);
    lines.push(`# Export Date: ${exportData.metadata.exportDate}`);
    lines.push(`# Organization: ${exportData.metadata.organization}`);
    lines.push(`# Data Controller: ${exportData.metadata.dataController}`);
    lines.push('');

    lines.push('## Student Profile');
    lines.push(
      'Name,Class,Year Group,Reading Level Min,Reading Level Max,SEN Status,Pupil Premium,EAL Status,Free School Meals,Notes,Current Book,AI Opt-Out,Processing Restricted,Active,Created,Updated'
    );
    const s = exportData.student;
    lines.push(
      csvRow([
        s.name,
        s.class,
        s.yearGroup,
        s.readingLevelMin,
        s.readingLevelMax,
        s.senStatus,
        s.pupilPremium,
        s.ealStatus,
        s.freeSchoolMeals,
        s.notes,
        s.currentBook,
        s.aiOptOut,
        s.processingRestricted,
        s.isActive,
        s.createdAt,
        s.updatedAt,
      ])
    );
    lines.push('');

    if (exportData.preferences.length > 0) {
      lines.push('## Genre Preferences');
      lines.push('Type,Genre');
      for (const p of exportData.preferences) {
        lines.push(csvRow([p.type, p.genre]));
      }
      lines.push('');
    }

    lines.push('## Reading Sessions');
    lines.push(
      'Date,Book Title,Book Author,Pages Read,Duration (mins),Assessment,Notes,Location,Recorded By'
    );
    for (const rs of exportData.readingSessions) {
      lines.push(
        csvRow([
          rs.date,
          rs.bookTitle,
          rs.bookAuthor,
          rs.pagesRead,
          rs.durationMinutes,
          rs.assessment,
          rs.notes,
          rs.location,
          rs.recordedBy,
        ])
      );
    }

    const csv = lines.join('\n');
    const filename = `student-export-${student.name.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  const filename = `student-export-${student.name.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.json`;
  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

export { gdprRouter };
