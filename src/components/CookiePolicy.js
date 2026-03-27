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

// Section heading component (renders as h2 for proper hierarchy under h1 page title)
const SectionHeading = ({ children }) => (
  <Typography
    variant="h4"
    component="h2"
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

// Subsection heading component (renders as h3)
const SubsectionHeading = ({ children }) => (
  <Typography
    variant="h5"
    component="h3"
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

const CookiePolicy = () => {
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
              component="h1"
              sx={{
                fontSize: { xs: '1.6rem', sm: '2rem' },
                color: 'text.primary',
              }}
            >
              Cookie Policy
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
            Last updated: 5 March 2026
          </Typography>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mb: 3 }} />

          {/* ============================================================ */}
          {/* Section 1: About this policy */}
          {/* ============================================================ */}
          <SectionHeading>1. About this policy</SectionHeading>

          <BodyText>
            This Cookie Policy explains how Tally Reading (&ldquo;Tally&rdquo;, &ldquo;we&rdquo;,
            &ldquo;us&rdquo;), operated by Scratch IT LTD (company number 08151576), uses cookies
            and similar technologies when you use our platform at{' '}
            <Link
              href="https://tallyreading.uk"
              target="_blank"
              rel="noopener"
              sx={{ color: 'primary.main' }}
            >
              https://tallyreading.uk
            </Link>
            .
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 2: What are cookies? */}
          {/* ============================================================ */}
          <SectionHeading>2. What are cookies?</SectionHeading>

          <BodyText>
            Cookies are small text files placed on your device by a website. They are widely used to
            make websites work, to remember your preferences, and to provide information to the site
            operator. Browser storage (localStorage and sessionStorage) serves a similar purpose but
            is accessible only to the website that created it.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 3: Cookies we set */}
          {/* ============================================================ */}
          <SectionHeading>3. Cookies we set</SectionHeading>

          <BodyText>
            We set <strong>one</strong> cookie:
          </BodyText>

          <PolicyTable
            headers={['Name', 'Purpose', 'Duration', 'Type']}
            rows={[
              [
                <code>refresh_token</code>,
                'Authentication. Keeps you signed in by allowing the browser to obtain a new access token without re-entering your credentials.',
                '7 days',
                'Strictly necessary',
              ],
            ]}
          />

          <SubsectionHeading>Technical details</SubsectionHeading>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>HttpOnly</strong> — cannot be read by JavaScript (protects against
                    cross-site scripting attacks)
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>Secure</strong> — transmitted only over HTTPS in production
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>SameSite=Strict</strong> — not sent with cross-site requests (protects
                    against cross-site request forgery)
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>Path</strong> — restricted to <code>/api/auth</code> (not sent with
                    other requests)
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>Cleared on logout</strong> — the cookie is removed when you sign out
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <BodyText>
            This cookie is <strong>strictly necessary</strong> for the Service to function. Without
            it, you would need to sign in on every page load. Because it is strictly necessary,
            consent is not required under the Privacy and Electronic Communications Regulations
            (PECR).
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 4: Browser storage we use */}
          {/* ============================================================ */}
          <SectionHeading>4. Browser storage we use</SectionHeading>

          <BodyText>
            In addition to the cookie above, we use your browser&rsquo;s built-in storage for the
            following purposes:
          </BodyText>

          <SubsectionHeading>localStorage (persists until cleared)</SubsectionHeading>

          <PolicyTable
            headers={['Key', 'Purpose', 'Category']}
            rows={[
              [
                'Auth token',
                'Stores your short-lived access token (15-minute expiry) so you remain signed in as you navigate the app. Removed on logout.',
                'Strictly necessary',
              ],
              [
                'User profile',
                'Stores your name, email, and role so the app can display them without making an API call on every page. Removed on logout.',
                'Strictly necessary',
              ],
              [
                'Auth mode',
                'Records whether the platform is using SSO or email/password authentication.',
                'Strictly necessary',
              ],
              [
                'Book covers',
                'Caches book cover image URLs to reduce external API calls. Limited to 500 entries, auto-expires after 7 days. Contains no personal data.',
                'Performance',
              ],
            ]}
          />

          <SubsectionHeading>sessionStorage (cleared when you close the tab)</SubsectionHeading>

          <PolicyTable
            headers={['Key', 'Purpose', 'Category']}
            rows={[
              [
                'Class filter',
                'Remembers your selected class filter within the current session.',
                'Functional',
              ],
              [
                'Recently accessed students',
                'Tracks up to 20 recently viewed student IDs for quick access. Contains IDs only, no names or personal data.',
                'Functional',
              ],
              [
                'Priority list state',
                'Tracks which students you have marked or hidden from the priority list during this session.',
                'Functional',
              ],
            ]}
          />

          <BodyText>
            All browser storage is cleared on logout. sessionStorage is also automatically cleared
            when the browser tab is closed.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 5: What we do NOT use */}
          {/* ============================================================ */}
          <SectionHeading>5. What we do NOT use</SectionHeading>

          <BodyText>
            We want to be clear about what Tally does <strong>not</strong> do:
          </BodyText>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>No analytics cookies</strong> — we do not use Google Analytics, Matomo,
                    or any similar analytics service
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>No advertising cookies</strong> — we do not serve ads or use advertising
                    networks
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>No tracking pixels</strong> — we do not use Facebook Pixel, LinkedIn
                    Insight Tag, or similar tracking technologies
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>No behavioural profiling</strong> — we do not track your browsing
                    behaviour across other websites
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>No third-party marketing cookies</strong> — we do not share data with
                    third-party advertisers
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 6: Third-party cookies */}
          {/* ============================================================ */}
          <SectionHeading>6. Third-party cookies</SectionHeading>

          <SubsectionHeading>Cloudflare</SubsectionHeading>

          <BodyText>
            Our platform is hosted on Cloudflare&rsquo;s infrastructure. Cloudflare may set its own
            cookies for security and performance purposes (such as bot detection and DDoS
            protection). These are set by Cloudflare, not by Tally, and are classified as strictly
            necessary. More information is available in{' '}
            <Link
              href="https://www.cloudflare.com/cookie-policy/"
              target="_blank"
              rel="noopener"
              sx={{ color: 'primary.main' }}
            >
              Cloudflare&rsquo;s cookie policy
            </Link>
            .
          </BodyText>

          <SubsectionHeading>MyLogin (SSO only)</SubsectionHeading>

          <BodyText>
            If your school uses MyLogin single sign-on, the MyLogin service may set its own cookies
            during the sign-in process. These cookies are managed by MyLogin (part of Wonde) and are
            subject to their own privacy and cookie policies. Tally does not control or have access
            to these cookies.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 7: Managing cookies */}
          {/* ============================================================ */}
          <SectionHeading>7. Managing cookies</SectionHeading>

          <BodyText>
            Because we use only strictly necessary cookies, there is no cookie consent banner. You
            can delete cookies at any time through your browser settings, but doing so will sign you
            out of the Service.
          </BodyText>

          <SubsectionHeading>To delete cookies in common browsers</SubsectionHeading>

          <List sx={{ pl: 2 }}>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>Chrome:</strong> Settings &gt; Privacy and Security &gt; Cookies &gt;
                    See all cookies
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>Safari:</strong> Preferences &gt; Privacy &gt; Manage Website Data
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>Firefox:</strong> Settings &gt; Privacy &amp; Security &gt; Cookies and
                    Site Data
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
            <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.5, pl: 1 }}>
              <ListItemText
                primary={
                  <span>
                    <strong>Edge:</strong> Settings &gt; Cookies and site permissions &gt; Cookies
                  </span>
                }
                primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
              />
            </ListItem>
          </List>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 8: Changes to this policy */}
          {/* ============================================================ */}
          <SectionHeading>8. Changes to this policy</SectionHeading>

          <BodyText>
            We may update this Cookie Policy from time to time. We will notify registered users of
            material changes by email. The &ldquo;Last updated&rdquo; date at the top of this page
            indicates when the policy was last revised.
          </BodyText>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 3 }} />

          {/* ============================================================ */}
          {/* Section 9: Contact us */}
          {/* ============================================================ */}
          <SectionHeading>9. Contact us</SectionHeading>

          <BodyText>
            If you have any questions about our use of cookies, please contact us:
          </BodyText>

          <PolicyTable
            rows={[
              [
                <strong>Email</strong>,
                <Link href="mailto:sam@tallyreading.uk" sx={{ color: 'primary.main' }}>
                  sam@tallyreading.uk
                </Link>,
              ],
              [
                <strong>Data Protection Officer</strong>,
                <span>
                  Sam Castillo (
                  <Link href="mailto:sam@tallyreading.uk" sx={{ color: 'primary.main' }}>
                    sam@tallyreading.uk
                  </Link>
                  )
                </span>,
              ],
              [
                <strong>Postal address</strong>,
                'Scratch IT LTD, 247 Bishopsworth Road, Bristol, BS13 7LH',
              ],
            ]}
          />

          <BodyText>
            For full details of how we handle personal data, please see our{' '}
            <Link href="/privacy" sx={{ color: 'primary.main' }}>
              Privacy Policy
            </Link>
            .
          </BodyText>

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

export default CookiePolicy;
