// jsPDF is ~190KB minified. It's only loaded when a user clicks "Export PDF",
// so the dynamic import below keeps the initial bundle free of it for the
// ~95% of sessions that never export.

// Brand colours
const SAGE_GREEN = [107, 142, 107]; // #6B8E6B
const DARK_GREEN = [75, 100, 75];
const CREAM = [253, 249, 241]; // #FDF9F1
const WHITE = [255, 255, 255];
const TEXT_PRIMARY = [51, 51, 51];
const TEXT_SECONDARY = [119, 119, 119];
const BORDER_COLOUR = [220, 215, 205];

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/**
 * Generate a branded PDF stats report for Tally Reading.
 *
 * @param {object} params
 * @param {string} params.schoolName
 * @param {string} params.periodLabel
 * @param {string|null} params.dateRange
 * @param {object} params.stats  – from /api/students/stats
 * @param {Array} params.topStreaks  – enriched with .name
 * @param {Array} params.needsAttention
 */
export async function generateStatsPDF({
  schoolName,
  className,
  periodLabel,
  dateRange,
  stats,
  topStreaks,
  needsAttention,
}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 0;

  // ── helpers ──────────────────────────────────────────────

  const ensureSpace = (needed) => {
    if (y + needed > PAGE_HEIGHT - 20) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const setFill = (rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const setTextCol = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const setDraw = (rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);

  const drawSectionTitle = (title) => {
    ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setTextCol(DARK_GREEN);
    doc.text(title.toUpperCase(), MARGIN, y + 4);
    y += 8;
    setDraw(BORDER_COLOUR);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
    y += 5;
  };

  const drawMetricBox = (x, w, label, value) => {
    setFill(WHITE);
    setDraw(BORDER_COLOUR);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, 22, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setTextCol(TEXT_SECONDARY);
    doc.text(label, x + w / 2, y + 7, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    setTextCol(TEXT_PRIMARY);
    doc.text(String(value), x + w / 2, y + 18, { align: 'center' });
  };

  const formatNumber = (n) => {
    if (n == null) return '0';
    return typeof n === 'number' && !Number.isInteger(n) ? n.toFixed(1) : String(n);
  };

  // ── 1. Header ─────────────────────────────────────────────

  // Full-width sage green header block
  setFill(SAGE_GREEN);
  doc.rect(0, 0, PAGE_WIDTH, 44, 'F');

  // Darker accent strip at top
  setFill(DARK_GREEN);
  doc.rect(0, 0, PAGE_WIDTH, 3, 'F');

  // "Tally Reading" branding — small, top-left
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextCol([200, 220, 200]); // muted light green
  doc.text('Tally Reading', MARGIN, 11);

  // School name — large and prominent
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  setTextCol(WHITE);
  doc.text(schoolName, MARGIN, 26);

  // Class name or "All Students" — below school name
  const subtitle = className || 'All Students';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  setTextCol([220, 235, 220]); // light green
  doc.text(subtitle, MARGIN, 36);

  // Period label — right-aligned
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setTextCol(WHITE);
  doc.text(periodLabel, PAGE_WIDTH - MARGIN, 26, { align: 'right' });

  // Date range — right-aligned below period
  if (dateRange) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setTextCol([220, 235, 220]);
    doc.text(dateRange, PAGE_WIDTH - MARGIN, 36, { align: 'right' });
  }

  y = 50;

  // Generated date — subtle, below header
  const generatedDate = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setTextCol(TEXT_SECONDARY);
  doc.text(`Generated ${generatedDate}`, PAGE_WIDTH - MARGIN, y, { align: 'right' });

  y += 6;

  // ── 3. Summary metrics (4 boxes) ─────────────────────────

  drawSectionTitle('Summary');

  const boxGap = 4;
  const boxW = (CONTENT_WIDTH - boxGap * 3) / 4;

  const summaryItems = [
    ['Students', formatNumber(stats.totalStudents)],
    ['Sessions', formatNumber(stats.totalSessions)],
    ['Avg / Student', formatNumber(stats.averageSessionsPerStudent)],
    ['Never Read', formatNumber(stats.studentsWithNoSessions)],
  ];

  summaryItems.forEach(([label, value], i) => {
    drawMetricBox(MARGIN + i * (boxW + boxGap), boxW, label, value);
  });

  y += 28;

  // ── 4. Activity section (2 columns) ──────────────────────

  drawSectionTitle('Activity');

  const colW = (CONTENT_WIDTH - boxGap) / 2;
  const halfBoxW = (colW - boxGap) / 2;

  // Left column: Home vs School
  const home = stats.locationDistribution?.home ?? 0;
  const school = stats.locationDistribution?.school ?? 0;
  drawMetricBox(MARGIN, halfBoxW, 'Home', formatNumber(home));
  drawMetricBox(MARGIN + halfBoxW + boxGap, halfBoxW, 'School', formatNumber(school));

  // Right column: This Week vs Last Week
  const thisWeek = stats.weeklyActivity?.thisWeek ?? 0;
  const lastWeek = stats.weeklyActivity?.lastWeek ?? 0;
  const rightStart = MARGIN + colW + boxGap;
  drawMetricBox(rightStart, halfBoxW, 'This Week', formatNumber(thisWeek));
  drawMetricBox(rightStart + halfBoxW + boxGap, halfBoxW, 'Last Week', formatNumber(lastWeek));

  y += 28;

  // ── 5. Reading by Day ────────────────────────────────────

  drawSectionTitle('Reading by Day');

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayData = stats.readingByDay || {};
  const dayW = (CONTENT_WIDTH - (days.length - 1) * 2) / days.length;
  const maxDay = Math.max(1, ...days.map((d) => dayData[d] || 0));
  const barMaxH = 18;

  days.forEach((day, i) => {
    const x = MARGIN + i * (dayW + 2);
    const count = dayData[day] || 0;
    const barH = (count / maxDay) * barMaxH;

    // Bar
    setFill(count > 0 ? SAGE_GREEN : BORDER_COLOUR);
    if (barH > 0.5) {
      doc.roundedRect(x + dayW * 0.15, y + (barMaxH - barH), dayW * 0.7, barH, 1, 1, 'F');
    }

    // Day label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setTextCol(TEXT_SECONDARY);
    doc.text(day, x + dayW / 2, y + barMaxH + 5, { align: 'center' });

    // Count
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setTextCol(TEXT_PRIMARY);
    doc.text(String(count), x + dayW / 2, y + barMaxH + 10, { align: 'center' });
  });

  y += barMaxH + 16;

  // ── 6. Streak Highlights (4 boxes) ───────────────────────

  drawSectionTitle('Streak Highlights');

  const streakItems = [
    ['Active Streaks', formatNumber(stats.studentsWithActiveStreak)],
    ['Best Current', formatNumber(stats.longestCurrentStreak)],
    ['All-Time', formatNumber(stats.longestEverStreak)],
    ['Average', formatNumber(stats.averageStreak)],
  ];

  streakItems.forEach(([label, value], i) => {
    drawMetricBox(MARGIN + i * (boxW + boxGap), boxW, label, value);
  });

  y += 28;

  // ── 7. Top Readers ───────────────────────────────────────

  const topReaders = (topStreaks || []).slice(0, 5);

  if (topReaders.length > 0) {
    drawSectionTitle('Top Readers');

    const tableX = MARGIN;
    const rankW = 12;
    const nameW = CONTENT_WIDTH - rankW - 35;
    const streakW = 35;
    const rowH = 7;

    // Header row
    setFill(CREAM);
    doc.rect(tableX, y, CONTENT_WIDTH, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setTextCol(DARK_GREEN);
    doc.text('#', tableX + 3, y + 5);
    doc.text('Name', tableX + rankW + 3, y + 5);
    doc.text('Current Streak', tableX + rankW + nameW + 3, y + 5);
    y += rowH;

    topReaders.forEach((reader, i) => {
      ensureSpace(rowH + 2);

      if (i % 2 === 0) {
        setFill(WHITE);
      } else {
        setFill(CREAM);
      }
      doc.rect(tableX, y, CONTENT_WIDTH, rowH, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setTextCol(TEXT_PRIMARY);
      doc.text(String(i + 1), tableX + 3, y + 5);
      doc.text(reader.name || 'Unknown', tableX + rankW + 3, y + 5);
      doc.text(`${reader.currentStreak || 0} days`, tableX + rankW + nameW + 3, y + 5);
      y += rowH;
    });

    // Bottom border
    setDraw(BORDER_COLOUR);
    doc.setLineWidth(0.3);
    doc.line(tableX, y, tableX + CONTENT_WIDTH, y);

    y += 6;
  }

  // ── 8. Most Read Books ───────────────────────────────────

  const mostRead = (stats.mostReadBooks || []).slice(0, 5);

  if (mostRead.length > 0) {
    drawSectionTitle('Most Read Books');

    const tableX = MARGIN;
    const rankW = 12;
    const titleW = CONTENT_WIDTH - rankW - 25;
    const sessionsW = 25;
    const rowH = 7;

    // Header row
    setFill(CREAM);
    doc.rect(tableX, y, CONTENT_WIDTH, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setTextCol(DARK_GREEN);
    doc.text('#', tableX + 3, y + 5);
    doc.text('Title', tableX + rankW + 3, y + 5);
    doc.text('Sessions', tableX + rankW + titleW + 3, y + 5);
    y += rowH;

    mostRead.forEach((book, i) => {
      ensureSpace(rowH + 2);

      if (i % 2 === 0) {
        setFill(WHITE);
      } else {
        setFill(CREAM);
      }
      doc.rect(tableX, y, CONTENT_WIDTH, rowH, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setTextCol(TEXT_PRIMARY);
      doc.text(String(i + 1), tableX + 3, y + 5);

      // Truncate long titles
      const maxTitleChars = 55;
      const title =
        (book.title || 'Untitled').length > maxTitleChars
          ? (book.title || 'Untitled').slice(0, maxTitleChars - 1) + '\u2026'
          : book.title || 'Untitled';
      doc.text(title, tableX + rankW + 3, y + 5);
      doc.text(String(book.count || 0), tableX + rankW + titleW + 3, y + 5);
      y += rowH;
    });

    // Bottom border
    setDraw(BORDER_COLOUR);
    doc.setLineWidth(0.3);
    doc.line(tableX, y, tableX + CONTENT_WIDTH, y);

    y += 6;
  }

  // ── 9. Needs Attention ───────────────────────────────────

  drawSectionTitle('Needs Attention');

  const attentionList = needsAttention || [];

  if (attentionList.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    setTextCol(TEXT_SECONDARY);
    doc.text('All students have been read with recently', MARGIN, y + 2);
    y += 8;
  } else {
    const tableX = MARGIN;
    const nameW = CONTENT_WIDTH - 35;
    const dateW = 35;
    const rowH = 7;

    // Header row
    setFill(CREAM);
    doc.rect(tableX, y, CONTENT_WIDTH, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setTextCol(DARK_GREEN);
    doc.text('Name', tableX + 3, y + 5);
    doc.text('Last Read', tableX + nameW + 3, y + 5);
    y += rowH;

    attentionList.forEach((student, i) => {
      ensureSpace(rowH + 2);

      if (i % 2 === 0) {
        setFill(WHITE);
      } else {
        setFill(CREAM);
      }
      doc.rect(tableX, y, CONTENT_WIDTH, rowH, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setTextCol(TEXT_PRIMARY);
      doc.text(student.name || 'Unknown', tableX + 3, y + 5);

      const lastRead = student.lastReadDate
        ? new Date(student.lastReadDate).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'Never';
      doc.text(lastRead, tableX + nameW + 3, y + 5);
      y += rowH;
    });

    // Bottom border
    setDraw(BORDER_COLOUR);
    doc.setLineWidth(0.3);
    doc.line(tableX, y, tableX + CONTENT_WIDTH, y);
  }

  // ── Footer ───────────────────────────────────────────────

  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setTextCol(TEXT_SECONDARY);
    doc.text(
      `Tally Reading  \u2022  ${schoolName}  \u2022  Page ${p} of ${pageCount}`,
      PAGE_WIDTH / 2,
      PAGE_HEIGHT - 8,
      { align: 'center' }
    );
  }

  // ── Save ─────────────────────────────────────────────────

  const filename = `tally-reading-report-${schoolName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
