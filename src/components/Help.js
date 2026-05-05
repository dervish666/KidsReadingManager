import React, { useState } from 'react';
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DnsIcon from '@mui/icons-material/Dns';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import EmailIcon from '@mui/icons-material/Email';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import EditNoteIcon from '@mui/icons-material/EditNote';
import CalendarViewDayIcon from '@mui/icons-material/CalendarViewDay';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
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

const SectionHeading = ({ id, icon, children }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 5, mb: 2 }}>
    {icon && (
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '10px',
          background:
            'linear-gradient(135deg, rgba(107, 142, 107, 0.12) 0%, rgba(107, 142, 107, 0.06) 100%)',
          border: '1px solid rgba(107, 142, 107, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'primary.main',
        }}
      >
        {icon}
      </Box>
    )}
    <Typography
      id={id}
      variant="h4"
      component="h2"
      sx={{
        fontSize: { xs: '1.3rem', sm: '1.5rem' },
        color: 'text.primary',
        scrollMarginTop: '24px',
      }}
    >
      {children}
    </Typography>
  </Box>
);

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

const FeatureCard = ({ icon, title, children }) => (
  <Paper
    elevation={0}
    sx={{
      p: 2.5,
      borderRadius: '14px',
      backgroundColor: 'rgba(255, 254, 249, 0.7)',
      border: '1px solid rgba(139, 115, 85, 0.1)',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      '@media (hover: hover) and (pointer: fine)': {
        '&:hover': {
          borderColor: 'rgba(107, 142, 107, 0.25)',
          boxShadow: '0 4px 16px rgba(107, 142, 107, 0.08)',
          transform: 'translateY(-2px)',
        },
      },
      '@media (prefers-reduced-motion: reduce)': {
        transition: 'none',
        '&:hover': { transform: 'none' },
      },
    }}
  >
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: '10px',
          background:
            'linear-gradient(135deg, rgba(107, 142, 107, 0.15) 0%, rgba(139, 115, 85, 0.08) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'primary.main',
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography
          variant="h6"
          sx={{
            fontSize: '1rem',
            fontWeight: 700,
            color: 'text.primary',
            mb: 0.5,
            fontFamily: '"Nunito", sans-serif',
          }}
        >
          {title}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          {children}
        </Typography>
      </Box>
    </Box>
  </Paper>
);

const FaqItem = ({ question, children, expanded, onChange }) => (
  <Accordion
    expanded={expanded}
    onChange={onChange}
    elevation={0}
    disableGutters
    sx={{
      backgroundColor: 'transparent',
      border: '1px solid rgba(139, 115, 85, 0.1)',
      borderRadius: '12px !important',
      mb: 1.5,
      overflow: 'hidden',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      '&:before': { display: 'none' },
      ...(expanded && {
        borderColor: 'rgba(107, 142, 107, 0.25)',
        backgroundColor: 'rgba(255, 254, 249, 0.6)',
        boxShadow: '0 4px 16px rgba(107, 142, 107, 0.06)',
      }),
      '@media (prefers-reduced-motion: reduce)': {
        transition: 'none',
      },
    }}
  >
    <AccordionSummary
      expandIcon={<ExpandMoreIcon sx={{ color: 'primary.main' }} />}
      sx={{
        px: 2.5,
        py: 0.5,
        minHeight: 56,
        '& .MuiAccordionSummary-content': { my: 1.5 },
      }}
    >
      <Typography
        sx={{
          fontFamily: '"Nunito", sans-serif',
          fontWeight: 700,
          fontSize: '0.95rem',
          color: expanded ? 'primary.dark' : 'text.primary',
        }}
      >
        {question}
      </Typography>
    </AccordionSummary>
    <AccordionDetails sx={{ px: 2.5, pt: 0, pb: 2.5 }}>{children}</AccordionDetails>
  </Accordion>
);

const TocLink = ({ href, icon, children }) => (
  <Link
    href={href}
    underline="none"
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      py: 1,
      px: 1.5,
      borderRadius: '8px',
      color: 'text.primary',
      fontFamily: '"DM Sans", sans-serif',
      fontWeight: 600,
      fontSize: '0.95rem',
      transition: 'all 0.15s ease',
      '&:hover': {
        backgroundColor: 'rgba(107, 142, 107, 0.08)',
        color: 'primary.dark',
      },
    }}
  >
    <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>{icon}</Box>
    {children}
  </Link>
);

