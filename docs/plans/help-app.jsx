const { useState, useEffect, useMemo, useRef } = React;

/* ==================================================================
   DATA
================================================================== */

const CATEGORIES = [
  {
    id: 'getting-started',
    title: 'Getting started',
    blurb: 'Set up your school, invite teachers, add classes & students.',
    accent: 'sage',
    icon: 'sprout',
    articles: [
      { id: 'first-login', title: 'Your first login', minutes: 2 },
      { id: 'invite-teachers', title: 'Inviting teachers and admins', minutes: 3 },
      { id: 'create-classes', title: 'Creating classes', minutes: 2 },
      { id: 'add-students', title: 'Adding students one by one', minutes: 3 },
      { id: 'bulk-import', title: 'Bulk-importing students from a spreadsheet', minutes: 5 },
    ],
  },
  {
    id: 'reading-sessions',
    title: 'Reading sessions',
    blurb: 'Log sessions, run the home reading register, and track progress.',
    accent: 'coral',
    icon: 'book',
    articles: [
      { id: 'log-session', title: 'Logging a one-to-one reading session', minutes: 3 },
      { id: 'home-register', title: 'Using the Home Reading Register', minutes: 4 },
      { id: 'session-notes', title: 'Writing useful session notes', minutes: 2 },
      { id: 'view-history', title: 'Viewing a student\u2019s reading history', minutes: 2 },
    ],
  },
  {
    id: 'books-library',
    title: 'Books & library',
    blurb: 'Import your library, scan ISBNs, and curate book lists.',
    accent: 'amber',
    icon: 'shelf',
    articles: [
      { id: 'import-books', title: 'Importing your book library (CSV)', minutes: 5 },
      { id: 'isbn-scan', title: 'Adding books by scanning ISBNs', minutes: 3 },
      { id: 'reading-levels', title: 'Setting reading-level ranges', minutes: 3 },
      { id: 'recommendations', title: 'How book recommendations work', minutes: 4 },
    ],
  },
  {
    id: 'accounts-access',
    title: 'Accounts & access',
    blurb: 'Roles, passwords, and managing who can see what.',
    accent: 'sky',
    icon: 'key',
    articles: [
      { id: 'roles', title: 'Admin, teacher and owner roles explained', minutes: 3 },
      { id: 'reset-password', title: 'Resetting your password', minutes: 1 },
      { id: 'multi-school', title: 'Working across multiple schools', minutes: 3 },
      { id: 'remove-user', title: 'Removing a user', minutes: 1 },
    ],
  },
  {
    id: 'school-it',
    title: 'For school IT',
    blurb: 'Whitelisting, browser support, and network requirements.',
    accent: 'sage',
    icon: 'shield',
    articles: [
      { id: 'whitelist', title: 'Whitelisting tallyreading.uk on school networks', minutes: 2 },
      { id: 'browsers', title: 'Supported browsers', minutes: 1 },
      { id: 'gdpr', title: 'GDPR, data processing & privacy', minutes: 4 },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    blurb: 'Quick fixes for common bumps in the road.',
    accent: 'coral',
    icon: 'wrench',
    articles: [
      { id: 'connection-private', title: '"Your connection isn\u2019t private" error', minutes: 2 },
      { id: 'class-missing', title: 'A teacher can\u2019t see their class', minutes: 2 },
      { id: 'login-loop', title: 'Stuck on the login screen', minutes: 2 },
      { id: 'export-data', title: 'Exporting and backing up your data', minutes: 3 },
    ],
  },
];

const FAQS = [
  {
    q: 'How long does it take to set up a school?',
    a: 'Most schools are up and running in under thirty minutes. The longest single step is usually importing students \u2014 if you have a class list as a spreadsheet, our import wizard handles the rest.',
  },
  {
    q: 'Do teachers need to install anything?',
    a: 'No. Tally Reading runs entirely in the browser. Any modern browser works \u2014 Chrome, Edge or Safari are recommended. There are no plugins, extensions, or apps to install.',
  },
  {
    q: 'Can parents and volunteers use Tally too?',
    a: 'Yes. Reading volunteers can be invited as teachers and given access only to the children they read with. We\u2019re also working on a lighter-touch parent view \u2014 if you\u2019d like to be on the waiting list, drop us a line.',
  },
  {
    q: 'Where is our data stored?',
    a: 'All school data is stored in the UK on Cloudflare\u2019s European infrastructure. We\u2019re a UK-registered company and act as your data processor under a standard DPA. Full details live in our GDPR pack.',
  },
  {
    q: 'Can we trial Tally before committing?',
    a: 'Absolutely. New schools get a free 30-day trial with no card required. We\u2019ll help you get set up on a short call so you\u2019re not figuring it out alone.',
  },
  {
    q: 'What does it cost?',
    a: 'Pricing is per-school, per-year, and scales with the number of pupils. Small primaries start around \u00a3120 a year. Get in touch for a quote that fits your setting.',
  },
];

const POPULAR = [
  { cat: 'getting-started', id: 'bulk-import', title: 'Bulk-importing students from a spreadsheet' },
  { cat: 'school-it', id: 'whitelist', title: 'Whitelisting tallyreading.uk on school networks' },
  { cat: 'reading-sessions', id: 'home-register', title: 'Using the Home Reading Register' },
  { cat: 'books-library', id: 'isbn-scan', title: 'Adding books by scanning ISBNs' },
];

/* ==================================================================
   ICONS — simple, consistent stroke iconography
================================================================== */

const Icon = ({ name, size = 20, stroke = 1.6 }) => {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (name) {
    case 'search':  return (<svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>);
    case 'sprout':  return (<svg {...common}><path d="M12 20v-8"/><path d="M12 12c0-3 2-5 5-5-1 4-3 5-5 5Z"/><path d="M12 14c0-3-2-5-5-5 1 4 3 5 5 5Z"/></svg>);
    case 'book':    return (<svg {...common}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z"/><path d="M4 19a2 2 0 0 1 2-2h13"/></svg>);
    case 'shelf':   return (<svg {...common}><rect x="3" y="4" width="3" height="14"/><rect x="7.5" y="6" width="3" height="12"/><rect x="12" y="3" width="3" height="15"/><path d="M16 9h5v9h-5z"/><path d="M3 20h18"/></svg>);
    case 'key':     return (<svg {...common}><circle cx="8" cy="14" r="4"/><path d="m11 11 9-9"/><path d="m17 5 3 3"/><path d="m15 7 3 3"/></svg>);
    case 'shield':  return (<svg {...common}><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>);
    case 'wrench':  return (<svg {...common}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5Z"/></svg>);
    case 'arrow':   return (<svg {...common}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>);
    case 'chevron': return (<svg {...common}><path d="m6 9 6 6 6-6"/></svg>);
    case 'clock':   return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>);
    case 'mail':    return (<svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>);
    case 'message': return (<svg {...common}><path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z"/></svg>);
    case 'video':   return (<svg {...common}><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>);
    case 'sparkle': return (<svg {...common}><path d="M12 3v6"/><path d="M12 15v6"/><path d="M3 12h6"/><path d="M15 12h6"/><path d="m6 6 3 3"/><path d="m15 15 3 3"/><path d="m6 18 3-3"/><path d="m15 9 3-3"/></svg>);
    case 'check':   return (<svg {...common}><path d="m5 13 4 4 10-10"/></svg>);
    case 'close':   return (<svg {...common}><path d="m6 6 12 12"/><path d="m18 6-12 12"/></svg>);
    default: return null;
  }
};

/* ==================================================================
   STYLES (component-scoped)
================================================================== */

const HS = {
  page: {
    minHeight: '100vh',
    paddingLeft: 0,
  },

  // ── Spine: vertical bookshelf strip on the left
  spine: {
    position: 'fixed',
    top: 0, left: 0, bottom: 0,
    width: 14,
    background: 'linear-gradient(180deg, #B8976A 0%, #C4A882 25%, #A0845C 50%, #C4A882 75%, #B8976A 100%)',
    borderRight: '2px solid rgba(80, 60, 40, 0.25)',
    boxShadow: 'inset -2px 0 4px rgba(0,0,0,0.15), 2px 0 8px rgba(0,0,0,0.04)',
    zIndex: 40,
  },

  // ── Nav
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    backdropFilter: 'blur(14px)',
    background: 'rgba(251, 247, 240, 0.85)',
    borderBottom: '1px solid var(--hairline)',
  },
  navInner: {
    maxWidth: 1240,
    margin: '0 auto',
    padding: '18px 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 24,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontFamily: 'Fraunces, serif',
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: '-0.02em',
  },
  brandMark: {
    width: 34, height: 34,
    background: 'var(--sage)',
    borderRadius: 9,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'white',
    boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset, 0 4px 10px rgba(107,143,107,0.3)',
  },
  navCrumbs: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 13.5, color: 'var(--muted)',
  },
  navActions: {
    display: 'flex', alignItems: 'center', gap: 14,
  },

  // ── Hero
  hero: {
    position: 'relative',
    padding: '72px 32px 56px',
    textAlign: 'center',
    overflow: 'hidden',
  },
  heroInner: {
    maxWidth: 780, margin: '0 auto', position: 'relative',
  },
  eyebrow: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 14px',
    background: 'var(--sage-soft)',
    color: 'var(--sage-deep)',
    border: '1px solid rgba(107,143,107,0.18)',
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 600,
    letterSpacing: '0.02em',
    marginBottom: 22,
  },
  heroTitle: {
    fontSize: 'clamp(2.2rem, 4.4vw, 3.2rem)',
    fontWeight: 500,
    marginBottom: 14,
    textWrap: 'balance',
  },
  heroSerifAccent: {
    fontStyle: 'italic',
    fontWeight: 400,
    color: 'var(--sage-dark)',
  },
  heroSub: {
    fontSize: 17,
    color: 'var(--muted)',
    maxWidth: 560,
    margin: '0 auto 32px',
    lineHeight: 1.6,
    textWrap: 'pretty',
  },

  // ── Search
  searchWrap: {
    position: 'relative',
    maxWidth: 580,
    margin: '0 auto',
  },
  searchBox: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '6px 6px 6px 22px',
    background: 'var(--paper)',
    borderRadius: 999,
    border: '1px solid var(--hairline)',
    boxShadow: '0 1px 2px rgba(45,42,38,0.04), 0 12px 32px rgba(45,42,38,0.06)',
  },
  searchIcon: { color: 'var(--muted-light)', flexShrink: 0 },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 16,
    color: 'var(--ink)',
    padding: '12px 0',
  },
  searchKbd: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11.5,
    color: 'var(--muted)',
    background: 'var(--cream-deep)',
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--hairline)',
    marginRight: 4,
  },
  searchBtn: {
    background: 'var(--sage)',
    color: 'white',
    padding: '12px 20px',
    borderRadius: 999,
    fontWeight: 600,
    fontSize: 14,
    display: 'flex', alignItems: 'center', gap: 8,
    transition: 'all 0.2s',
  },

  // popular row
  popularRow: {
    marginTop: 24,
    display: 'flex', justifyContent: 'center',
    flexWrap: 'wrap', gap: 8,
    fontSize: 13,
  },
  popularLabel: { color: 'var(--muted)', alignSelf: 'center', marginRight: 4 },
  popularChip: {
    padding: '6px 12px',
    background: 'var(--paper)',
    border: '1px solid var(--hairline)',
    borderRadius: 999,
    color: 'var(--ink-soft)',
    fontWeight: 500,
    transition: 'all 0.2s',
  },

  // ── Quick actions strip
  actionsStrip: {
    maxWidth: 1100,
    margin: '32px auto 16px',
    padding: '0 32px',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 14,
  },
  actionCard: {
    background: 'var(--paper)',
    border: '1px solid var(--hairline)',
    borderRadius: 14,
    padding: '18px 22px',
    display: 'flex', alignItems: 'center', gap: 14,
    transition: 'all 0.25s',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  },
  actionIconBox: {
    width: 42, height: 42, borderRadius: 11,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  actionTitle: { fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' },
  actionSub: { fontSize: 12.5, color: 'var(--muted)', marginTop: 2 },

  // ── Main split
  body: {
    maxWidth: 1240,
    margin: '0 auto',
    padding: '40px 32px 80px',
    display: 'grid',
    gridTemplateColumns: '240px 1fr',
    gap: 56,
    alignItems: 'start',
  },
  side: {
    position: 'sticky',
    top: 92,
  },
  sideTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--muted-light)',
    marginBottom: 14,
    paddingLeft: 14,
  },
  sideList: {
    listStyle: 'none',
    display: 'flex', flexDirection: 'column',
    gap: 2,
  },
  sideItem: {
    padding: '9px 14px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--ink-soft)',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 10,
    transition: 'all 0.18s',
    border: '1px solid transparent',
  },
  sideItemActive: {
    background: 'var(--sage-soft)',
    color: 'var(--sage-deep)',
    border: '1px solid rgba(107,143,107,0.18)',
  },
  sideDot: {
    width: 6, height: 6, borderRadius: 3,
    background: 'currentColor',
    opacity: 0.5,
  },

  // ── Sections / cards
  sectionHead: {
    display: 'flex', alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  sectionEyebrow: {
    fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: 'var(--muted-light)',
  },
  sectionTitle: {
    fontSize: 28, fontWeight: 500, marginTop: 4,
  },
  sectionBlurb: {
    color: 'var(--muted)', fontSize: 15, marginTop: 6,
    maxWidth: 540,
  },

  catCard: {
    background: 'var(--paper)',
    border: '1px solid var(--hairline)',
    borderRadius: 18,
    padding: '24px 26px',
    transition: 'all 0.25s',
    position: 'relative',
    overflow: 'hidden',
  },
  catIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  catTitle: {
    fontSize: 19, fontWeight: 500, marginBottom: 6,
    fontFamily: 'Fraunces, serif',
    letterSpacing: '-0.01em',
  },
  catBlurb: { fontSize: 13.5, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.55 },
  catList: {
    listStyle: 'none',
    display: 'flex', flexDirection: 'column',
    gap: 2,
    borderTop: '1px solid var(--hairline-soft)',
    paddingTop: 12,
  },
  articleRow: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
    cursor: 'pointer',
    fontSize: 14,
    color: 'var(--ink-soft)',
    transition: 'color 0.18s',
    gap: 12,
  },
  articleMeta: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11.5,
    color: 'var(--muted-light)',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  },

  catGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 18,
  },

  // ── FAQ
  faqWrap: {
    background: 'var(--paper)',
    border: '1px solid var(--hairline)',
    borderRadius: 18,
    overflow: 'hidden',
  },
  faqItem: {
    borderBottom: '1px solid var(--hairline-soft)',
  },
  faqQ: {
    width: '100%',
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 26px',
    fontSize: 15.5,
    fontWeight: 500,
    textAlign: 'left',
    color: 'var(--ink)',
    transition: 'background 0.18s',
  },
  faqA: {
    padding: '0 26px 22px',
    color: 'var(--muted)',
    fontSize: 14.5,
    lineHeight: 1.65,
    maxWidth: 720,
  },

  // ── Contact card
  contactCard: {
    marginTop: 56,
    background: 'linear-gradient(135deg, #F2F6EE 0%, #FBF7F0 50%, #FDF0EA 100%)',
    border: '1px solid var(--hairline)',
    borderRadius: 22,
    padding: '40px 44px',
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 32,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  contactCardTitle: {
    fontSize: 26,
    fontWeight: 500,
    marginBottom: 8,
    fontFamily: 'Fraunces, serif',
  },
  contactCardSub: {
    color: 'var(--ink-soft)',
    fontSize: 15,
    maxWidth: 460,
    lineHeight: 1.6,
  },
  contactBtns: {
    display: 'flex', gap: 10,
    flexShrink: 0,
  },
  btnPrimary: {
    background: 'var(--sage-deep)',
    color: 'white',
    padding: '13px 22px',
    borderRadius: 12,
    fontWeight: 600,
    fontSize: 14,
    display: 'inline-flex', alignItems: 'center', gap: 8,
    transition: 'all 0.2s',
  },
  btnGhost: {
    background: 'rgba(255,255,255,0.7)',
    color: 'var(--ink)',
    padding: '13px 22px',
    borderRadius: 12,
    fontWeight: 600,
    fontSize: 14,
    border: '1px solid var(--hairline)',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  },

  // ── Footer
  footer: {
    borderTop: '1px solid var(--hairline)',
    padding: '36px 32px',
    color: 'var(--muted)',
    fontSize: 13,
  },
  footerInner: {
    maxWidth: 1240,
    margin: '0 auto',
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', flexWrap: 'wrap', gap: 16,
  },
  footerLinks: {
    display: 'flex', gap: 22,
  },

  // ── Modal
  modalBackdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(45, 42, 38, 0.4)',
    backdropFilter: 'blur(4px)',
    zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  modal: {
    background: 'var(--paper)',
    borderRadius: 20,
    width: '100%',
    maxWidth: 540,
    padding: 36,
    boxShadow: '0 30px 60px rgba(0,0,0,0.2)',
    position: 'relative',
  },
  modalClose: {
    position: 'absolute', top: 16, right: 16,
    width: 36, height: 36, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--muted)',
  },
  field: {
    display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14,
  },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' },
  input: {
    padding: '12px 14px',
    border: '1px solid var(--hairline)',
    background: 'var(--cream)',
    borderRadius: 10,
    fontSize: 14.5,
    color: 'var(--ink)',
    outline: 'none',
  },
  textarea: {
    padding: '12px 14px',
    border: '1px solid var(--hairline)',
    background: 'var(--cream)',
    borderRadius: 10,
    fontSize: 14.5,
    color: 'var(--ink)',
    outline: 'none',
    resize: 'vertical',
    minHeight: 110,
    fontFamily: 'inherit',
  },
};

