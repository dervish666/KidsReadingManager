import React from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import TallyLogo from './TallyLogo';

// Reusable styled table for consistent look across all sections
const PolicyTable = ({ headers, rows }) => (
  <TableContainer
    component={Paper}
    elevation={0}
    sx={{
      my: 2,
      border: '1px solid rgba(139, 115, 85, 0.15)',
      borderRadius: '12px',
      backgroundColor: 'rgba(255, 254, 249, 0.6)',
      overflow: 'auto',
    }}
  >
    <Table size="small">
      {headers && (
        <TableHead>
          <TableRow sx={{ backgroundColor: 'rgba(107, 142, 107, 0.08)' }}>
            {headers.map((header, i) => (
              <TableCell
                key={i}
                sx={{
                  fontWeight: 700,
                  color: 'text.primary',
                  borderBottom: '2px solid rgba(139, 115, 85, 0.15)',
                  whiteSpace: 'nowrap',
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '0.85rem',
                }}
              >
                {header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
      )}
      <TableBody>
        {rows.map((row, i) => (
          <TableRow
            key={i}
            sx={{
              '&:nth-of-type(even)': { backgroundColor: 'rgba(139, 115, 85, 0.03)' },
              '&:last-child td': { borderBottom: 0 },
            }}
          >
            {row.map((cell, j) => (
              <TableCell
                key={j}
                sx={{
                  borderBottom: '1px solid rgba(139, 115, 85, 0.08)',
                  color: 'text.primary',
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  verticalAlign: 'top',
                }}
              >
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);

// Section heading component
const SectionHeading = ({ children }) => (
  <Typography
    variant="h4"
    sx={{
      mt: 5,
      mb: 2,
      fontSize: { xs: '1.3rem', sm: '1.5rem' },
      color: 'text.primary',
    }}
  >
    {children}
  </Typography>
);

// Subsection heading component
const SubsectionHeading = ({ children }) => (
  <Typography
    variant="h5"
    sx={{
      mt: 3,
      mb: 1.5,
      fontSize: { xs: '1.1rem', sm: '1.2rem' },
      color: 'primary.dark',
    }}
  >
    {children}
  </Typography>
);

// Body text component
const BodyText = ({ children, sx = {} }) => (
  <Typography
    variant="body1"
    sx={{
      mb: 2,
      color: 'text.primary',
      lineHeight: 1.75,
      ...sx,
    }}
  >
    {children}
  </Typography>
);

const PrivacyPolicy = () => {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: 'background.default',
        py: { xs: 2, sm: 4 },
        px: { xs: 1, sm: 2 },
      }}
    >
      <Container maxWidth="md">
        {/* Back link and logo header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
          <Link
            href="/"
            underline="hover"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              color: 'primary.main',
              fontWeight: 600,
              fontFamily: '"DM Sans", sans-serif',
              fontSize: '0.95rem',
            }}
          >
            <ArrowBackIcon fontSize="small" />
            Back to Tally Reading
          </Link>
        </Box>

        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 5 },
            borderRadius: '16px',
            backgroundColor: 'rgba(255, 254, 249, 0.9)',
            border: '1px solid rgba(139, 115, 85, 0.1)',
            boxShadow: '0 8px 32px rgba(139, 115, 85, 0.08), 0 2px 8px rgba(0, 0, 0, 0.03)',
          }}
        >
          {/* Title block */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TallyLogo size={22} color="white" />
            </Box>
            <Typography
              variant="h3"
              sx={{
                fontSize: { xs: '1.6rem', sm: '2rem' },
                color: 'text.primary',
              }}
            >
              Privacy Policy
            </Typography>
          </Box>

          <Typography
            variant="body1"
            sx={{ color: '#8B7355', fontWeight: 600, mb: 0.5, fontFamily: '"DM Sans", sans-serif' }}
          >
            Tally (trading as Tally Reading)
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', mb: 3, fontFamily: '"DM Sans", sans-serif' }}
          >
            Last updated: 23 February 2026
          </Typography>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mb: 3 }} />

          {/* ============================================================ */}
          {/* Section 1: Who we are */}
          {/* ============================================================ */}
          <SectionHeading>1. Who we are</SectionHeading>

          <BodyText>
            Tally Reading (&ldquo;Tally&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;,
            &ldquo;our&rdquo;) provides a cloud-based reading management platform designed for
            UK primary schools. Schools use Tally to track pupil reading progress, manage book
            libraries, and optionally generate AI-powered book recommendations.
          </BodyText>

          <PolicyTable
            headers={['Detail', 'Value']}
            rows={[
              [<strong>Product name</strong>, 'Tally (trading as Tally Reading)'],
              [<strong>Website</strong>, <Link href="https://tallyreading.uk" target="_blank" rel="noopener" sx={{ color: 'primary.main' }}>https://tallyreading.uk</Link>],
              [<strong>Company name</strong>, 'Scratch IT LTD'],
              [<strong>Company number</strong>, '08151576'],
              [<strong>Registered address</strong>, '247 Bishopsworth Road, Bristol, BS13 7LH'],
              [<strong>Data Protection Officer</strong>, <span>Sam Castillo (<Link href="mailto:sam@tallyreading.uk" sx={{ color: 'primary.main' }}>sam@tallyreading.uk</Link>)</span>],
              [<strong>ICO registration number</strong>, 'ZC098130'],
            ]}
          />

          <SubsectionHeading>Controller and processor roles</SubsectionHeading>

          <BodyText>
            Under UK GDPR, each <strong>school</strong> that subscribes to Tally acts as the{' '}
            <strong>data controller</strong> for the personal data of its pupils, staff, and other
            users. Tally acts as a <strong>data processor</strong>, processing personal data on
            behalf of and under the instructions of each school. This relationship is governed by
            a separate Data Processing Agreement (DPA) between Tally and each subscribing school.
          </BodyText>

          <BodyText>
            Where Tally processes personal data for its own purposes (for example, managing school
            administrator accounts, billing, and maintaining the security of the platform), Tally
            acts as an independent data controller.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 2: What personal data we collect */}
          {/* ============================================================ */}
          <SectionHeading>2. What personal data we collect</SectionHeading>

          <BodyText>
            We collect and process different categories of personal data depending on your
            relationship with Tally.
          </BodyText>

          <SubsectionHeading>2.1 Pupil data (children)</SubsectionHeading>

          <BodyText>
            Schools enter the following data about their pupils into the platform:
          </BodyText>

          <PolicyTable
            headers={['Category', 'Data fields']}
            rows={[
              [<strong>Identity</strong>, 'First name, surname (or combined display name as entered by the school)'],
              [<strong>Reading profile</strong>, 'Minimum and maximum reading level (Accelerated Reader levels 1.0 to 13.0), age range'],
              [<strong>Preferences</strong>, 'Likes and dislikes (free-text lists), favourite genre preferences'],
              [<strong>Reading sessions</strong>, 'Date, duration, number of pages read, location (school or home), teacher assessment notes (free text), enjoyment rating (1 to 5), book read'],
              [<strong>Progress data</strong>, 'Current book, reading streak (current and longest), streak start date'],
              [<strong>Teacher notes</strong>, 'Free-text observations recorded by the teacher'],
              [<strong>Class membership</strong>, 'Assignment to one or more classes within the school'],
            ]}
          />

          <BodyText>
            <strong>Important:</strong> Tally does not knowingly collect pupil email addresses,
            dates of birth, home addresses, or photographs. Schools are responsible for ensuring
            that free-text fields (such as teacher notes, likes, and dislikes) do not contain
            inappropriate or excessive personal data.
          </BodyText>

          <SubsectionHeading>2.2 Staff user data (teachers, administrators)</SubsectionHeading>

          <PolicyTable
            headers={['Category', 'Data fields']}
            rows={[
              [<strong>Identity</strong>, 'Full name'],
              [<strong>Contact</strong>, 'Email address'],
              [<strong>Authentication</strong>, 'Password (stored as a salted hash using PBKDF2 with 100,000 iterations; the plaintext password is never stored or logged)'],
              [<strong>Role and organisation</strong>, 'Assigned role (owner, admin, teacher, or read-only), school/organisation membership'],
              [<strong>Activity</strong>, 'Login timestamps, last-active timestamps'],
            ]}
          />

          <SubsectionHeading>2.3 Technical and security data</SubsectionHeading>

          <PolicyTable
            headers={['Category', 'Data fields']}
            rows={[
              [<strong>Audit logs</strong>, 'IP address (derived from the cf-connecting-ip header provided by Cloudflare), user-agent string, action performed, entity affected, timestamp'],
              [<strong>Rate-limiting records</strong>, 'Hashed identifier, endpoint, timestamp (used to prevent brute-force attacks on authentication endpoints)'],
              [<strong>Request logs</strong>, 'Standard HTTP request metadata processed by Cloudflare in the course of delivering the service'],
            ]}
          />

          <SubsectionHeading>2.4 Data we do NOT collect</SubsectionHeading>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="We do not use analytics or tracking scripts (such as Google Analytics, Facebook Pixel, or similar)."
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="We do not serve advertising or share data with advertisers."
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="We do not collect biometric data."
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="We do not process special category data (as defined in Article 9 of UK GDPR) unless a school inadvertently enters such data into a free-text field."
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 3: Why we collect it (lawful basis) */}
          {/* ============================================================ */}
          <SectionHeading>3. Why we collect it (lawful basis)</SectionHeading>

          <BodyText>
            UK GDPR requires that every processing activity has a lawful basis. The table below
            sets out the lawful basis we rely on for each purpose.
          </BodyText>

          <PolicyTable
            headers={['Purpose', 'Data used', 'Lawful basis', 'Notes']}
            rows={[
              [
                'Providing the reading management service to schools',
                'Pupil data, staff user data',
                <strong>Article 6(1)(b) — Contract</strong>,
                'Processing is necessary to perform the contract between Tally and the subscribing school.',
              ],
              [
                'User authentication and session management',
                'Email, password hash, authentication tokens',
                <strong>Article 6(1)(b) — Contract</strong>,
                'Necessary to provide secure access to the service.',
              ],
              [
                'AI-powered book recommendations (optional)',
                'Pupil reading level, preferences, likes/dislikes, books read, genre preferences',
                <span><strong>Article 6(1)(b) — Contract</strong> with <strong>Article 6(1)(a) — Consent</strong> as a secondary basis at the school level</span>,
                'Schools actively opt in by configuring their own AI API keys. Individual recommendations are triggered by teacher action. See Section 5.2 for details.',
              ],
              [
                'Audit logging and security monitoring',
                'IP address, user-agent, action details',
                <strong>Article 6(1)(f) — Legitimate interests</strong>,
                'Our legitimate interest in maintaining the security and integrity of the platform and detecting unauthorised access.',
              ],
              [
                'Rate limiting on authentication endpoints',
                'Hashed IP/identifier, timestamp',
                <strong>Article 6(1)(f) — Legitimate interests</strong>,
                'Our legitimate interest in preventing brute-force attacks.',
              ],
              [
                'Sending password-reset and welcome emails',
                'Email address',
                <strong>Article 6(1)(b) — Contract</strong>,
                'Necessary to operate the account system.',
              ],
              [
                'Calculating and displaying reading streaks',
                'Reading session dates',
                <strong>Article 6(1)(b) — Contract</strong>,
                'Core product feature for tracking reading progress.',
              ],
              [
                'Platform improvement and bug fixing',
                'Aggregated, anonymised usage patterns',
                <strong>Article 6(1)(f) — Legitimate interests</strong>,
                'We do not use identifiable personal data for this purpose.',
              ],
            ]}
          />

          <BodyText>
            Where we rely on legitimate interests (Article 6(1)(f)), we have conducted a
            Legitimate Interests Assessment (LIA) and concluded that the processing is necessary
            and proportionate, and that it does not override the rights and freedoms of data
            subjects (including children).
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 4: Children's data */}
          {/* ============================================================ */}
          <SectionHeading>4. Children&rsquo;s data</SectionHeading>

          <BodyText>
            Tally processes personal data relating to children (typically aged 4 to 11 in UK
            primary schools). We take the following additional measures to protect children&rsquo;s
            data:
          </BodyText>

          <List component="ol" sx={{ pl: 2, '& > li': { mb: 1.5 } }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>Data minimisation.</strong> We collect only the data necessary to provide
                    the reading management service. We do not collect children&rsquo;s email addresses,
                    dates of birth, home addresses, photographs, or any direct contact information.
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>No direct relationship with children.</strong> Tally has no direct
                    relationship with pupils. All pupil data is entered and managed by school staff
                    (teachers and administrators). Children do not create accounts or log in to Tally.
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>School as controller.</strong> The school, as data controller, is
                    responsible for ensuring that it has a lawful basis for processing pupil data
                    (typically the public task basis under Article 6(1)(e) for maintained schools,
                    or legitimate interests under Article 6(1)(f) for academies and independent
                    schools) and for providing appropriate privacy information to parents and carers.
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>No profiling or automated decision-making with legal effects.</strong>{' '}
                    AI-powered book recommendations are optional suggestions for teachers and do not
                    constitute automated decision-making that produces legal effects or similarly
                    significant effects on children (Article 22 of UK GDPR).
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>No marketing to children.</strong> We never use pupil data for marketing
                    purposes.
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>Enhanced security.</strong> All pupil data is encrypted in transit (TLS)
                    and access is restricted to authorised staff within the pupil&rsquo;s own school
                    through organisational scoping and role-based access controls.
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>Age-appropriate considerations.</strong> We have designed the platform in
                    accordance with the ICO&rsquo;s Age Appropriate Design Code (Children&rsquo;s Code)
                    where applicable, recognising that children do not directly interact with the
                    service.
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 5: Who we share data with */}
          {/* ============================================================ */}
          <SectionHeading>5. Who we share data with</SectionHeading>

          <BodyText>
            We share personal data only with the third parties set out below, and only to the
            extent necessary for the stated purpose.
          </BodyText>

          <SubsectionHeading>5.1 Infrastructure provider — Cloudflare, Inc.</SubsectionHeading>

          <PolicyTable
            headers={['Detail', 'Value']}
            rows={[
              [<strong>Provider</strong>, 'Cloudflare, Inc. (US-headquartered, with UK/EU data regions available)'],
              [<strong>Services used</strong>, 'Workers (serverless compute), D1 (SQL database), KV (key-value storage), R2 (object storage), CDN, DNS, email routing'],
              [<strong>Data shared</strong>, 'All data processed by the platform passes through Cloudflare infrastructure'],
              [<strong>Safeguards</strong>, 'Cloudflare is certified under ISO 27001 and SOC 2 Type II. For international transfer safeguards, see Section 6.'],
              [<strong>Data region</strong>, 'D1 database located in Western Europe (Germany) with location_hint=weur and replication off. Workers compute and CDN operate globally. Cloudflare DPA v6.3 covers international transfers (EU SCCs + UK IDTA). Cloudflare is certified under the EU-US Data Privacy Framework + UK Extension.'],
            ]}
          />

          <SubsectionHeading>5.2 AI recommendation providers (optional, school-controlled)</SubsectionHeading>

          <PolicyTable
            headers={['Detail', 'Value']}
            rows={[
              [<strong>Providers</strong>, 'Anthropic (Claude), OpenAI, Google (Gemini) — at the school\'s choice'],
              [<strong>Activation</strong>, 'Schools must actively opt in by providing their own API key (BYOK model). The feature is disabled by default.'],
              [<strong>Data shared</strong>, <span>Pupil reading level, favourite genres, likes/dislikes, and a list of books previously read (title, author, genre). <strong>No directly identifying pupil data (such as names) is sent to AI providers.</strong></span>],
              [<strong>Purpose</strong>, 'Generating personalised book recommendations for the teacher to review'],
              [<strong>Safeguards</strong>, 'Each school controls whether to enable this feature and which provider to use. Schools provide their own API keys and are bound by their own agreements with the chosen AI provider.'],
            ]}
          />

          <BodyText sx={{ fontStyle: 'italic', fontSize: '0.875rem', color: 'text.secondary' }}>
            Updated 25 February 2026: Student names have been removed from all AI prompts.
            Only pseudonymised reading profile data is now sent to AI providers.
          </BodyText>

          <SubsectionHeading>5.3 OpenLibrary (Internet Archive)</SubsectionHeading>

          <PolicyTable
            headers={['Detail', 'Value']}
            rows={[
              [<strong>Provider</strong>, 'OpenLibrary / Internet Archive'],
              [<strong>Data shared</strong>, <span>Book metadata only (ISBN, title, author). <strong>No personal data is sent.</strong></span>],
              [<strong>Purpose</strong>, 'Looking up book cover images and supplementary book metadata (page count, publication year)'],
            ]}
          />

          <SubsectionHeading>5.4 Email provider</SubsectionHeading>

          <PolicyTable
            headers={['Detail', 'Value']}
            rows={[
              [<strong>Provider</strong>, 'Cloudflare Email Routing (covered under Cloudflare DPA)'],
              [<strong>Data shared</strong>, 'Staff user email addresses and email content (password-reset links, welcome messages)'],
              [<strong>Purpose</strong>, 'Transactional emails only (password resets, account invitations). No marketing emails are sent.'],
            ]}
          />

          <SubsectionHeading>5.5 No other sharing</SubsectionHeading>

          <BodyText>
            We do not sell personal data. We do not share personal data with advertisers, data
            brokers, social media platforms, or any other third parties beyond those listed above.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 6: International data transfers */}
          {/* ============================================================ */}
          <SectionHeading>6. International data transfers</SectionHeading>

          <BodyText>
            Tally&rsquo;s infrastructure is hosted on Cloudflare&rsquo;s global network.
            Cloudflare, Inc. is headquartered in the United States. Where personal data is
            transferred outside the United Kingdom, we rely on the following safeguards as
            required by Articles 44 to 49 of UK GDPR:
          </BodyText>

          <PolicyTable
            headers={['Transfer', 'Mechanism']}
            rows={[
              [
                <strong>Cloudflare (US-headquartered)</strong>,
                'Cloudflare DPA v6.3 (auto-applies with service agreement), incorporating EU SCCs and UK IDTA (Version B1.0). Cloudflare is certified under the EU-US Data Privacy Framework and UK Extension. D1 database is located in Western Europe (Germany).',
              ],
              [
                <span><strong>AI providers (US)</strong> — if enabled by the school</span>,
                'Schools that enable AI recommendations are responsible for ensuring that their use of the chosen AI provider complies with their own data transfer obligations. Tally facilitates the school\'s BYOK configuration but does not itself hold a contract with the AI provider on the school\'s behalf.',
              ],
            ]}
          />

          <BodyText>
            Cloudflare transfers are covered by the Cloudflare DPA v6.3 and EU-US Data Privacy
            Framework certification. AI provider transfers are the responsibility of the school as
            controller (BYOK model — schools hold their own agreements with AI providers).
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 7: How long we keep data (retention) */}
          {/* ============================================================ */}
          <SectionHeading>7. How long we keep data (retention)</SectionHeading>

          <BodyText>
            We retain personal data only for as long as necessary for the purpose for which it
            was collected, or as required by law.
          </BodyText>

          <PolicyTable
            headers={['Data category', 'Retention period', 'Rationale']}
            rows={[
              [
                <strong>Pupil data</strong>,
                'Retained while the school\'s subscription is active. Deleted within 90 days of subscription termination or upon school request.',
                'Necessary to provide the service. Schools may request earlier deletion at any time.',
              ],
              [
                <strong>Staff user accounts</strong>,
                'Retained while the school\'s subscription is active. Soft-deleted (deactivated) upon account removal; hard-deleted within 90 days of subscription termination.',
                'Necessary to provide access to the service.',
              ],
              [
                <strong>Audit logs</strong>,
                'IP addresses and user-agents automatically anonymised after 90 days. Audit trail (action, actor, timestamp) retained for 2 years, then automatically purged.',
                'Necessary for security monitoring and incident investigation.',
              ],
              [
                <strong>Rate-limiting records</strong>,
                'Automatically purged after 1 hour.',
                'Short-lived records used solely for brute-force prevention.',
              ],
              [
                <strong>Authentication tokens</strong>,
                'Access tokens: 15 minutes. Refresh tokens: 7 days. Password-reset links: 1 hour.',
                'Minimised to reduce risk of token theft.',
              ],
              [
                <strong>AI recommendation cache</strong>,
                '7 days in KV cache, then automatically expired.',
                'Temporary cache to avoid redundant API calls.',
              ],
              [
                <strong>Book cover image cache</strong>,
                'Cached in browser localStorage for 7 days. Cached in R2 object storage indefinitely (non-personal data: book cover images only).',
                'Performance optimisation. No personal data is stored in the cover cache.',
              ],
              [
                <strong>Cloudflare request logs</strong>,
                'Managed by Cloudflare in accordance with their data processing terms. Typically retained for a limited period (see Cloudflare\'s privacy policy).',
                'Infrastructure-level logging outside Tally\'s direct control.',
              ],
            ]}
          />

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 8: Your rights under UK GDPR */}
          {/* ============================================================ */}
          <SectionHeading>8. Your rights under UK GDPR</SectionHeading>

          <BodyText>
            Under the UK General Data Protection Regulation and the Data Protection Act 2018,
            data subjects have the following rights. The method for exercising each right depends
            on whether you are a school staff member or a parent/carer acting on behalf of a
            pupil.
          </BodyText>

          <PolicyTable
            headers={['Right', 'Description', 'How to exercise']}
            rows={[
              [
                <strong>Right of access</strong>,
                'You have the right to obtain confirmation of whether we process your personal data and, if so, to receive a copy of that data. (Article 15)',
                <span>Staff: contact <Link href="mailto:privacy@tallyreading.uk" sx={{ color: 'primary.main' }}>privacy@tallyreading.uk</Link>. Parents/carers: contact your child&rsquo;s school, which will liaise with Tally if needed.</span>,
              ],
              [
                <strong>Right to rectification</strong>,
                'You have the right to have inaccurate personal data corrected without undue delay. (Article 16)',
                'Staff can update their own name and email in the platform. For pupil data, contact the school.',
              ],
              [
                <strong>Right to erasure</strong>,
                'You have the right to request deletion of your personal data in certain circumstances. (Article 17)',
                <span>Staff: contact <Link href="mailto:privacy@tallyreading.uk" sx={{ color: 'primary.main' }}>privacy@tallyreading.uk</Link>. Parents/carers: contact the school. Schools can delete pupil records directly within the platform.</span>,
              ],
              [
                <strong>Right to restriction</strong>,
                'You have the right to request that we restrict processing of your personal data in certain circumstances. (Article 18)',
                <span>Contact <Link href="mailto:privacy@tallyreading.uk" sx={{ color: 'primary.main' }}>privacy@tallyreading.uk</Link> or the school.</span>,
              ],
              [
                <strong>Right to data portability</strong>,
                'You have the right to receive your personal data in a structured, commonly used, and machine-readable format. (Article 20)',
                <span>Schools can export pupil and reading data via CSV export from the platform. Staff can request their data by contacting <Link href="mailto:privacy@tallyreading.uk" sx={{ color: 'primary.main' }}>privacy@tallyreading.uk</Link>.</span>,
              ],
              [
                <strong>Right to object</strong>,
                'You have the right to object to processing based on legitimate interests. (Article 21)',
                <span>Contact <Link href="mailto:privacy@tallyreading.uk" sx={{ color: 'primary.main' }}>privacy@tallyreading.uk</Link>. We will cease processing unless we demonstrate compelling legitimate grounds.</span>,
              ],
              [
                <strong>Rights related to automated decision-making</strong>,
                'You have the right not to be subject to decisions based solely on automated processing that produce legal or similarly significant effects. (Article 22)',
                'AI book recommendations are advisory suggestions for teachers, not automated decisions. Teachers retain full discretion.',
              ],
            ]}
          />

          <SubsectionHeading>Exercising rights for children</SubsectionHeading>

          <BodyText>
            Because Tally does not have a direct relationship with pupils, requests concerning
            pupil data should be directed to the school in the first instance. The school, as
            data controller, is responsible for responding to data subject requests. Tally will
            assist the school in fulfilling such requests in accordance with our Data Processing
            Agreement.
          </BodyText>

          <SubsectionHeading>Response times</SubsectionHeading>

          <BodyText>
            We will respond to valid requests within one calendar month, as required by UK GDPR.
            This period may be extended by two further months where requests are complex or
            numerous, in which case we will inform you within the first month.
          </BodyText>

          <SubsectionHeading>Right to complain</SubsectionHeading>

          <BodyText>
            If you are dissatisfied with how your personal data has been handled, you have the
            right to lodge a complaint with the Information Commissioner&rsquo;s Office (ICO):
          </BodyText>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>Website:</strong>{' '}
                    <Link href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener" sx={{ color: 'primary.main' }}>
                      https://ico.org.uk/make-a-complaint/
                    </Link>
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary={<span><strong>Telephone:</strong> 0303 123 1113</span>}
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary={<span><strong>Post:</strong> Information Commissioner&rsquo;s Office, Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF</span>}
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 9: Cookies and client-side storage */}
          {/* ============================================================ */}
          <SectionHeading>9. Cookies and client-side storage</SectionHeading>

          <BodyText>
            Tally does not use third-party cookies, advertising cookies, or analytics cookies. We
            use only the following client-side storage mechanisms, all of which are strictly
            necessary for the operation of the service.
          </BodyText>

          <SubsectionHeading>9.1 Cookies</SubsectionHeading>

          <PolicyTable
            headers={['Name', 'Type', 'Purpose', 'Duration', 'Scope']}
            rows={[
              [
                <code style={{ backgroundColor: 'rgba(139, 115, 85, 0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem' }}>refresh_token</code>,
                'httpOnly, Secure (production), SameSite=Strict',
                'Stores the refresh token for maintaining authenticated sessions. Not accessible to JavaScript.',
                '7 days',
                'Path=/api/auth only',
              ],
            ]}
          />

          <SubsectionHeading>9.2 localStorage</SubsectionHeading>

          <PolicyTable
            headers={['Key', 'Purpose', 'Duration']}
            rows={[
              [
                <code style={{ backgroundColor: 'rgba(139, 115, 85, 0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem' }}>krm_auth_token</code>,
                'Stores the short-lived JWT access token for API authentication.',
                '15 minutes (token TTL; cleared on logout)',
              ],
              [
                <code style={{ backgroundColor: 'rgba(139, 115, 85, 0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem' }}>krm_user</code>,
                'Stores non-sensitive user profile data (name, email, role, organisation name) for UI display.',
                'Until logout',
              ],
              [
                <code style={{ backgroundColor: 'rgba(139, 115, 85, 0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem' }}>krm_auth_mode</code>,
                'Records whether the instance uses multi-tenant or legacy authentication.',
                'Until logout',
              ],
              [
                <code style={{ backgroundColor: 'rgba(139, 115, 85, 0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem' }}>bookCovers</code>,
                'Caches book cover image URLs to reduce network requests to the cover proxy.',
                '7 days (entries expire individually)',
              ],
            ]}
          />

          <SubsectionHeading>9.3 sessionStorage</SubsectionHeading>

          <PolicyTable
            headers={['Key', 'Purpose', 'Duration']}
            rows={[
              [
                <code style={{ backgroundColor: 'rgba(139, 115, 85, 0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem' }}>globalClassFilter</code>,
                'Remembers the currently selected class filter within the session.',
                'Until the browser tab is closed',
              ],
              [
                <code style={{ backgroundColor: 'rgba(139, 115, 85, 0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem' }}>recentlyAccessedStudents</code>,
                'Tracks recently viewed students for quick navigation.',
                'Until the browser tab is closed',
              ],
              [
                <code style={{ backgroundColor: 'rgba(139, 115, 85, 0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem' }}>markedPriorityStudents</code>,
                'Tracks students marked as priority within the current session.',
                'Until the browser tab is closed',
              ],
            ]}
          />

          <BodyText>
            All sessionStorage data is automatically cleared when the browser tab is closed and is
            never transmitted to the server.
          </BodyText>

          <SubsectionHeading>9.4 No consent banner required</SubsectionHeading>

          <BodyText>
            Because we do not use any non-essential cookies or tracking technologies, and all
            client-side storage listed above is strictly necessary for the service to function, a
            cookie consent banner is not required under the Privacy and Electronic Communications
            Regulations (PECR) 2003.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 10: Data security */}
          {/* ============================================================ */}
          <SectionHeading>10. Data security</SectionHeading>

          <BodyText>
            We implement appropriate technical and organisational measures to protect personal
            data, including:
          </BodyText>

          <PolicyTable
            headers={['Measure', 'Detail']}
            rows={[
              [<strong>Encryption in transit</strong>, 'All data transmitted between the user\'s browser and the Tally platform is encrypted using TLS (HTTPS).'],
              [<strong>Password security</strong>, 'Passwords are hashed using PBKDF2 with 100,000 iterations and a unique salt per account. Plaintext passwords are never stored or logged.'],
              [<strong>Token security</strong>, 'JWT access tokens have a 15-minute lifetime. Refresh tokens are stored in httpOnly cookies with Secure, SameSite=Strict, and Path-restricted attributes.'],
              [<strong>Multi-tenant isolation</strong>, 'All database queries are scoped to the requesting organisation. Pupils and staff from one school cannot access data belonging to another school.'],
              [<strong>Role-based access control</strong>, 'Four permission levels (owner, admin, teacher, read-only) restrict access to data and actions appropriate to each role.'],
              [<strong>Audit logging</strong>, 'Sensitive operations (user creation, modification, deletion, settings changes) are recorded in an audit log with timestamp, actor, action, and IP address.'],
              [<strong>Rate limiting</strong>, 'Authentication endpoints are rate-limited to mitigate brute-force and credential-stuffing attacks.'],
              [<strong>Soft deletion</strong>, 'User and organisation records are soft-deleted (deactivated) rather than immediately removed, preventing accidental data loss while supporting eventual hard deletion.'],
              [<strong>Minimal client-side data</strong>, 'Only essential data is stored in the browser. Sensitive tokens use httpOnly cookies inaccessible to JavaScript.'],
              [<strong>Infrastructure security</strong>, 'Hosted on Cloudflare\'s platform, which provides DDoS protection, Web Application Firewall (WAF), and is certified to ISO 27001, SOC 2 Type II, and PCI DSS.'],
            ]}
          />

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 11: Data Processing Agreement */}
          {/* ============================================================ */}
          <SectionHeading>11. Data Processing Agreement</SectionHeading>

          <BodyText>
            Each subscribing school enters into a Data Processing Agreement (DPA) with Tally, as
            required by Article 28 of UK GDPR. The DPA sets out:
          </BodyText>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText primary="The subject matter and duration of processing" primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }} />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText primary="The nature and purpose of processing" primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }} />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText primary="The types of personal data processed" primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }} />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText primary="The categories of data subjects" primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }} />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText primary="The obligations and rights of the controller (school) and processor (Tally)" primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }} />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText primary="Sub-processor approval and notification arrangements" primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }} />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText primary="Data breach notification obligations" primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }} />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText primary="Assistance with data subject rights requests" primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }} />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText primary="Data deletion or return upon termination" primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }} />
            </ListItem>
          </List>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 12: Changes to this policy */}
          {/* ============================================================ */}
          <SectionHeading>12. Changes to this policy</SectionHeading>

          <BodyText>
            We may update this privacy policy from time to time to reflect changes in our
            practices, technology, legal requirements, or other factors. When we make material
            changes:
          </BodyText>

          <List component="ol" sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.3, pl: 1 }}>
              <ListItemText
                primary={'We will update the "Last updated" date at the top of this policy.'}
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="We will notify subscribing schools by email at least 14 days before material changes take effect."
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="We will make the previous version available upon request."
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <BodyText>We encourage you to review this policy periodically.</BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 13: Contact us */}
          {/* ============================================================ */}
          <SectionHeading>13. Contact us</SectionHeading>

          <BodyText>
            If you have any questions about this privacy policy, your personal data, or our data
            protection practices, please contact us:
          </BodyText>

          <PolicyTable
            headers={['Channel', 'Detail']}
            rows={[
              [
                <strong>Email</strong>,
                <Link href="mailto:privacy@tallyreading.uk" sx={{ color: 'primary.main' }}>privacy@tallyreading.uk</Link>,
              ],
              [
                <strong>Post</strong>,
                'Scratch IT LTD, 247 Bishopsworth Road, Bristol, BS13 7LH',
              ],
              [
                <strong>Data Protection Lead</strong>,
                <span>Sam Castillo (<Link href="mailto:sam@tallyreading.uk" sx={{ color: 'primary.main' }}>sam@tallyreading.uk</Link>). Note: A formal DPO has not been appointed as Scratch IT LTD does not meet the mandatory appointment thresholds under Article 37 of UK GDPR. Sam Castillo acts as the named privacy contact for all data protection matters.</span>,
              ],
            ]}
          />

          <BodyText>
            For requests concerning pupil data, parents and carers should contact their
            child&rsquo;s school in the first instance. The school may then contact Tally to
            assist with the request.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Legal framework (unnumbered in source, follows as section 14) */}
          {/* ============================================================ */}
          <SectionHeading>Legal framework</SectionHeading>

          <BodyText>This privacy policy is made under and governed by:</BodyText>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    The <strong>UK General Data Protection Regulation</strong> (UK GDPR), as retained
                    in UK law by the European Union (Withdrawal) Act 2018 and amended by the Data
                    Protection, Privacy and Electronic Communications (Amendments etc.) (EU Exit)
                    Regulations 2019
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary={<span>The <strong>Data Protection Act 2018</strong></span>}
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary={<span>The <strong>Privacy and Electronic Communications Regulations 2003</strong> (PECR)</span>}
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <BodyText>
            References to &ldquo;UK GDPR&rdquo; throughout this policy mean the UK General Data
            Protection Regulation as described above.
          </BodyText>

          {/* Footer */}
          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 4, mb: 3 }} />

          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TallyLogo size={14} color="white" />
              </Box>
              <Typography
                variant="body2"
                sx={{ color: '#8B7355', fontWeight: 600, fontFamily: '"Nunito", sans-serif' }}
              >
                Tally Reading
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
              Scratch IT LTD &middot; Company 08151576 &middot; ICO ZC098130
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default PrivacyPolicy;