const Help = () => {
  const [expandedFaq, setExpandedFaq] = useState(false);

  const handleFaqChange = (panel) => (_, isExpanded) => {
    setExpandedFaq(isExpanded ? panel : false);
  };

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
          {/* Header */}
          <Box
            sx={{
              position: 'relative',
              borderRadius: '14px',
              background:
                'linear-gradient(135deg, rgba(107, 142, 107, 0.08) 0%, rgba(139, 115, 85, 0.04) 50%, rgba(107, 142, 107, 0.06) 100%)',
              border: '1px solid rgba(107, 142, 107, 0.12)',
              p: { xs: 3, sm: 4 },
              mb: 4,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: -20,
                right: -20,
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: 'rgba(107, 142, 107, 0.06)',
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                bottom: -30,
                right: 60,
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'rgba(139, 115, 85, 0.04)',
              }}
            />
            <Box sx={{ position: 'relative' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(107, 142, 107, 0.25)',
                  }}
                >
                  <TallyLogo size={24} color="white" />
                </Box>
                <Typography
                  variant="h3"
                  component="h1"
                  sx={{ fontSize: { xs: '1.6rem', sm: '2rem' }, color: 'text.primary' }}
                >
                  Help &amp; Onboarding
                </Typography>
              </Box>
              <Typography
                variant="body1"
                sx={{
                  color: '#8B7355',
                  fontWeight: 600,
                  mb: 0.5,
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                Everything you need to get your school up and running
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', fontFamily: '"DM Sans", sans-serif' }}
              >
                Can't find what you need? Email{' '}
                <Link
                  href="mailto:help@tallyreading.uk"
                  sx={{ color: 'primary.main', fontWeight: 600 }}
                >
                  help@tallyreading.uk
                </Link>{' '}
                and we'll get back to you within two working days.
              </Typography>
            </Box>
          </Box>

          {/* Table of contents */}
          <Box
            sx={{
              borderRadius: '14px',
              p: { xs: 2.5, sm: 3 },
              mb: 4,
              border: '1px solid rgba(139, 115, 85, 0.08)',
              backgroundColor: 'rgba(255, 254, 249, 0.5)',
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontFamily: '"Nunito", sans-serif',
                fontWeight: 700,
                color: 'text.primary',
                mb: 1,
                fontSize: '0.9rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              On this page
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              <TocLink href="#it-setup" icon={<DnsIcon sx={{ fontSize: 20 }} />}>
                IT department setup
              </TocLink>
              <TocLink href="#getting-started" icon={<RocketLaunchIcon sx={{ fontSize: 20 }} />}>
                Getting started
              </TocLink>
              <TocLink href="#features" icon={<AutoStoriesIcon sx={{ fontSize: 20 }} />}>
                Day-to-day features
              </TocLink>
              <TocLink href="#faq" icon={<HelpOutlineIcon sx={{ fontSize: 20 }} />}>
                Frequently asked questions
              </TocLink>
              <TocLink href="#contact" icon={<EmailIcon sx={{ fontSize: 20 }} />}>
                Still need help?
              </TocLink>
            </Box>
          </Box>

          {/* ============================================================ */}
          {/* Section 1: IT Setup */}
          {/* ============================================================ */}
          <SectionHeading id="it-setup" icon={<DnsIcon sx={{ fontSize: 20 }} />}>
            IT department setup
          </SectionHeading>

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
          <SectionHeading id="getting-started" icon={<RocketLaunchIcon sx={{ fontSize: 20 }} />}>
            Getting started
          </SectionHeading>

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
          <SectionHeading id="features" icon={<AutoStoriesIcon sx={{ fontSize: 20 }} />}>
            Day-to-day features
          </SectionHeading>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <FeatureCard icon={<MenuBookIcon />} title="Book library &amp; import">
              If you have an existing book list as a spreadsheet, import it via Books &rarr; Import
              Books. The wizard accepts CSV files and automatically matches columns and detects
              duplicates against the shared catalogue.
            </FeatureCard>

            <FeatureCard icon={<EditNoteIcon />} title="Recording reading sessions">
              Log individual sessions from a student's profile — book, pages read, assessment level
              (struggling, needs help, independent), enjoyment thumbs up/down, and notes.
            </FeatureCard>

            <FeatureCard icon={<CalendarViewDayIcon />} title="Home reading register">
              For quick daily logging across an entire class, use the Home Reading tab. A simple
              grid lets you mark each student's status (read, multiple, absent, no record) with
              multi-day history columns to spot patterns at a glance.
            </FeatureCard>

            <FeatureCard icon={<AutoAwesomeIcon />} title="Book recommendations">
              AI-powered suggestions tailored to each student's reading level, interests, and past
              enjoyment. Access from the Recommend tab. Requires the AI add-on to be enabled for
              your school.
            </FeatureCard>

            <FeatureCard icon={<EmojiEventsIcon />} title="Achievements &amp; badges">
              Students earn badges automatically as they read — no manual input needed. Every time a
              session is saved, Tally checks whether any new badges have been unlocked and shows a
              celebration if so.
              <Box component="ul" sx={{ mt: 1.5, mb: 0, pl: 2.5, '& li': { mb: 0.75 } }}>
                <li>
                  <strong>Milestones</strong> — First Finish (first book logged), Series Finisher
                  (3+ books by the same author)
                </li>
                <li>
                  <strong>Volume</strong> — Bookworm (books read) and Time Traveller (minutes read),
                  each with four tiers (bronze → silver → gold → star). Targets automatically scale
                  by year group so KS1 and KS2 students are measured fairly.
                </li>
                <li>
                  <strong>Consistency</strong> — Steady Reader (3 days in a week), Week Warrior
                  (every day in a week), Monthly Marvel (4+ days every week for a whole month)
                </li>
                <li>
                  <strong>Exploration</strong> — Genre Explorer (3, 5, or 7 different genres read),
                  Fiction &amp; Fact (at least one fiction and one non-fiction book)
                </li>
                <li>
                  <strong>Secret badges</strong> — A couple of surprise badges that only reveal
                  themselves when earned. Students discover them by reading enthusiastically.
                </li>
              </Box>
              <Box sx={{ mt: 1.5 }}>
                The <strong>Achievements tab</strong> shows the full class picture. Select a class
                to see the class garden — a visual display that grows through four stages (Seedling
                → Sprout → Bloom → Full Garden) as your class completes its goals for the term. The
                garden view works well projected on a classroom whiteboard to celebrate progress
                together. The <strong>Completion Rate</strong> shows what percentage of all possible
                badges have been earned across every student in the class.
              </Box>
            </FeatureCard>
          </Box>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 4 }} />

          {/* ============================================================ */}
          {/* Section 4: FAQ */}
          {/* ============================================================ */}
          <SectionHeading id="faq" icon={<HelpOutlineIcon sx={{ fontSize: 20 }} />}>
            Frequently asked questions
          </SectionHeading>

          <Box sx={{ mt: 2 }}>
            <FaqItem
              question="I've forgotten my password"
              expanded={expandedFaq === 'password'}
              onChange={handleFaqChange('password')}
            >
              <BodyText sx={{ mb: 1.5 }}>
                Click <strong>Forgot Password</strong> on the login screen and enter your email
                address. You'll receive a reset link that's valid for one hour. If you don't see the
                email, check your spam folder.
              </BodyText>
              <BodyText sx={{ mb: 0 }}>
                If your school uses MyLogin single sign-on, password resets are handled by MyLogin
                directly — please contact your school's IT team.
              </BodyText>
            </FaqItem>

            <FaqItem
              question="A teacher can't see their class"
              expanded={expandedFaq === 'class-visibility'}
              onChange={handleFaqChange('class-visibility')}
            >
              <BodyText sx={{ mb: 1 }}>
                Class visibility is controlled by class assignments. To check:
              </BodyText>
              <List sx={{ pl: 2, mb: 1.5 }}>
                <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.25, pl: 1 }}>
                  <ListItemText
                    primary={
                      <span>
                        Go to <strong>Settings &rarr; Manage Users</strong>
                      </span>
                    }
                    primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
                  />
                </ListItem>
                <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.25, pl: 1 }}>
                  <ListItemText
                    primary="Find the teacher and click to edit"
                    primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
                  />
                </ListItem>
                <ListItem sx={{ display: 'list-item', listStyleType: 'decimal', py: 0.25, pl: 1 }}>
                  <ListItemText
                    primary="Tick the classes they should have access to and save"
                    primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
                  />
                </ListItem>
              </List>
              <BodyText sx={{ mb: 0 }}>
                For Wonde-synced schools, class assignments come from your MIS automatically on the
                nightly sync. If a class is missing, check that the teacher is listed as the form
                tutor or class teacher in your MIS.
              </BodyText>
            </FaqItem>

            <FaqItem
              question={'"Your connection isn\'t private" error'}
              expanded={expandedFaq === 'connection-error'}
              onChange={handleFaqChange('connection-error')}
            >
              <BodyText sx={{ mb: 0 }}>
                This means your school firewall or web filter is blocking{' '}
                <code>tallyreading.uk</code>. Ask your IT team to add it to the allowed domains list
                (HTTPS on port 443). See the IT setup section above for the details to forward.
              </BodyText>
            </FaqItem>

            <FaqItem
              question="Importing books from a CSV"
              expanded={expandedFaq === 'csv-import'}
              onChange={handleFaqChange('csv-import')}
            >
              <BodyText sx={{ mb: 1 }}>
                Go to <strong>Books &rarr; Import Books</strong>. The wizard will:
              </BodyText>
              <List sx={{ pl: 2, mb: 1.5 }}>
                <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.25, pl: 1 }}>
                  <ListItemText
                    primary="Auto-detect column headers (Title, Author, ISBN, etc.) — you can override manually if needed"
                    primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
                  />
                </ListItem>
                <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.25, pl: 1 }}>
                  <ListItemText
                    primary="Match exact duplicates and link them automatically to the shared catalogue"
                    primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
                  />
                </ListItem>
                <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.25, pl: 1 }}>
                  <ListItemText
                    primary="Flag fuzzy matches (85%+ similarity) for you to review one by one"
                    primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
                  />
                </ListItem>
                <ListItem sx={{ display: 'list-item', listStyleType: 'disc', py: 0.25, pl: 1 }}>
                  <ListItemText
                    primary="Create new entries for any books not already in the catalogue"
                    primaryTypographyProps={{ color: 'text.primary', lineHeight: 1.75 }}
                  />
                </ListItem>
              </List>
              <BodyText sx={{ mb: 0 }}>
                ISBNs are the most reliable way to match — if your CSV has them, dedup quality is
                very high.
              </BodyText>
            </FaqItem>

            <FaqItem
              question="What data syncs from Wonde?"
              expanded={expandedFaq === 'wonde-sync'}
              onChange={handleFaqChange('wonde-sync')}
            >
              <BodyText sx={{ mb: 1 }}>
                If your school is connected to Wonde, the following data syncs automatically each
                night at 3am:
              </BodyText>
              <HelpTable
                headers={['Data', 'Direction', 'Frequency']}
                rows={[
                  [
                    'Students (name, year group, demographics)',
                    'Wonde → Tally',
                    'Nightly + on demand',
                  ],
                  ['Classes and teacher assignments', 'Wonde → Tally', 'Nightly + on demand'],
                  ['Teacher accounts (via MyLogin SSO)', 'Wonde → Tally', 'On first login'],
                  [
                    'Reading sessions, books, and progress',
                    'Stays in Tally only',
                    'Never sent to Wonde',
                  ],
                ]}
              />
              <BodyText sx={{ mb: 0 }}>
                Reading data never leaves Tally. We only read from your MIS — we never write back to
                it. Admins can trigger a manual sync at any time from{' '}
                <strong>Settings &rarr; Wonde Sync</strong>.
              </BodyText>
            </FaqItem>

            <FaqItem
              question="How is student data protected?"
              expanded={expandedFaq === 'data-protection'}
              onChange={handleFaqChange('data-protection')}
            >
              <BodyText sx={{ mb: 1.5 }}>
                Tally is fully GDPR compliant and built specifically for UK primary schools. Data is
                stored on Cloudflare's UK and EU edge infrastructure, encrypted in transit and at
                rest. We're registered with the ICO (registration number ZC098130).
              </BodyText>
              <BodyText sx={{ mb: 0 }}>
                For full details, see our{' '}
                <Link href="/privacy" sx={{ color: 'primary.main' }}>
                  Privacy Policy
                </Link>{' '}
                or request our DPIA by emailing{' '}
                <Link href="mailto:help@tallyreading.uk" sx={{ color: 'primary.main' }}>
                  help@tallyreading.uk
                </Link>
                .
              </BodyText>
            </FaqItem>
          </Box>

          <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 4 }} />

          {/* ============================================================ */}
          {/* Section 5: Contact */}
          {/* ============================================================ */}
          <SectionHeading id="contact" icon={<EmailIcon sx={{ fontSize: 20 }} />}>
            Still need help?
          </SectionHeading>

          <BodyText>
            If your question isn't answered above, get in touch. We aim to respond within two
            working days.
          </BodyText>

          <HelpTable
            rows={[
              [
                <strong>Email</strong>,
                <Link href="mailto:help@tallyreading.uk" sx={{ color: 'primary.main' }}>
                  help@tallyreading.uk
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
