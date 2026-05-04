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

const HelpTable = ({ headers, rows }) => (
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

const SectionHeading = ({ id, children }) => (
  <Typography
    id={id}
    variant="h4"
    component="h2"
    sx={{
      mt: 5,
      mb: 2,
      fontSize: { xs: '1.3rem', sm: '1.5rem' },
      color: 'text.primary',
      scrollMarginTop: '24px',
    }}
  >
    {children}
  </Typography>
);

const SubsectionHeading = ({ id, children }) => (
  <Typography
    id={id}
    variant="h5"
    component="h3"
    sx={{
      mt: 3,
      mb: 1.5,
      fontSize: { xs: '1.1rem', sm: '1.2rem' },
      color: 'primary.dark',
      scrollMarginTop: '24px',
    }}
  >
    {children}
  </Typography>
);

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

const TocLink = ({ href, children }) => (
  <Link
    href={href}
    underline="hover"
    sx={{
      color: 'primary.main',
      fontFamily: '"DM Sans", sans-serif',
      fontWeight: 600,
      fontSize: '0.95rem',
      display: 'block',
      py: 0.5,
    }}
  >
    {children}
  </Link>
);

const Help = () => {
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
              component="h1"
              sx={{
                fontSize: { xs: '1.6rem', sm: '2rem' },
                color: 'text.primary',
              }}
            >
              Help &amp; Onboarding
            </Typography>
          </Box>

          <Typography
            variant="body1"
            sx={{ color: '#8B7355', fontWeight: 600, mb: 0.5, fontFamily: '"DM Sans", sans-serif' }}
          >
            Everything you need to get your school up and running
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', mb: 3, fontFamily: '"DM Sans", sans-serif' }}
          >
            Can't find what you need? Email{' '}
            <Link href="mailto:sam@tallyreading.uk" sx={{ color: 'primary.main' }}>
              sam@tallyreading.uk
            </Link>{' '}
            and we'll get back to you within two working days.
          </Typography>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mb: 3 }} />

          {/* Table of contents */}
          <Box
            sx={{
              backgroundColor: 'rgba(107, 142, 107, 0.05)',
              borderRadius: '12px',
              p: 3,
              mb: 4,
              border: '1px solid rgba(107, 142, 107, 0.12)',
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontFamily: '"Nunito", sans-serif',
                fontWeight: 700,
                color: 'text.primary',
                mb: 1.5,
              }}
            >
              On this page
            </Typography>
            <TocLink href="#it-setup">1. IT department setup</TocLink>
            <TocLink href="#getting-started">2. Getting started</TocLink>
            <TocLink href="#features">3. Day-to-day features</TocLink>
            <TocLink href="#faq">4. Frequently asked questions</TocLink>
            <TocLink href="#contact">5. Still need help?</TocLink>
          </Box>

          {/* ============================================================ */}
          {/* Section 1: IT Setup */}
          {/* ============================================================ */}
          <SectionHeading id="it-setup">1. IT department setup</SectionHeading>

          <BodyText>
            Please forward this section to your IT team before your first login. Tally Reading is a
            web-based application — no software installation is required.
          </BodyText>

          <SubsectionHeading>Domain whitelist</SubsectionHeading>

          <BodyText>
            Your IT team needs to ensure the following domain is accessible from your school
            network:
          </BodyText>

          <HelpTable
            headers={['Domain', 'Protocol', 'Port']}
            rows={[[<code>tallyreading.uk</code>, 'HTTPS', '443']]}
          />

          <BodyText>
            <strong>If teachers see a "Your connection isn't private" error</strong>, this means
            your school firewall or web filter is blocking the site. Ask your IT team to add{' '}
            <code>tallyreading.uk</code> to their allowed domains list.
          </BodyText>

          <SubsectionHeading>Browser requirements</SubsectionHeading>

          <BodyText>Tally Reading works in any modern browser. We recommend:</BodyText>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="Google Chrome (latest)"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="Microsoft Edge (latest)"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="Safari (latest)"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <BodyText>No browser extensions or plugins are needed.</BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 2: Getting Started */}
          {/* ============================================================ */}
          <SectionHeading id="getting-started">2. Getting started</SectionHeading>

          <SubsectionHeading>Your account</SubsectionHeading>

          <BodyText>
            Your school's administrator account will be set up for you. You'll receive an email with
            your login details and a link to sign in. On first login, you'll be prompted to change
            your password. Passwords must be at least 8 characters.
          </BodyText>

          <BodyText>
            If your school uses MyLogin single sign-on (SSO), you'll sign in with your existing
            school credentials — no separate password to remember.
          </BodyText>

          <SubsectionHeading>Adding teachers</SubsectionHeading>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    Go to <strong>Settings</strong>
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    Select <strong>Manage Users</strong>
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    Click <strong>Add User</strong>
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    Enter the teacher's name, email, and select the <strong>Teacher</strong> role
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="They'll receive an email with login instructions"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <BodyText>
            Teachers can manage their own students, classes, and reading sessions. If you need a
            colleague to help with admin tasks, assign them the <strong>Admin</strong> role instead.
          </BodyText>

          <SubsectionHeading>Creating classes</SubsectionHeading>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    Go to <strong>Classes</strong>
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    Click <strong>Add Class</strong>
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={'Enter the class name (e.g. "Year 3 Oak")'}
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="Assign a teacher to the class"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <SubsectionHeading>Adding students</SubsectionHeading>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    Go to <strong>Students</strong>
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    Click <strong>Add Student</strong>
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="Enter the student's name and assign them to a class"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="Optionally set their reading level range (AR levels 1.0–13.0)"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <BodyText>
            If your school uses Wonde, students will sync automatically — see the FAQ below for
            details.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 3: Features */}
          {/* ============================================================ */}
          <SectionHeading id="features">3. Day-to-day features</SectionHeading>

          <SubsectionHeading>Importing your book library</SubsectionHeading>

          <BodyText>
            If you have an existing book list as a spreadsheet, you can import it via{' '}
            <strong>Books → Import Books</strong>. The import wizard accepts CSV files and will
            automatically match columns and detect duplicates against the shared catalogue.
          </BodyText>

          <SubsectionHeading>Recording reading sessions</SubsectionHeading>

          <BodyText>
            Teachers can log individual reading sessions from a student's profile, recording the
            book, number of pages read, an assessment level (struggling, needs help, independent), a
            thumbs up/down for enjoyment, and notes.
          </BodyText>

          <SubsectionHeading>Home reading register</SubsectionHeading>

          <BodyText>
            For quick daily logging across an entire class, use the <strong>Home Reading</strong>{' '}
            tab. It provides a simple grid where teachers can mark each student's reading status
            (read, multiple, absent, no record) for the day. Multi-day history columns let you see
            patterns at a glance.
          </BodyText>

          <SubsectionHeading>Book recommendations</SubsectionHeading>

          <BodyText>
            Tally Reading can suggest books tailored to each student's reading level, interests, and
            past enjoyment. Access this from the <strong>Recommend</strong> tab. Recommendations
            require the AI add-on to be enabled for your school.
          </BodyText>

          <SubsectionHeading>Achievements &amp; badges</SubsectionHeading>

          <BodyText>
            Students earn badges automatically as they read — for streaks, variety, milestones, and
            more. The <strong>Achievements</strong> tab shows class-wide progress as a growing
            garden, perfect for projecting on the classroom whiteboard.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 4: FAQ */}
          {/* ============================================================ */}
          <SectionHeading id="faq">4. Frequently asked questions</SectionHeading>

          <SubsectionHeading>I've forgotten my password</SubsectionHeading>

          <BodyText>
            Click <strong>Forgot Password</strong> on the login screen and enter your email address.
            You'll receive a reset link that's valid for one hour. If you don't see the email, check
            your spam folder.
          </BodyText>

          <BodyText>
            If your school uses MyLogin single sign-on, password resets are handled by MyLogin
            directly — please contact your school's IT team.
          </BodyText>

          <SubsectionHeading>A teacher can't see their class</SubsectionHeading>

          <BodyText>Class visibility is controlled by class assignments. To check:</BodyText>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    Go to <strong>Settings → Manage Users</strong>
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="Find the teacher and click to edit"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="Tick the classes they should have access to and save"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <BodyText>
            For Wonde-synced schools, class assignments come from your MIS automatically on the
            nightly sync. If a class is missing, check that the teacher is listed as the form tutor
            or class teacher in your MIS.
          </BodyText>

          <SubsectionHeading>"Your connection isn't private" error</SubsectionHeading>

          <BodyText>
            This means your school firewall or web filter is blocking <code>tallyreading.uk</code>.
            Ask your IT team to add it to the allowed domains list (HTTPS on port 443). See the IT
            setup section above for the details to forward.
          </BodyText>

          <SubsectionHeading>Importing books from a CSV</SubsectionHeading>

          <BodyText>
            Go to <strong>Books → Import Books</strong>. The wizard will:
          </BodyText>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="Auto-detect column headers (Title, Author, ISBN, etc.) — you can override these manually if needed"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="Match exact duplicates and link them automatically to the shared catalogue"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="Flag fuzzy matches (85%+ similarity) for you to review one by one"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary="Create new entries for any books not already in the catalogue"
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <BodyText>
            ISBNs are the most reliable way to match — if your CSV has them, dedup quality is very
            high.
          </BodyText>

          <SubsectionHeading>What data syncs from Wonde?</SubsectionHeading>

          <BodyText>
            If your school is connected to Wonde, the following data syncs automatically each night
            at 3am:
          </BodyText>

          <HelpTable
            headers={['Data', 'Direction', 'Frequency']}
            rows={[
              ['Students (name, year group, demographics)', 'Wonde → Tally', 'Nightly + on demand'],
              ['Classes and teacher assignments', 'Wonde → Tally', 'Nightly + on demand'],
              ['Teacher accounts (via MyLogin SSO)', 'Wonde → Tally', 'On first login'],
              [
                'Reading sessions, books, and progress',
                'Stays in Tally only',
                'Never sent to Wonde',
              ],
            ]}
          />

          <BodyText>
            Reading data never leaves Tally. We only read from your MIS — we never write back to it.
            Admins can trigger a manual sync at any time from <strong>Settings → Wonde Sync</strong>
            .
          </BodyText>

          <SubsectionHeading>How is student data protected?</SubsectionHeading>

          <BodyText>
            Tally is fully GDPR compliant and built specifically for UK primary schools. Data is
            stored on Cloudflare's UK and EU edge infrastructure, encrypted in transit and at rest.
            We're registered with the ICO (registration number ZC098130).
          </BodyText>

          <BodyText>
            For full details, see our{' '}
            <Link href="/privacy" sx={{ color: 'primary.main' }}>
              Privacy Policy
            </Link>{' '}
            or request our DPIA by emailing{' '}
            <Link href="mailto:sam@tallyreading.uk" sx={{ color: 'primary.main' }}>
              sam@tallyreading.uk
            </Link>
            .
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 5: Contact */}
          {/* ============================================================ */}
          <SectionHeading id="contact">5. Still need help?</SectionHeading>

          <BodyText>
            If your question isn't answered above, get in touch. We aim to respond within two
            working days.
          </BodyText>

          <HelpTable
            rows={[
              [
                <strong>Email</strong>,
                <Link href="mailto:sam@tallyreading.uk" sx={{ color: 'primary.main' }}>
                  sam@tallyreading.uk
                </Link>,
              ],
              [
                <strong>In-app support</strong>,
                'Click the support icon in the app header to send a message — it includes the page you were on, which helps us help you faster.',
              ],
            ]}
          />

          {/* Footer */}
          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 4, mb: 3 }} />

          <Box sx={{ textAlign: 'center' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                mb: 1,
              }}
            >
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

export default Help;
