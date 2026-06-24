// Catalogue of Tally's legal & compliance documents, surfaced at /legal.
//
// Two kinds of entry:
//  - type 'page':     a standalone React page already routed in App.js (e.g. /privacy).
//  - type 'markdown': rendered by LegalDocPage from public/legal/<file> at /legal/<slug>.
//
// The published markdown lives in public/legal/. Those are the public-facing
// versions; the fuller internal working documents live in docs/gdpr/.

export const LEGAL_GROUPS = [
  {
    key: 'policies',
    title: 'Policies',
    blurb: 'The everyday policies covering how the service works and how we handle data.',
    docs: [
      {
        slug: 'privacy',
        title: 'Privacy Policy',
        type: 'page',
        href: '/privacy',
        summary: 'How we collect, use and protect personal data on behalf of schools.',
      },
      {
        slug: 'terms',
        title: 'Terms of Service',
        type: 'page',
        href: '/terms',
        summary: 'The terms governing use of the Tally Reading service.',
      },
      {
        slug: 'cookies',
        title: 'Cookie Policy',
        type: 'page',
        href: '/cookies',
        summary: 'The cookies and local storage Tally uses, and why.',
      },
    ],
  },
  {
    key: 'compliance',
    title: 'Data protection & compliance',
    blurb:
      'Documents schools and their data protection officers can reference when assessing Tally as a processor (UK GDPR).',
    docs: [
      {
        slug: 'data-processing-agreement',
        title: 'Data Processing Agreement',
        type: 'markdown',
        file: 'data-processing-agreement.md',
        summary:
          'The Article 28 DPA between each school (controller) and Tally (processor), including security and sub-processor schedules.',
      },
      {
        slug: 'sub-processors',
        title: 'Sub-Processor Register',
        type: 'markdown',
        file: 'sub-processors.md',
        summary:
          'The third parties that help us deliver the service, what each processes, and where.',
      },
      {
        slug: 'security-measures',
        title: 'Security Measures',
        type: 'markdown',
        file: 'security-measures.md',
        summary: 'The technical and organisational measures protecting your data (Article 32).',
      },
      {
        slug: 'data-retention',
        title: 'Data Retention Policy',
        type: 'markdown',
        file: 'data-retention.md',
        summary: 'How long we keep each category of data, and how it is disposed of.',
      },
      {
        slug: 'data-subject-rights',
        title: 'Data Subject Rights',
        type: 'markdown',
        file: 'data-subject-rights.md',
        summary: 'How we support access, rectification, erasure and the other UK GDPR rights.',
      },
    ],
  },
];

// Flat list of all docs, in display order.
export const LEGAL_DOCS = LEGAL_GROUPS.flatMap((g) => g.docs);

// Resolve a markdown doc by its slug (returns undefined for unknown or 'page' slugs).
export const getMarkdownDoc = (slug) =>
  LEGAL_DOCS.find((d) => d.slug === slug && d.type === 'markdown');
