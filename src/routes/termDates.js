import { Hono } from 'hono';
import { requireAdmin, requireReadonly } from '../middleware/tenant';
import { getDB } from '../utils/routeHelpers';
import { badRequestError } from '../middleware/errorHandler';

const termDatesRouter = new Hono();

const TERM_NAMES = ['Autumn 1', 'Autumn 2', 'Spring 1', 'Spring 2', 'Summer 1', 'Summer 2'];

function getCurrentAcademicYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 7) {
    return `${year}/${String(year + 1).slice(2)}`;
  }
  return `${year - 1}/${String(year).slice(2)}`;
}

termDatesRouter.get('/', requireReadonly(), async (c) => {
  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const academicYear = c.req.query('year') || getCurrentAcademicYear();

  const result = await db
    .prepare(
      `SELECT term_name, term_order, start_date, end_date
     FROM term_dates
     WHERE organization_id = ? AND academic_year = ?
     ORDER BY term_order`
    )
    .bind(organizationId, academicYear)
    .all();

  const terms = (result.results || []).map((row) => ({
    termName: row.term_name,
    termOrder: row.term_order,
    startDate: row.start_date,
    endDate: row.end_date,
  }));

  return c.json({ academicYear, terms });
});

termDatesRouter.put('/', requireAdmin(), async (c) => {
  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const userId = c.get('userId');
  const body = await c.req.json();
  const { academicYear, terms } = body;

  if (!academicYear || typeof academicYear !== 'string' || !/^\d{4}\/\d{2}$/.test(academicYear)) {
    throw badRequestError('academicYear is required and must be in format YYYY/YY (e.g. 2025/26)');
  }

  if (!Array.isArray(terms)) {
    throw badRequestError('terms must be an array');
  }

  for (const term of terms) {
    if (!term.termName || !term.startDate || !term.endDate || term.termOrder == null) {
      throw badRequestError('Each term requires termName, termOrder, startDate, and endDate');
    }
    if (term.termOrder < 1 || term.termOrder > 6) {
      throw badRequestError('termOrder must be between 1 and 6');
    }
    if (!TERM_NAMES.includes(term.termName)) {
      throw badRequestError(`termName must be one of: ${TERM_NAMES.join(', ')}`);
    }
    if (term.startDate >= term.endDate) {
      throw badRequestError(`Start date must be before end date for ${term.termName}`);
    }
  }

  const sorted = [...terms].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let i = 1; i < sorted.length; i++) {
    // Terms can be back-to-back (start === prev end) but not overlapping
    if (sorted[i].startDate < sorted[i - 1].endDate) {
      throw badRequestError(
        `Term dates overlap: ${sorted[i - 1].termName} and ${sorted[i].termName}`
      );
    }
  }

  const deleteStmt = db
    .prepare(`DELETE FROM term_dates WHERE organization_id = ? AND academic_year = ?`)
    .bind(organizationId, academicYear);

  const insertStmts = terms.map((term) =>
    db
      .prepare(
        `INSERT INTO term_dates (id, organization_id, academic_year, term_name, term_order, start_date, end_date, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        organizationId,
        academicYear,
        term.termName,
        term.termOrder,
        term.startDate,
        term.endDate,
        userId
      )
  );

  await db.batch([deleteStmt, ...insertStmts]);

  return c.json({
    academicYear,
    terms: terms.map((t) => ({
      termName: t.termName,
      termOrder: t.termOrder,
      startDate: t.startDate,
      endDate: t.endDate,
    })),
  });
});

export { termDatesRouter };