/* ==================================================================
   ACCENT TOKENS
================================================================== */
const ACCENTS = {
  sage:  { bg: 'var(--sage-soft)',  fg: 'var(--sage-dark)',  bd: 'rgba(107,143,107,0.22)',  iconBg: 'var(--sage-light)',  iconFg: 'var(--sage-deep)' },
  coral: { bg: 'var(--coral-light)',fg: 'var(--coral-dark)', bd: 'rgba(196,124,90,0.22)',   iconBg: 'var(--coral-soft)',  iconFg: 'var(--coral-dark)' },
  amber: { bg: 'var(--amber-light)',fg: 'var(--amber-dark)', bd: 'rgba(201,168,76,0.28)',   iconBg: 'var(--amber-soft)',  iconFg: 'var(--amber-dark)' },
  sky:   { bg: 'var(--sky-light)',  fg: 'var(--sky-dark)',   bd: 'rgba(123,175,212,0.28)',  iconBg: 'var(--sky-soft)',    iconFg: 'var(--sky-dark)' },
};

/* ==================================================================
   SUBCOMPONENTS
================================================================== */

function Nav({ onContact }) {
  return (
    <header style={HS.nav}>
      <div style={HS.navInner}>
        <a href="#" style={HS.brand}>
          <span style={HS.brandMark}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h7v16H4z"/>
              <path d="M11 4h7l2 16h-9z"/>
            </svg>
          </span>
          <span>Tally Reading</span>
        </a>

        <div style={HS.navCrumbs}>
          <a href="#" style={{ color: 'var(--muted)' }}>Home</a>
          <span style={{ opacity: 0.4 }}>/</span>
          <span style={{ color: 'var(--ink)', fontWeight: 500 }}>Help centre</span>
        </div>

        <div style={HS.navActions}>
          <a href="#" style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>Status</a>
          <button
            onClick={onContact}
            style={{ ...HS.btnPrimary, padding: '9px 16px', fontSize: 13.5, background: 'var(--sage)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sage-dark)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--sage)'; }}
          >
            <Icon name="message" size={15} /> Contact us
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({ query, setQuery, onPopular }) {
  const inputRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <section style={HS.hero}>
      {/* gentle decorative arc */}
      <svg
        aria-hidden
        style={{ position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)', opacity: 0.5, pointerEvents: 'none' }}
        width="900" height="400" viewBox="0 0 900 400" fill="none"
      >
        <ellipse cx="450" cy="200" rx="440" ry="180" stroke="rgba(107,143,107,0.1)" />
        <ellipse cx="450" cy="200" rx="360" ry="140" stroke="rgba(196,124,90,0.08)" />
        <ellipse cx="450" cy="200" rx="280" ry="100" stroke="rgba(201,168,76,0.08)" />
      </svg>

      <div style={HS.heroInner}>
        <div style={HS.eyebrow}>
          <Icon name="sparkle" size={13} /> Help centre
        </div>
        <h1 style={HS.heroTitle}>
          How can we{' '}
          <span style={HS.heroSerifAccent}>help</span> today?
        </h1>
        <p style={HS.heroSub}>
          Guides, troubleshooting and quick answers for teachers, admins and IT &mdash;
          everything you need to keep readers turning pages.
        </p>

        <div style={HS.searchWrap}>
          <div style={HS.searchBox}>
            <span style={HS.searchIcon}><Icon name="search" size={20} /></span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={'Search articles, e.g. \u201cimport students\u201d or \u201cwhitelist\u201d'}
              style={HS.searchInput}
            />
            <span style={HS.searchKbd}>{'\u2318 K'}</span>
            <button
              style={HS.searchBtn}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sage-dark)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--sage)'; }}
            >
              Search <Icon name="arrow" size={15} />
            </button>
          </div>

          <div style={HS.popularRow}>
            <span style={HS.popularLabel}>Popular:</span>
            {POPULAR.map((p) => (
              <button
                key={p.id}
                onClick={() => onPopular(p.cat, p.id)}
                style={HS.popularChip}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--cream-deep)';
                  e.currentTarget.style.borderColor = 'rgba(107,143,107,0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--paper)';
                  e.currentTarget.style.borderColor = 'var(--hairline)';
                }}
              >
                {p.title}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionsStrip({ onContact }) {
  const items = [
    { icon: 'video',  accent: 'coral', title: 'Watch the 3-min tour', sub: 'See Tally in action' },
    { icon: 'mail',   accent: 'sage',  title: 'Email a human', sub: 'help@tallyreading.uk', onClick: onContact },
    { icon: 'sparkle',accent: 'amber', title: 'Book a setup call', sub: 'We\u2019ll walk you through it' },
  ];
  return (
    <div style={HS.actionsStrip}>
      {items.map((it) => {
        const a = ACCENTS[it.accent];
        return (
          <button
            key={it.title}
            onClick={it.onClick}
            style={HS.actionCard}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              e.currentTarget.style.borderColor = a.bd;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = 'var(--hairline)';
            }}
          >
            <div style={{ ...HS.actionIconBox, background: a.iconBg, color: a.iconFg }}>
              <Icon name={it.icon} size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={HS.actionTitle}>{it.title}</div>
              <div style={HS.actionSub}>{it.sub}</div>
            </div>
            <Icon name="arrow" size={16} />
          </button>
        );
      })}
    </div>
  );
}

