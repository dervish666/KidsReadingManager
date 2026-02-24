/**
 * Wonde Sync Service
 *
 * Orchestrates syncing Wonde school data (students, classes, employees)
 * into the Tally Reading D1 database. Called by the webhook handler on
 * schoolApproved events and by the daily cron for delta sync.
 *
 * Uses the wondeApi.js client for API communication and handles:
 * - Data mapping (Wonde schema → Tally schema)
 * - D1 upserts (create or update by wonde_*_id)
 * - Employee-class relationship tracking
 * - Student deletion/deactivation
 * - Sync logging with status tracking
 */

import {
  fetchAllStudents,
  fetchAllClasses,
  fetchAllEmployees,
  fetchDeletions
} from '../utils/wondeApi.js';

/**
 * Maps a Wonde student object to Tally student fields.
 *
 * @param {Object} wondeStudent - Raw student from Wonde API
 * @returns {Object} Mapped student fields for Tally
 */
export function mapWondeStudent(wondeStudent) {
  const educationData = wondeStudent.education_details?.data;
  const extendedData = wondeStudent.extended_details?.data;
  const classesData = wondeStudent.classes?.data;

  return {
    wondeStudentId: wondeStudent.id,
    name: `${wondeStudent.forename} ${wondeStudent.surname}`,
    yearGroup: educationData?.current_nc_year ?? null,
    senStatus: extendedData?.sen_status ?? null,
    pupilPremium: extendedData?.premium_pupil_indicator ? 1 : 0,
    ealStatus: extendedData?.english_as_additional_language_status ?? null,
    fsm: extendedData?.free_school_meals ? 1 : 0,
    wondeClassIds: Array.isArray(classesData) ? classesData.map(c => c.id) : []
  };
}

/**
 * Maps a Wonde class object to Tally class fields.
 *
 * @param {Object} wondeClass - Raw class from Wonde API
 * @returns {Object} Mapped class fields for Tally
 */
export function mapWondeClass(wondeClass) {
  return {
    wondeClassId: wondeClass.id,
    name: wondeClass.name
  };
}

/**
 * Maps a Wonde employee object to Tally employee fields.
 *
 * @param {Object} wondeEmployee - Raw employee from Wonde API
 * @returns {Object} Mapped employee fields for Tally
 */
export function mapWondeEmployee(wondeEmployee) {
  const classesData = wondeEmployee.classes?.data;

  return {
    wondeEmployeeId: wondeEmployee.id,
    name: `${wondeEmployee.forename} ${wondeEmployee.surname}`,
    wondeClassIds: Array.isArray(classesData) ? classesData.map(c => c.id) : []
  };
}

/**
 * Runs a full (or delta) sync of Wonde school data into D1.
 *
 * Sequence:
 * 1. Create sync log entry (status=running)
 * 2. Fetch + upsert classes
 * 3. Build wonde_class_id → tally class id lookup
 * 4. Fetch + upsert students (with class_id from lookup)
 * 5. Fetch + insert employee-class mappings
 * 6. Fetch + process deletions (deactivate students)
 * 7. Update organization last sync timestamp
 * 8. Update sync log (status=completed, counts)
 *
 * On error at any step: sync log is updated to failed with error message.
 *
 * @param {string} orgId - Tally organization ID
 * @param {string} schoolToken - Wonde API token for this school
 * @param {string} wondeSchoolId - Wonde school identifier
 * @param {Object} db - D1 database binding
 * @param {Object} [options] - Sync options
 * @param {string} [options.updatedAfter] - ISO date for delta sync
 * @returns {Promise<Object>} Sync result with status and counts
 */
