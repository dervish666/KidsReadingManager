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
                  color: '#4A4A4A',
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
                  color: '#4A4A4A',
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
      color: '#4A4A4A',
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
      color: '#557055',
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
      color: '#4A4A4A',
      lineHeight: 1.75,
      ...sx,
    }}
  >
    {children}
  </Typography>
);

const TermsOfService = () => {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: '#F5F0E8',
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
              color: '#6B8E6B',
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
                color: '#4A4A4A',
              }}
            >
              Terms of Service
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
            sx={{ color: '#7A7A7A', mb: 3, fontFamily: '"DM Sans", sans-serif' }}
          >
            Last updated: 5 March 2026
          </Typography>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mb: 3 }} />

          {/* ============================================================ */}
          {/* Section 1: About these terms */}
          {/* ============================================================ */}
          <SectionHeading>1. About these terms</SectionHeading>

          <BodyText>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Tally
            Reading platform (&ldquo;Tally&rdquo;, &ldquo;the Service&rdquo;), operated by Scratch
            IT LTD (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), a company registered
            in England and Wales (company number 08151576), with registered address at 247
            Bishopsworth Road, Bristol, BS13 7LH.
          </BodyText>

          <BodyText>
            By accessing or using the Service, you agree to be bound by these Terms. If you are
            entering into these Terms on behalf of a school or organisation, you represent that you
            have the authority to bind that organisation.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 2: The Service */}
          {/* ============================================================ */}
          <SectionHeading>2. The Service</SectionHeading>

          <BodyText>
            Tally Reading is a cloud-based reading management platform designed for UK primary
            schools. The Service enables schools to:
          </BodyText>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="Track pupil reading progress and sessions"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="Manage book libraries with barcode scanning and metadata lookup"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="Generate AI-powered book recommendations (optional, requires API key)"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="Record home reading via a class register"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="Import pupil and class data via Wonde school integration"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="Export data for reporting purposes"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <BodyText>
            The Service is hosted on Cloudflare&rsquo;s edge infrastructure. Data is processed in
            accordance with our{' '}
            <Link href="/privacy" sx={{ color: '#6B8E6B' }}>Privacy Policy</Link> and, where
            applicable, the Data Processing Agreement between us and your school.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 3: Accounts and access */}
          {/* ============================================================ */}
          <SectionHeading>3. Accounts and access</SectionHeading>

          <SubsectionHeading>3.1 School accounts</SubsectionHeading>

          <BodyText>
            Schools access Tally through organisation accounts. Each school is set up either via the
            Wonde integration (automatic provisioning) or by manual registration.
          </BodyText>

          <SubsectionHeading>3.2 User roles</SubsectionHeading>

          <BodyText>
            The Service provides four user roles with different levels of access:
          </BodyText>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary={<span><strong>Owner</strong> — full system access across all organisations</span>}
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary={<span><strong>Admin</strong> — organisation-level management, user and teacher administration</span>}
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary={<span><strong>Teacher</strong> — manages students, classes, and reading sessions</span>}
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary={<span><strong>Read-only</strong> — view-only access to data within their organisation</span>}
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <SubsectionHeading>3.3 Authentication</SubsectionHeading>

          <BodyText>
            Users sign in via MyLogin single sign-on (SSO) provided through the Wonde platform, or
            via email and password. You are responsible for keeping your login credentials secure. You
            must notify us immediately if you become aware of any unauthorised use of your account.
          </BodyText>

          <SubsectionHeading>3.4 Acceptable use</SubsectionHeading>

          <BodyText>You agree not to:</BodyText>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="Share login credentials with unauthorised individuals"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="Attempt to access data belonging to other organisations"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="Use the Service for any purpose other than school reading management"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="Interfere with or disrupt the operation of the Service"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="Reverse-engineer, decompile, or attempt to extract the source code of the Service"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="Upload malicious content, including viruses or harmful code"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <BodyText>
            We may suspend or terminate your access if you breach these Terms.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 4: Data and privacy */}
          {/* ============================================================ */}
          <SectionHeading>4. Data and privacy</SectionHeading>

          <SubsectionHeading>4.1 School data</SubsectionHeading>

          <BodyText>
            Schools retain ownership of all data they input into the Service, including pupil
            records, reading sessions, and book library data.
          </BodyText>

          <SubsectionHeading>4.2 Roles under UK GDPR</SubsectionHeading>

          <BodyText>
            Each school acts as the <strong>data controller</strong> for the personal data of its
            pupils and staff. Tally acts as a <strong>data processor</strong>, processing data on
            behalf of and under the instructions of each school. This relationship is governed by a
            separate Data Processing Agreement (DPA).
          </BodyText>

          <SubsectionHeading>4.3 Children&rsquo;s data</SubsectionHeading>

          <BodyText>
            The Service processes data relating to children. We comply with the UK GDPR and the
            ICO&rsquo;s Age Appropriate Design Code (Children&rsquo;s Code) in our handling of this
            data. Pupils do not access the Service directly — all interactions are through school
            staff.
          </BodyText>

          <SubsectionHeading>4.4 Privacy Policy</SubsectionHeading>

          <BodyText>
            Full details of how we collect, use, store, and protect personal data are set out in
            our{' '}
            <Link href="/privacy" sx={{ color: '#6B8E6B' }}>Privacy Policy</Link>.
          </BodyText>

          <SubsectionHeading>4.5 Data export and deletion</SubsectionHeading>

          <BodyText>
            Schools may export their data at any time using the built-in export functionality. Upon
            termination of a school&rsquo;s subscription, data will be retained for 90 days (to
            allow recovery) and then permanently deleted in accordance with our Data Retention
            Policy.
          </BodyText>

          <BodyText>
            Schools may request immediate erasure of specific pupil or user data at any time, in
            accordance with UK GDPR Article 17 (right to erasure).
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 5: AI book recommendations */}
          {/* ============================================================ */}
          <SectionHeading>5. AI book recommendations</SectionHeading>

          <SubsectionHeading>5.1 Optional feature</SubsectionHeading>

          <BodyText>
            AI-powered book recommendations are an optional feature. Schools must provide their own
            API key from a supported AI provider (Anthropic, OpenAI, or Google) to use this feature.
          </BodyText>

          <SubsectionHeading>5.2 Data sent to AI providers</SubsectionHeading>

          <BodyText>
            When recommendations are generated, the Service sends the following to the configured AI
            provider:
          </BodyText>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="The pupil's reading level range and genre preferences"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="A selection of books from the school's library (titles, authors, levels)"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.3, pl: 1 }}>
              <ListItemText
                primary="The pupil's recent reading history (book titles only)"
                primaryTypographyProps={{ color: '#4A4A4A', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <BodyText>
            <strong>No pupil names, dates of birth, or other identifying information are sent to AI
            providers.</strong> See our{' '}
            <Link href="/privacy" sx={{ color: '#6B8E6B' }}>Privacy Policy</Link> and DPIA for full
            details.
          </BodyText>

          <SubsectionHeading>5.3 AI provider terms</SubsectionHeading>

          <BodyText>
            Use of AI recommendations is also subject to the terms of your chosen AI provider. We
            are not responsible for the processing of data by third-party AI providers once it
            leaves our platform.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 6: Wonde and MyLogin integration */}
          {/* ============================================================ */}
          <SectionHeading>6. Wonde and MyLogin integration</SectionHeading>

          <SubsectionHeading>6.1 Data sync</SubsectionHeading>

          <BodyText>
            Schools that use the Wonde integration authorise Tally to receive pupil, class, and
            staff data from their Management Information System (MIS) via the Wonde API. This sync
            is governed by the school&rsquo;s existing agreement with Wonde and the DPA between the
            school and Tally.
          </BodyText>

          <SubsectionHeading>6.2 Single sign-on</SubsectionHeading>

          <BodyText>
            MyLogin SSO is provided by Wonde. When staff sign in via MyLogin, we receive their
            name, email address, and role from MyLogin&rsquo;s OAuth2 profile. We do not receive or
            store MyLogin passwords.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 7: Service availability and support */}
          {/* ============================================================ */}
          <SectionHeading>7. Service availability and support</SectionHeading>

          <SubsectionHeading>7.1 Availability</SubsectionHeading>

          <BodyText>
            We aim to keep the Service available at all times but do not guarantee uninterrupted
            access. The Service may be temporarily unavailable for maintenance, updates, or due to
            circumstances beyond our control (including Cloudflare infrastructure issues).
          </BodyText>

          <SubsectionHeading>7.2 Support</SubsectionHeading>

          <BodyText>
            Support is available via email at{' '}
            <Link href="mailto:sam@tallyreading.uk" sx={{ color: '#6B8E6B' }}>
              sam@tallyreading.uk
            </Link>
            . We will make reasonable efforts to respond to support requests promptly.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 8: Intellectual property */}
          {/* ============================================================ */}
          <SectionHeading>8. Intellectual property</SectionHeading>

          <SubsectionHeading>8.1 Our IP</SubsectionHeading>

          <BodyText>
            The Service, including its design, code, branding, and documentation, is owned by
            Scratch IT LTD and protected by copyright and other intellectual property laws. These
            Terms do not transfer any ownership rights to you.
          </BodyText>

          <SubsectionHeading>8.2 Your data</SubsectionHeading>

          <BodyText>
            You retain all rights to the data you input into the Service. We do not claim ownership
            of school data. We will not use school data for any purpose other than providing the
            Service, except as required by law.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 9: Limitation of liability */}
          {/* ============================================================ */}
          <SectionHeading>9. Limitation of liability</SectionHeading>

          <SubsectionHeading>9.1 Service provided &ldquo;as is&rdquo;</SubsectionHeading>

          <BodyText>
            The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis.
            To the maximum extent permitted by law, we disclaim all warranties, express or implied,
            including implied warranties of merchantability, fitness for a particular purpose, and
            non-infringement.
          </BodyText>

          <SubsectionHeading>9.2 Limitation</SubsectionHeading>

          <BodyText>
            To the maximum extent permitted by law, Scratch IT LTD shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages, or any loss of data,
            revenue, or profits, arising out of or in connection with your use of the Service.
          </BodyText>

          <BodyText>
            Our total liability for any claim arising from or related to these Terms shall not exceed
            the total fees paid by you to us in the twelve (12) months preceding the claim.
          </BodyText>

          <SubsectionHeading>9.3 Exceptions</SubsectionHeading>

          <BodyText>
            Nothing in these Terms limits or excludes liability for: (a) death or personal injury
            caused by negligence; (b) fraud or fraudulent misrepresentation; or (c) any other
            liability that cannot be limited or excluded under applicable law.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 10: Subscription and payment */}
          {/* ============================================================ */}
          <SectionHeading>10. Subscription and payment</SectionHeading>

          <SubsectionHeading>10.1 Pricing</SubsectionHeading>

          <BodyText>
            The Service is offered on a monthly subscription basis. Current pricing is available on
            request. We offer a one-month free trial for new schools.
          </BodyText>

          <SubsectionHeading>10.2 Changes to pricing</SubsectionHeading>

          <BodyText>
            We will give at least 30 days&rsquo; written notice of any changes to pricing. Changes
            will take effect at the start of the next billing period following the notice.
          </BodyText>

          <SubsectionHeading>10.3 Cancellation</SubsectionHeading>

          <BodyText>
            Schools may cancel their subscription at any time. Access continues until the end of the
            current billing period. Data export is available before and after cancellation (for up
            to 90 days).
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 11: Changes to these Terms */}
          {/* ============================================================ */}
          <SectionHeading>11. Changes to these Terms</SectionHeading>

          <BodyText>
            We may update these Terms from time to time. We will notify registered users of material
            changes by email at least 14 days before they take effect. Continued use of the Service
            after changes take effect constitutes acceptance of the updated Terms.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 12: Termination */}
          {/* ============================================================ */}
          <SectionHeading>12. Termination</SectionHeading>

          <SubsectionHeading>12.1 By you</SubsectionHeading>

          <BodyText>
            You may stop using the Service and request account deletion at any time by contacting
            us at{' '}
            <Link href="mailto:sam@tallyreading.uk" sx={{ color: '#6B8E6B' }}>
              sam@tallyreading.uk
            </Link>
            .
          </BodyText>

          <SubsectionHeading>12.2 By us</SubsectionHeading>

          <BodyText>
            We may suspend or terminate your access to the Service if you breach these Terms, if
            required by law, or if we cease to offer the Service. We will provide reasonable notice
            where practicable.
          </BodyText>

          <SubsectionHeading>12.3 Effect of termination</SubsectionHeading>

          <BodyText>
            On termination, your right to use the Service ceases immediately. We will retain your
            data for 90 days to allow export, after which it will be permanently deleted.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 13: General */}
          {/* ============================================================ */}
          <SectionHeading>13. General</SectionHeading>

          <SubsectionHeading>13.1 Governing law</SubsectionHeading>

          <BodyText>
            These Terms are governed by the laws of England and Wales. Any disputes shall be subject
            to the exclusive jurisdiction of the courts of England and Wales.
          </BodyText>

          <SubsectionHeading>13.2 Entire agreement</SubsectionHeading>

          <BodyText>
            These Terms, together with our{' '}
            <Link href="/privacy" sx={{ color: '#6B8E6B' }}>Privacy Policy</Link> and any applicable
            Data Processing Agreement, constitute the entire agreement between you and us regarding
            your use of the Service.
          </BodyText>

          <SubsectionHeading>13.3 Severability</SubsectionHeading>

          <BodyText>
            If any provision of these Terms is found to be unenforceable, the remaining provisions
            shall continue in full force and effect.
          </BodyText>

          <SubsectionHeading>13.4 No waiver</SubsectionHeading>

          <BodyText>
            Our failure to enforce any provision of these Terms shall not constitute a waiver of
            that provision.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 14: Contact us */}
          {/* ============================================================ */}
          <SectionHeading>14. Contact us</SectionHeading>

          <BodyText>
            If you have any questions about these Terms, please contact us:
          </BodyText>

          <PolicyTable
            headers={['Channel', 'Detail']}
            rows={[
              [
                <strong>Email</strong>,
                <Link href="mailto:sam@tallyreading.uk" sx={{ color: '#6B8E6B' }}>sam@tallyreading.uk</Link>,
              ],
              [
                <strong>Data Protection Officer</strong>,
                <span>Sam Castillo (<Link href="mailto:sam@tallyreading.uk" sx={{ color: '#6B8E6B' }}>sam@tallyreading.uk</Link>)</span>,
              ],
              [
                <strong>Postal address</strong>,
                'Scratch IT LTD, 247 Bishopsworth Road, Bristol, BS13 7LH',
              ],
              [
                <strong>ICO registration</strong>,
                'ZC098130',
              ],
            ]}
          />

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
            <Typography variant="body2" sx={{ color: '#7A7A7A', fontSize: '0.8rem' }}>
              Scratch IT LTD &middot; Company 08151576 &middot; ICO ZC098130
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default TermsOfService;