function SideNav({ active, onPick }) {
  return (
    <aside style={HS.side}>
      <div style={HS.sideTitle}>Topics</div>
      <ul style={HS.sideList}>
        {CATEGORIES.map((c) => {
          const isActive = active === c.id;
          return (
            <li key={c.id}>
              <button
                onClick={() => onPick(c.id)}
                style={{
                  ...HS.sideItem,
                  ...(isActive ? HS.sideItemActive : {}),
                  width: '100%', textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--cream-deep)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ ...HS.sideDot, color: `var(--${c.accent === 'sky' ? 'sky' : c.accent})` }}></span>
                {c.title}
              </button>
            </li>
          );
        })}
      </ul>

      <div style={{ marginTop: 28, padding: 16, background: 'var(--cream-deep)', border: '1px solid var(--hairline)', borderRadius: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>Status</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-soft)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: '#69A269', boxShadow: '0 0 0 3px rgba(105,162,105,0.2)' }}></span>
          All systems normal
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted-light)', marginTop: 6 }}>Updated 4 mins ago</div>
      </div>
    </aside>
  );
}

function CategoryCard({ cat, onArticle }) {
  const a = ACCENTS[cat.accent];
  const [hover, setHover] = useState(false);
  return (
    <article
      id={cat.id}
      style={{
        ...HS.catCard,
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: hover ? 'translateY(-2px)' : 'none',
        borderColor: hover ? a.bd : 'var(--hairline)',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* corner flourish */}
      <div aria-hidden style={{
        position: 'absolute', top: -32, right: -32, width: 110, height: 110,
        borderRadius: '50%', background: a.iconBg, opacity: 0.5, pointerEvents: 'none',
      }} />

      <div style={{ ...HS.catIconWrap, background: a.iconBg, color: a.iconFg, position: 'relative' }}>
        <Icon name={cat.icon} size={22} stroke={1.7} />
      </div>
      <h3 style={HS.catTitle}>{cat.title}</h3>
      <p style={HS.catBlurb}>{cat.blurb}</p>

      <ul style={HS.catList}>
        {cat.articles.map((art) => (
          <li key={art.id}>
            <button
              onClick={() => onArticle(cat.id, art.id)}
              style={{ ...HS.articleRow, width: '100%' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = a.fg; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-soft)'; }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Icon name="arrow" size={13} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.title}</span>
              </span>
              <span style={HS.articleMeta}>
                <Icon name="clock" size={11} /> {art.minutes} min
              </span>
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}

function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <div style={HS.faqWrap}>
      {FAQS.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={i} style={{ ...HS.faqItem, borderBottom: i === FAQS.length - 1 ? 'none' : HS.faqItem.borderBottom }}>
            <button
              onClick={() => setOpen(isOpen ? -1 : i)}
              style={{ ...HS.faqQ, background: isOpen ? 'var(--cream)' : 'transparent' }}
              onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = 'var(--cream)'; }}
              onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
            >
              <span>{f.q}</span>
              <span style={{
                color: 'var(--muted)',
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.25s',
                display: 'inline-flex',
              }}>
                <Icon name="chevron" size={18} />
              </span>
            </button>
            {isOpen && (
              <div style={HS.faqA}>{f.a}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContactCard({ onContact }) {
  return (
    <section style={HS.contactCard}>
      {/* decorative corner */}
      <div aria-hidden style={{
        position: 'absolute', bottom: -60, right: -40, width: 200, height: 200,
        borderRadius: '50%', background: 'rgba(107,143,107,0.08)', pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'absolute', top: -40, right: 80, width: 80, height: 80,
        borderRadius: '50%', background: 'rgba(196,124,90,0.12)', pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative' }}>
        <div style={{ ...HS.eyebrow, background: 'rgba(255,255,255,0.7)', color: 'var(--sage-deep)' }}>
          <Icon name="message" size={13} /> Still need a hand?
        </div>
        <h2 style={HS.contactCardTitle}>
          Talk to a real person &mdash; usually within an hour.
        </h2>
        <p style={HS.contactCardSub}>
          We&rsquo;re a small UK team and we read every message. Tell us what you&rsquo;re
          stuck on and we&rsquo;ll get back to you with a fix, a workaround, or a friendly nudge.
        </p>
      </div>

      <div style={HS.contactBtns}>
        <button
          onClick={onContact}
          style={HS.btnPrimary}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ink)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--sage-deep)'; }}
        >
          <Icon name="message" size={16} /> Send a message
        </button>
        <a href="mailto:help@tallyreading.uk" style={HS.btnGhost}>
          <Icon name="mail" size={16} /> Email
        </a>
      </div>
    </section>
  );
}

function ContactModal({ open, onClose }) {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  useEffect(() => {
    if (!open) { setSent(false); setForm({ name: '', email: '', subject: '', message: '' }); }
  }, [open]);

  if (!open) return null;
  return (
    <div style={HS.modalBackdrop} onClick={onClose}>
      <div style={HS.modal} onClick={(e) => e.stopPropagation()}>
        <button
          style={HS.modalClose}
          onClick={onClose}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--cream-deep)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        ><Icon name="close" size={18} /></button>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'var(--sage-light)', color: 'var(--sage-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 18px',
            }}>
              <Icon name="check" size={28} stroke={2} />
            </div>
            <h3 style={{ fontSize: 22, marginBottom: 8 }}>Message on its way</h3>
            <p style={{ color: 'var(--muted)', fontSize: 14.5, maxWidth: 360, margin: '0 auto 22px' }}>
              We&rsquo;ll be back in touch shortly. Meanwhile, you&rsquo;ll find a confirmation in your inbox.
            </p>
            <button
              onClick={onClose}
              style={{ ...HS.btnPrimary, background: 'var(--sage)' }}
            >Close</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 22 }}>
              <div style={{ ...HS.eyebrow, marginBottom: 12 }}>
                <Icon name="message" size={13} /> Get in touch
              </div>
              <h3 style={{ fontSize: 22, marginBottom: 6 }}>How can we help?</h3>
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>
                The more detail the better &mdash; school name, what you tried, and any screenshots help us help you faster.
              </p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={HS.field}>
                  <label style={HS.label}>Your name</label>
                  <input style={HS.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div style={HS.field}>
                  <label style={HS.label}>Email</label>
                  <input type="email" style={HS.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
              </div>
              <div style={HS.field}>
                <label style={HS.label}>Subject</label>
                <input style={HS.input} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
              </div>
              <div style={HS.field}>
                <label style={HS.label}>Message</label>
                <textarea style={HS.textarea} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 12 }}>
                <span style={{ fontSize: 12.5, color: 'var(--muted-light)' }}>
                  We aim to reply within an hour during UK school hours.
                </span>
                <button type="submit" style={{ ...HS.btnPrimary, background: 'var(--sage)' }}>
                  Send message <Icon name="arrow" size={15} />
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ==================================================================
   APP
================================================================== */

function App() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('getting-started');
  const [contactOpen, setContactOpen] = useState(false);

  // filtered cats based on query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES
      .map((c) => ({
        ...c,
        articles: c.articles.filter((a) =>
          a.title.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.blurb.toLowerCase().includes(q)
        ),
      }))
      .filter((c) => c.articles.length > 0);
  }, [query]);

  // scroll-spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    document.querySelectorAll('article[id]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [filtered]);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const handlePopular = (catId) => {
    scrollTo(catId);
  };

  return (
    <div style={HS.page}>
      <Nav onContact={() => setContactOpen(true)} />

      <Hero query={query} setQuery={setQuery} onPopular={handlePopular} />

      <ActionsStrip onContact={() => setContactOpen(true)} />

      <div style={HS.body}>
        <SideNav active={active} onPick={scrollTo} />

        <main>
          <div style={HS.sectionHead}>
            <div>
              <div style={HS.sectionEyebrow}>Browse by topic</div>
              <h2 style={HS.sectionTitle}>
                {query ? `Results for "${query}"` : 'Find your way around'}
              </h2>
              <p style={HS.sectionBlurb}>
                {query
                  ? `${filtered.reduce((n, c) => n + c.articles.length, 0)} article${filtered.reduce((n, c) => n + c.articles.length, 0) === 1 ? '' : 's'} matched.`
                  : 'Six topics, plain English, with a real human at the end of every one.'}
              </p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ background: 'var(--paper)', border: '1px dashed var(--hairline)', borderRadius: 16, padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8, color: 'var(--muted-light)' }}>
                <Icon name="search" size={32} />
              </div>
              <h3 style={{ fontSize: 18, marginBottom: 6 }}>No articles match &ldquo;{query}&rdquo;</h3>
              <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
                Try a different word, or send us a message and we&rsquo;ll write the missing guide.
              </p>
              <button
                onClick={() => setContactOpen(true)}
                style={{ ...HS.btnPrimary, background: 'var(--sage)' }}
              >Ask us instead <Icon name="arrow" size={15} /></button>
            </div>
          ) : (
            <div style={HS.catGrid}>
              {filtered.map((cat) => (
                <CategoryCard key={cat.id} cat={cat} onArticle={() => {}} />
              ))}
            </div>
          )}

          {/* FAQ */}
          <div style={{ marginTop: 64 }}>
            <div style={HS.sectionHead}>
              <div>
                <div style={HS.sectionEyebrow}>Frequently asked</div>
                <h2 style={HS.sectionTitle}>Quick answers</h2>
              </div>
            </div>
            <FAQ />
          </div>

          <ContactCard onContact={() => setContactOpen(true)} />
        </main>
      </div>

      <footer style={HS.footer}>
        <div style={HS.footerInner}>
          <span>&copy; 2026 Tally Reading &middot; Made with care in the UK</span>
          <div style={HS.footerLinks}>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Cookies</a>
            <a href="#">Status</a>
          </div>
        </div>
      </footer>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
