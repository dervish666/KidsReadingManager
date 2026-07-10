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
  fetchAllGroups,
  fetchDeletions,
} from '../utils/wondeApi.js';
import { syncUserClassAssignments } from '../utils/classAssignments.js';
import { assertBatchSize, D1_BATCH_LIMIT } from '../utils/d1Batch.js';

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
  const groupsData = wondeStudent.groups?.data;

  return {
    wondeStudentId: wondeStudent.id,
    name: `${wondeStudent.forename} ${wondeStudent.surname}`,
    yearGroup: educationData?.current_nc_year ?? null,
    senStatus: extendedData?.sen_status ?? null,
    pupilPremium: extendedData?.pupil_premium ? 1 : 0,
    ealStatus: extendedData?.eal_status ?? null,
    fsm: extendedData?.free_school_meals ? 1 : 0,
    dateOfBirth: wondeStudent.date_of_birth?.date
      ? wondeStudent.date_of_birth.date.split(' ')[0]
      : null,
    gender: wondeStudent.gender || null,
    firstLanguage: extendedData?.first_language || extendedData?.home_language || null,
    ealDetailedStatus: extendedData?.english_as_additional_language_status || null,
    wondeClassIds: Array.isArray(classesData) ? classesData.map((c) => c.id) : [],
    wondeRegistrationGroupIds: Array.isArray(groupsData)
      ? groupsData.filter((g) => g.type === 'REGISTRATION').map((g) => g.id)
      : [],
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
    name: wondeClass.name,
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
    wondeClassIds: Array.isArray(classesData) ? classesData.map((c) => c.id) : [],
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
 * @param {Object} [options.kv] - Optional KV binding (READING_MANAGER_KV) for per-org sync lock.
 *                                When provided, prevents overlapping sync for the same org.
 * @returns {Promise<Object>} Sync result with status and counts
 */
export async function runFullSync(orgId, schoolToken, wondeSchoolId, db, options = {}) {
  const syncId = crypto.randomUUID();
  const syncType = options.updatedAfter ? 'delta' : 'full';
  const now = new Date().toISOString();
  const kv = options.kv || null;
  const lockKey = `wondeSync:lock:${orgId}`;

  const counts = {
    studentsCreated: 0,
    studentsUpdated: 0,
    studentsDeactivated: 0,
    classesCreated: 0,
    classesUpdated: 0,
    employeesSynced: 0,
  };

  // Step 0: Acquire per-org sync lock (skip if another sync is in flight).
  // Lock TTL is 10 minutes — long enough for even the largest schools but short
  // enough that a stuck lock self-clears if the Worker dies mid-sync.
  if (kv) {
    try {
      const existing = await kv.get(lockKey);
      if (existing) {
        console.log(
          `[WondeSync] Skipping org ${orgId}: sync already in progress since ${existing}`
        );
        return {
          status: 'skipped',
          syncId: null,
          ...counts,
          errorMessage: 'Sync already in progress for this organization',
        };
      }
      await kv.put(lockKey, now, { expirationTtl: 600 });
    } catch (err) {
      // If the KV lookup fails, fall through rather than blocking the sync entirely.
      console.warn(`[WondeSync] Lock acquisition error for ${orgId}: ${err.message}`);
    }
  }

  // Step 1: Create sync log entry
  try {
    await db
      .prepare(
        `INSERT INTO wonde_sync_log (id, organization_id, sync_type, status, started_at)
       VALUES (?, ?, ?, 'running', ?)`
      )
      .bind(syncId, orgId, syncType, now)
      .run();
  } catch (err) {
    // If we can't even log, release the lock and return failed immediately
    if (kv)
      await kv
        .delete(lockKey)
        .catch((err) =>
          console.warn(
            `[WondeSync] Lock release failed for ${orgId} (self-clears in ≤10 min): ${err.message}`
          )
        );
    return {
      status: 'failed',
      syncId,
      ...counts,
      errorMessage: `Failed to create sync log: ${err.message}`,
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
    // Some MIS configurations (commonly primaries) expose no classes — the
    // form classes are published as Wonde REGISTRATION groups instead. Full
    // sync detects this and persists the source in org_settings so delta
    // syncs query the right endpoint without risking registration-group
    // noise in schools that have real classes.
    let classSource = 'classes';
    if (syncType === 'delta') {
      const sourceRow = await db
        .prepare(
          `SELECT setting_value FROM org_settings
         WHERE organization_id = ? AND setting_key = 'wondeClassSource'`
        )
        .bind(orgId)
        .first();
      if (sourceRow?.setting_value === 'groups') {
        classSource = 'groups';
      }
    }

    let wondeClasses;
    if (classSource === 'groups') {
      wondeClasses = await fetchAllGroups(schoolToken, wondeSchoolId, fetchOptions);
    } else {
      wondeClasses = await fetchAllClasses(schoolToken, wondeSchoolId, fetchOptions);
      if (syncType === 'full' && wondeClasses.length === 0) {
        const wondeGroups = await fetchAllGroups(schoolToken, wondeSchoolId, fetchOptions);
        if (wondeGroups.length > 0) {
          wondeClasses = wondeGroups;
          classSource = 'groups';
        }
      }
    }

    if (syncType === 'full') {
      await db
        .prepare(
          `INSERT INTO org_settings (id, organization_id, setting_key, setting_value)
         VALUES (?, ?, 'wondeClassSource', ?)
         ON CONFLICT(organization_id, setting_key) DO UPDATE SET
           setting_value = excluded.setting_value, updated_at = datetime('now')`
        )
        .bind(crypto.randomUUID(), orgId, classSource)
        .run();
    }

    // Batch-fetch existing classes to avoid N+1 queries
    const existingClassesResult = await db
      .prepare(`SELECT wonde_class_id, id, name FROM classes WHERE organization_id = ?`)
      .bind(orgId)
      .all();
    const existingClassMap = new Map(
      (existingClassesResult.results || []).map((r) => [r.wonde_class_id, r])
    );

    // Map wonde_class_id → tally class id. Seeded with all existing classes
    // so students can resolve classes not in this fetch (delta syncs only
    // return updated classes).
    const classLookup = new Map();
    for (const [wondeId, row] of existingClassMap) {
      if (wondeId) classLookup.set(wondeId, row.id);
    }
    const classStatements = [];

    for (const wc of wondeClasses) {
      const mapped = mapWondeClass(wc);
      const existing = existingClassMap.get(mapped.wondeClassId);

      if (existing) {
        // is_active = 1 self-heals a class the reconcile below deactivated
        // if the MIS later re-adds it (the MIS is the source of truth for
        // Wonde-linked classes).
        classStatements.push(
          db
            .prepare(
              `UPDATE classes SET name = ?, is_active = 1, updated_at = datetime('now') WHERE id = ?`
            )
            .bind(mapped.name, existing.id)
        );
        classLookup.set(mapped.wondeClassId, existing.id);
        counts.classesUpdated++;
      } else {
        const classId = crypto.randomUUID();
        classStatements.push(
          db
            .prepare(
              `INSERT INTO classes (id, organization_id, name, wonde_class_id, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
            )
            .bind(classId, orgId, mapped.name, mapped.wondeClassId)
        );
        classLookup.set(mapped.wondeClassId, classId);
        counts.classesCreated++;
      }
    }

    // Execute class upserts in batches of 100
    for (let i = 0; i < classStatements.length; i += D1_BATCH_LIMIT) {
      const chunk = classStatements.slice(i, i + D1_BATCH_LIMIT);
      assertBatchSize(chunk, 'wondeSync classes');
      await db.batch(chunk);
    }

    // Full-sync reconcile: deactivate Wonde-linked classes the MIS no longer
    // reports, so deleted classes/groups stop cluttering Manage Classes and
    // dropdowns. Full sync only — a delta legitimately omits unchanged
    // classes — and gated on a non-empty fetch so a failed/partial fetch
    // can't deactivate the whole school. Manually-created classes
    // (wonde_class_id IS NULL) are never touched.
    if (syncType === 'full' && wondeClasses.length > 0) {
      const seenWondeIds = new Set(wondeClasses.map((wc) => wc.id));
      const orphanedClassIds = (existingClassesResult.results || [])
        .filter((r) => r.wonde_class_id && !seenWondeIds.has(r.wonde_class_id))
        .map((r) => r.id);
      for (let i = 0; i < orphanedClassIds.length; i += D1_BATCH_LIMIT) {
        const chunk = orphanedClassIds.slice(i, i + D1_BATCH_LIMIT);
        const placeholders = chunk.map(() => '?').join(',');
        await db
          .prepare(
            `UPDATE classes SET is_active = 0, updated_at = datetime('now') WHERE id IN (${placeholders})`
          )
          .bind(...chunk)
          .run();
      }
      if (orphanedClassIds.length > 0) {
        console.log(
          `[WondeSync] Deactivated ${orphanedClassIds.length} classes no longer in Wonde for org ${orgId}`
        );
      }
    }

    // -----------------------------------------------------------------------
    // Step 3: Fetch students and deletions in parallel
    // (Employee-class mappings are built from wondeClasses in Step 4)
    // -----------------------------------------------------------------------
    const [wondeStudents, deletions] = await Promise.all([
      fetchAllStudents(schoolToken, wondeSchoolId, {
        ...fetchOptions,
        includeGroups: classSource === 'groups',
      }),
      fetchDeletions(schoolToken, wondeSchoolId, options.updatedAfter),
    ]);

    // Batch-fetch existing students and GDPR erased list to avoid N+1 queries
    const [existingStudentsResult, erasedRows] = await db.batch([
      db.prepare('SELECT wonde_student_id, id FROM students WHERE organization_id = ?').bind(orgId),
      db
        .prepare('SELECT wonde_student_id FROM wonde_erased_students WHERE organization_id = ?')
        .bind(orgId),
    ]);
    const existingStudentMap = new Map(
      (existingStudentsResult.results || []).map((r) => [r.wonde_student_id, r.id])
    );
    const erasedWondeIds = new Set((erasedRows.results || []).map((r) => r.wonde_student_id));

    const studentStatements = [];

    for (const ws of wondeStudents) {
      const mapped = mapWondeStudent(ws);

      // Skip students that were GDPR-erased (prevent re-creation from Wonde)
      if (erasedWondeIds.has(mapped.wondeStudentId)) {
        continue;
      }

      // Resolve class_id from first wondeClassId; group-sourced schools carry
      // the form class in registration groups instead
      const classCandidates =
        mapped.wondeClassIds.length > 0 ? mapped.wondeClassIds : mapped.wondeRegistrationGroupIds;
      const classId =
        classCandidates.length > 0 ? classLookup.get(classCandidates[0]) || null : null;

      const existingId = existingStudentMap.get(mapped.wondeStudentId);

      if (existingId) {
        studentStatements.push(
          db
            .prepare(
              `UPDATE students SET name = ?, class_id = ?, year_group = ?,
             sen_status = ?, pupil_premium = ?, eal_status = ?, fsm = ?,
             date_of_birth = ?, gender = ?, first_language = ?, eal_detailed_status = ?,
             is_active = 1, updated_at = datetime('now')
             WHERE id = ?`
            )
            .bind(
              mapped.name,
              classId,
              mapped.yearGroup,
              mapped.senStatus,
              mapped.pupilPremium,
              mapped.ealStatus,
              mapped.fsm,
              mapped.dateOfBirth,
              mapped.gender,
              mapped.firstLanguage,
              mapped.ealDetailedStatus,
              existingId
            )
        );
        counts.studentsUpdated++;
      } else {
        const studentId = crypto.randomUUID();
        studentStatements.push(
          db
            .prepare(
              `INSERT INTO students (id, organization_id, name, class_id, wonde_student_id,
             year_group, sen_status, pupil_premium, eal_status, fsm,
             date_of_birth, gender, first_language, eal_detailed_status,
             is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
            )
            .bind(
              studentId,
              orgId,
              mapped.name,
              classId,
              mapped.wondeStudentId,
              mapped.yearGroup,
              mapped.senStatus,
              mapped.pupilPremium,
              mapped.ealStatus,
              mapped.fsm,
              mapped.dateOfBirth,
              mapped.gender,
              mapped.firstLanguage,
              mapped.ealDetailedStatus
            )
        );
        counts.studentsCreated++;
      }
    }

    // Execute student upserts in batches of 100
    for (let i = 0; i < studentStatements.length; i += D1_BATCH_LIMIT) {
      const chunk = studentStatements.slice(i, i + D1_BATCH_LIMIT);
      assertBatchSize(chunk, 'wondeSync students');
      await db.batch(chunk);
    }

    // -----------------------------------------------------------------------
    // Step 4: Populate employee-class mappings
    // -----------------------------------------------------------------------
    // Build from classes data (which includes employees) — more reliable than
    // the employees endpoint which may not return classes.data consistently.
    //
    // Full sync: authoritative rebuild — org-wide DELETE then re-insert.
    // Delta sync: wondeClasses holds only the classes changed since the
    // watermark (often none), so an org-wide rebuild would wipe every
    // unchanged teacher→class mapping. Refresh only the classes present
    // in this delta and leave the rest untouched.
    const employeeStatements = [];
    const seenEmployeeIds = new Set();
    const refreshedClassIds = [];

    for (const wc of wondeClasses) {
      const employeesData = wc.employees?.data;
      if (!Array.isArray(employeesData)) continue;
      refreshedClassIds.push(wc.id);

      for (const emp of employeesData) {
        const mappingId = crypto.randomUUID();
        const empName = `${emp.forename || ''} ${emp.surname || ''}`.trim();
        employeeStatements.push(
          db
            .prepare(
              `INSERT INTO wonde_employee_classes (id, organization_id, wonde_employee_id, wonde_class_id, employee_name)
             VALUES (?, ?, ?, ?, ?)`
            )
            .bind(mappingId, orgId, emp.id, wc.id, empName)
        );
        seenEmployeeIds.add(emp.id);
      }
    }

    counts.employeesSynced = seenEmployeeIds.size;

    const deleteStatements = [];
    if (syncType === 'full') {
      deleteStatements.push(
        db.prepare(`DELETE FROM wonde_employee_classes WHERE organization_id = ?`).bind(orgId)
      );
    } else {
      const IN_CHUNK = 50;
      for (let i = 0; i < refreshedClassIds.length; i += IN_CHUNK) {
        const chunk = refreshedClassIds.slice(i, i + IN_CHUNK);
        const placeholders = chunk.map(() => '?').join(',');
        deleteStatements.push(
          db
            .prepare(
              `DELETE FROM wonde_employee_classes
               WHERE organization_id = ? AND wonde_class_id IN (${placeholders})`
            )
            .bind(orgId, ...chunk)
        );
      }
    }

    // Deletes lead so each batch clears before it re-inserts. A full sync with
    // zero employees still runs its lone DELETE to clear stale mappings; a
    // delta touching no classes runs nothing at all.
    const step4Statements = [...deleteStatements, ...employeeStatements];
    for (let i = 0; i < step4Statements.length; i += D1_BATCH_LIMIT) {
      const chunk = step4Statements.slice(i, i + D1_BATCH_LIMIT);
      assertBatchSize(chunk, 'wondeSync employee-classes');
      await db.batch(chunk);
    }

    // -----------------------------------------------------------------------
    // Step 4b: Refresh class_assignments for users with wonde_employee_ids
    // -----------------------------------------------------------------------
    // Skipped when a delta sync touched no class mappings — there is nothing
    // to re-derive, and running it for every user is D1 round-trips for free.
    const usersWithWonde =
      syncType === 'delta' && refreshedClassIds.length === 0
        ? { results: [] }
        : await db
            .prepare(
              'SELECT id, wonde_employee_id FROM users WHERE organization_id = ? AND wonde_employee_id IS NOT NULL AND is_active = 1'
            )
            .bind(orgId)
            .all();

    // Process class assignments concurrently in batches of 5
    const wondeUsers = usersWithWonde.results || [];
    const ASSIGN_CONCURRENCY = 5;
    for (let i = 0; i < wondeUsers.length; i += ASSIGN_CONCURRENCY) {
      const batch = wondeUsers.slice(i, i + ASSIGN_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((u) => syncUserClassAssignments(db, u.id, u.wonde_employee_id, orgId))
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'rejected') {
          console.warn(
            `[WondeSync] Could not sync class assignments for user ${batch[j].id}:`,
            results[j].reason?.message
          );
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 5: Process deletions (already fetched in parallel above)
    // -----------------------------------------------------------------------
    const deactivateStatements = [];
    for (const del of deletions) {
      if (!del.restored_at) {
        deactivateStatements.push(
          db
            .prepare(
              `UPDATE students SET is_active = 0, updated_at = datetime('now')
             WHERE wonde_student_id = ? AND organization_id = ?`
            )
            .bind(del.id, orgId)
        );
      }
    }
    for (let i = 0; i < deactivateStatements.length; i += D1_BATCH_LIMIT) {
      await db.batch(deactivateStatements.slice(i, i + D1_BATCH_LIMIT));
    }
    counts.studentsDeactivated = deactivateStatements.length;

    // -----------------------------------------------------------------------
    // Step 6: Update organization last sync timestamp
    // -----------------------------------------------------------------------
    await db
      .prepare(`UPDATE organizations SET wonde_last_sync_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), orgId)
      .run();

    // -----------------------------------------------------------------------
    // Step 7: Update sync log to completed
    // -----------------------------------------------------------------------
    await db
      .prepare(
        `UPDATE wonde_sync_log SET status = 'completed', completed_at = ?,
       students_created = ?, students_updated = ?, students_deactivated = ?,
       classes_created = ?, classes_updated = ?, employees_synced = ?
       WHERE id = ?`
      )
      .bind(
        new Date().toISOString(),
        counts.studentsCreated,
        counts.studentsUpdated,
        counts.studentsDeactivated,
        counts.classesCreated,
        counts.classesUpdated,
        counts.employeesSynced,
        syncId
      )
      .run();

    if (kv)
      await kv
        .delete(lockKey)
        .catch((err) =>
          console.warn(
            `[WondeSync] Lock release failed for ${orgId} (self-clears in ≤10 min): ${err.message}`
          )
        );
    return {
      status: 'completed',
      syncId,
      ...counts,
    };
  } catch (err) {
    // Update sync log to failed
    try {
      await db
        .prepare(
          `UPDATE wonde_sync_log SET status = 'failed', completed_at = ?, error_message = ?
         WHERE id = ?`
        )
        .bind(new Date().toISOString(), err.message, syncId)
        .run();
    } catch {
      // Best-effort sync log update
    }

    if (kv)
      await kv
        .delete(lockKey)
        .catch((err) =>
          console.warn(
            `[WondeSync] Lock release failed for ${orgId} (self-clears in ≤10 min): ${err.message}`
          )
        );
    return {
      status: 'failed',
      syncId,
      ...counts,
      errorMessage: err.message,
    };
  }
}