export async function runFullSync(orgId, schoolToken, wondeSchoolId, db, options = {}) {
  const syncId = crypto.randomUUID();
  const syncType = options.updatedAfter ? 'delta' : 'full';
  const now = new Date().toISOString();

  const counts = {
    studentsCreated: 0,
    studentsUpdated: 0,
    studentsDeactivated: 0,
    classesCreated: 0,
    classesUpdated: 0,
    employeesSynced: 0
  };

  // Step 1: Create sync log entry
  try {
    await db.prepare(
      `INSERT INTO wonde_sync_log (id, organization_id, sync_type, status, started_at)
       VALUES (?, ?, ?, 'running', ?)`
    ).bind(syncId, orgId, syncType, now).run();
  } catch (err) {
    // If we can't even log, return failed immediately
    return {
      status: 'failed',
      syncId,
      ...counts,
      errorMessage: `Failed to create sync log: ${err.message}`
    };
  }

  try {
    const fetchOptions = {};
    if (options.updatedAfter) {
      fetchOptions.updatedAfter = options.updatedAfter;
    }

    // -----------------------------------------------------------------------
    // Step 2: Fetch and upsert classes
    // -----------------------------------------------------------------------
    const wondeClasses = await fetchAllClasses(schoolToken, wondeSchoolId, fetchOptions);

    // Map wonde_class_id → tally class id (built as we upsert)
    const classLookup = new Map();

    for (const wc of wondeClasses) {
      const mapped = mapWondeClass(wc);

      // Check if class exists by wonde_class_id within this org
      const existing = await db.prepare(
        `SELECT id, name FROM classes WHERE wonde_class_id = ? AND organization_id = ?`
      ).bind(mapped.wondeClassId, orgId).first();

      if (existing) {
        // Update name if changed
        await db.prepare(
          `UPDATE classes SET name = ?, updated_at = datetime('now') WHERE id = ?`
        ).bind(mapped.name, existing.id).run();
        classLookup.set(mapped.wondeClassId, existing.id);
        counts.classesUpdated++;
      } else {
        // Create new class
        const classId = crypto.randomUUID();
        await db.prepare(
          `INSERT INTO classes (id, organization_id, name, wonde_class_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
        ).bind(classId, orgId, mapped.name, mapped.wondeClassId).run();
        classLookup.set(mapped.wondeClassId, classId);
        counts.classesCreated++;
      }
    }

    // -----------------------------------------------------------------------
    // Step 3: Fetch and upsert students
    // -----------------------------------------------------------------------
    const wondeStudents = await fetchAllStudents(schoolToken, wondeSchoolId, fetchOptions);

    for (const ws of wondeStudents) {
      const mapped = mapWondeStudent(ws);

      // Resolve class_id from first wondeClassId
      const classId = mapped.wondeClassIds.length > 0
        ? (classLookup.get(mapped.wondeClassIds[0]) || null)
        : null;

      // Check if student exists by wonde_student_id within this org
      const existing = await db.prepare(
        `SELECT id FROM students WHERE wonde_student_id = ? AND organization_id = ?`
      ).bind(mapped.wondeStudentId, orgId).first();

      if (existing) {
        // Update existing student
        await db.prepare(
          `UPDATE students SET name = ?, class_id = ?, year_group = ?, sen_status = ?,
           pupil_premium = ?, eal_status = ?, fsm = ?, is_active = 1,
           updated_at = datetime('now')
           WHERE id = ?`
        ).bind(
          mapped.name, classId, mapped.yearGroup, mapped.senStatus,
          mapped.pupilPremium, mapped.ealStatus, mapped.fsm,
          existing.id
        ).run();
        counts.studentsUpdated++;
      } else {
        // Create new student
        const studentId = crypto.randomUUID();
        await db.prepare(
          `INSERT INTO students (id, organization_id, name, class_id, wonde_student_id,
           year_group, sen_status, pupil_premium, eal_status, fsm,
           is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
        ).bind(
          studentId, orgId, mapped.name, classId, mapped.wondeStudentId,
          mapped.yearGroup, mapped.senStatus, mapped.pupilPremium,
          mapped.ealStatus, mapped.fsm
        ).run();
        counts.studentsCreated++;
      }
    }

    // -----------------------------------------------------------------------
    // Step 4: Fetch and populate employee-class mappings
    // -----------------------------------------------------------------------
    const wondeEmployees = await fetchAllEmployees(schoolToken, wondeSchoolId, fetchOptions);

    // On full sync, delete existing mappings for org first
    await db.prepare(
      `DELETE FROM wonde_employee_classes WHERE organization_id = ?`
    ).bind(orgId).run();

    for (const we of wondeEmployees) {
      const mapped = mapWondeEmployee(we);

      for (const wondeClassId of mapped.wondeClassIds) {
        const mappingId = crypto.randomUUID();
        await db.prepare(
          `INSERT INTO wonde_employee_classes (id, organization_id, wonde_employee_id, wonde_class_id, employee_name)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(mappingId, orgId, mapped.wondeEmployeeId, wondeClassId, mapped.name).run();
      }

      counts.employeesSynced++;
    }

    // -----------------------------------------------------------------------
    // Step 5: Fetch and process deletions
    // -----------------------------------------------------------------------
    const deletions = await fetchDeletions(schoolToken, wondeSchoolId, options.updatedAfter);

    for (const del of deletions) {
      // Only deactivate if not restored
      if (!del.restored_at) {
        const result = await db.prepare(
          `UPDATE students SET is_active = 0, updated_at = datetime('now')
           WHERE wonde_student_id = ? AND organization_id = ?`
        ).bind(del.id, orgId).run();

        if (result.meta?.changes > 0) {
          counts.studentsDeactivated++;
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 6: Update organization last sync timestamp
    // -----------------------------------------------------------------------
    await db.prepare(
      `UPDATE organizations SET wonde_last_sync_at = ? WHERE id = ?`
    ).bind(new Date().toISOString(), orgId).run();

    // -----------------------------------------------------------------------
    // Step 7: Update sync log to completed
    // -----------------------------------------------------------------------
    await db.prepare(
      `UPDATE wonde_sync_log SET status = 'completed', completed_at = ?,
       students_created = ?, students_updated = ?, students_deactivated = ?,
       classes_created = ?, classes_updated = ?, employees_synced = ?
       WHERE id = ?`
    ).bind(
      new Date().toISOString(),
      counts.studentsCreated, counts.studentsUpdated, counts.studentsDeactivated,
      counts.classesCreated, counts.classesUpdated, counts.employeesSynced,
      syncId
    ).run();

    return {
      status: 'completed',
      syncId,
      ...counts
    };

  } catch (err) {
    // Update sync log to failed
    try {
      await db.prepare(
        `UPDATE wonde_sync_log SET status = 'failed', completed_at = ?, error_message = ?
         WHERE id = ?`
      ).bind(new Date().toISOString(), err.message, syncId).run();
    } catch {
      // Best-effort sync log update
    }

    return {
      status: 'failed',
      syncId,
      ...counts,
      errorMessage: err.message
    };
  }
}
