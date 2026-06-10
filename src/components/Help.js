import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Link,
  Button,
  TextField,
  InputBase,
  Chip,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  List,
  ListItem,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogContent,
  IconButton,
  Alert,
  CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EmailIcon from '@mui/icons-material/Email';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import KeyIcon from '@mui/icons-material/VpnKeyOutlined';
import ShieldIcon from '@mui/icons-material/GppGoodOutlined';
import BuildIcon from '@mui/icons-material/BuildOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import TallyLogo from './TallyLogo';

/* ==================================================================
   Palette — cozy bookshelf accents
================================================================== */

const ACCENTS = {
  sage: {
    fg: '#5A7A5A',
    iconBg: 'rgba(107, 142, 107, 0.14)',
    soft: 'rgba(107, 142, 107, 0.08)',
    border: 'rgba(107, 142, 107, 0.25)',
  },
  coral: {
    fg: '#A86547',
    iconBg: 'rgba(196, 124, 90, 0.14)',
    soft: 'rgba(196, 124, 90, 0.08)',
    border: 'rgba(196, 124, 90, 0.28)',
  },
  amber: {
    fg: '#96772E',
    iconBg: 'rgba(201, 168, 76, 0.16)',
    soft: 'rgba(201, 168, 76, 0.1)',
    border: 'rgba(201, 168, 76, 0.32)',
  },
  sky: {
    fg: '#4E7D9E',
    iconBg: 'rgba(123, 175, 212, 0.18)',
    soft: 'rgba(123, 175, 212, 0.1)',
    border: 'rgba(123, 175, 212, 0.34)',
  },
};

const HAIRLINE = 'rgba(139, 115, 85, 0.15)';
const HAIRLINE_SOFT = 'rgba(139, 115, 85, 0.08)';
const PAPER = 'rgba(255, 254, 249, 0.9)';

/* ==================================================================
   Small content helpers
================================================================== */

const P = ({ children, last = false }) => (
  <Typography
    variant="body2"
    sx={{ color: 'text.secondary', lineHeight: 1.7, mb: last ? 0 : 1.25 }}
  >
    {children}
  </Typography>
);

const Steps = ({ items, ordered = true }) => (
  <List dense sx={{ pl: 2, py: 0.5 }}>
    {items.map((item, i) => (
      <ListItem
        key={i}
        sx={{
          display: 'list-item',
          listStyleType: ordered ? 'decimal' : 'disc',
          py: 0.25,
          pl: 0.5,
        }}
      >
        <ListItemText
          primary={item}
          primaryTypographyProps={{
            variant: 'body2',
            color: 'text.secondary',
            lineHeight: 1.7,
          }}
        />
      </ListItem>
    ))}
  </List>
);

const HelpTable = ({ headers, rows }) => (
  <TableContainer
    component={Paper}
    elevation={0}
    sx={{
      my: 1.5,
      border: `1px solid ${HAIRLINE}`,
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
                  borderBottom: `2px solid ${HAIRLINE}`,
                  whiteSpace: 'nowrap',
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '0.8rem',
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
                  borderBottom: `1px solid ${HAIRLINE_SOFT}`,
                  color: 'text.secondary',
                  fontSize: '0.85rem',
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

/* ==================================================================
   Content — categories, articles, FAQs
================================================================== */

const CATEGORIES = [
  {
    id: 'getting-started',
    title: 'Getting started',
    blurb: 'Set up your school, invite teachers, add classes and students.',
    accent: 'sage',
    icon: <RocketLaunchIcon sx={{ fontSize: 22 }} />,
    articles: [
      {
        id: 'first-login',
        title: 'Your first login',
        keywords: 'sign in account email password sso mylogin',
        body: (
          <>
            <P>
              Your school's administrator account is set up for you. You'll receive an email with
              your login details and a link to sign in. On first login you'll be prompted to change
              your password — it needs to be at least 8 characters.
            </P>
            <P last>
              If your school uses MyLogin single sign-on (SSO), sign in with your existing school
              credentials instead — there's no separate password to remember.
            </P>
          </>
        ),
      },
      {
        id: 'invite-teachers',
        title: 'Inviting teachers and admins',
        keywords: 'add user invite staff colleague admin teacher role manage users',
        body: (
          <>
            <Steps
              items={[
                <span key="1">
                  Go to <strong>Settings &rarr; Manage Users</strong>
                </span>,
                <span key="2">
                  Click <strong>Add User</strong>
                </span>,
                <span key="3">
                  Enter their name and email, and choose the <strong>Teacher</strong> role
                </span>,
                'They receive an email with login instructions',
              ]}
            />
            <P last>
              Teachers can manage students, classes and reading sessions. If a colleague needs to
              help with school-wide setup, give them the <strong>Admin</strong> role instead.
            </P>
          </>
        ),
      },
      {
        id: 'create-classes',
        title: 'Creating classes',
        keywords: 'class add class year group assign teacher',
        body: (
          <>
            <Steps
              items={[
                <span key="1">
                  Go to <strong>Classes</strong>
                </span>,
                <span key="2">
                  Click <strong>Add Class</strong>
                </span>,
                'Enter the class name (e.g. "Year 3 Oak")',
                'Assign a teacher to the class',
              ]}
            />
            <P last>
              If your school is connected to Wonde, classes and teacher assignments come from your
              MIS automatically — no need to create them by hand.
            </P>
          </>
        ),
      },
      {
        id: 'add-students',
        title: 'Adding students',
        keywords: 'pupil student new add reading level range wonde sync',
        body: (
          <>
            <Steps
              items={[
                <span key="1">
                  Go to <strong>Students</strong>
                </span>,
                <span key="2">
                  Click <strong>Add Student</strong>
                </span>,
                'Enter their name and assign them to a class',
                'Optionally set their reading level range (AR levels 1.0–13.0)',
              ]}
            />
            <P last>
              Wonde-connected schools don't need to do this — students sync automatically from your
              MIS each night.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'reading-sessions',
    title: 'Reading sessions',
    blurb: 'Log sessions, run the home reading register, and track progress.',
    accent: 'coral',
    icon: <AutoStoriesIcon sx={{ fontSize: 22 }} />,
    articles: [
      {
        id: 'log-session',
        title: 'Logging a reading session',
        keywords: 'record session school reading assessment slider notes book',
        body: (
          <>
            <P>
              The <strong>School Reading</strong> page records a one-to-one session in a few taps:
              pick the student, search for (or scan) the book they read, then use the assessment
              slider to record how independently they read — from Needing Help to Independent. Add a
              thumbs up or down for enjoyment and a note if there's anything worth remembering.
            </P>
            <P last>
              Sessions save immediately and update the student's reading status and streak straight
              away.
            </P>
          </>
        ),
      },
      {
        id: 'home-register',
        title: 'Using the Home Reading Register',
        keywords: 'home reading grid register class whole daily mark absent',
        body: (
          <>
            <P>
              The <strong>Home Reading</strong> tab logs the whole class at once in a grid view. Tap
              a cell to mark each student's status for the day: read, multiple reads, absent, or no
              record.
            </P>
            <P last>
              The date range controls (This Week, Last Week, Last Month, or a custom range) let you
              review or backfill several days at once — handy for marking up a week's worth of
              reading diaries in one sitting. Daily totals appear in the footer so you can see at a
              glance how many students read each day.
            </P>
          </>
        ),
      },
      {
        id: 'priority-list',
        title: 'The priority reading list',
        keywords: 'colour coding green yellow red overdue who needs reading next priority',
        body: (
          <>
            <P>
              The Students page colour-codes everyone by recency: green = read recently, yellow =
              needs attention, red = overdue. The thresholds are yours to set in Settings.
            </P>
            <P last>
              The <strong>Priority Reading List</strong> orders students by who needs reading the
              most — sorted by days since their last session. These students also appear at the top
              of the School Reading page, so anyone picking up the device knows exactly who to read
              with next.
            </P>
          </>
        ),
      },
      {
        id: 'student-history',
        title: "Viewing a student's reading history",
        keywords: 'timeline history profile edit details badges progress',
        body: (
          <P last>
            Tap any student card to open their profile — you'll see their full reading history,
            badge progress, and current streak, and you can edit their details or share a parent
            link from the same place.
          </P>
        ),
      },
    ],
  },
  {
    id: 'books-library',
    title: 'Books & library',
    blurb: 'Import your library, scan ISBNs, and set reading levels.',
    accent: 'amber',
    icon: <MenuBookIcon sx={{ fontSize: 22 }} />,
    articles: [
      {
        id: 'import-books',
        title: 'Importing your book library (CSV)',
        keywords: 'csv import spreadsheet bulk catalogue duplicate wizard',
        body: (
          <>
            <P>
              Go to <strong>Books &rarr; Import Books</strong> and upload a CSV exported from your
              library management system. The wizard will:
            </P>
            <Steps
              ordered={false}
              items={[
                'Auto-detect column headers (Title, Author, ISBN, etc.) — you can override manually',
                'Match exact duplicates and link them automatically to the shared catalogue',
                'Flag close matches for you to review one by one',
                'Create new entries for any books not already in the catalogue',
              ]}
            />
            <P last>
              ISBNs are the most reliable way to match — if your CSV has them, duplicate detection
              is very accurate. Get in touch if you need help preparing a CSV.
            </P>
          </>
        ),
      },
      {
        id: 'isbn-scan',
        title: 'Adding books by scanning ISBNs',
        keywords: 'barcode scanner camera scan isbn add book phone tablet',
        body: (
          <P last>
            Use the barcode scanner on a phone or tablet to add books by scanning the ISBN on the
            back cover — title, author and cover are filled in automatically. The library is shared
            across your school, so books added by any teacher are visible to all.
          </P>
        ),
      },
      {
        id: 'reading-levels',
        title: 'Reading levels',
        keywords: 'ar level range min max book level override',
        body: (
          <>
            <P>
              Each student has a reading level <em>range</em> (AR levels 1.0–13.0) rather than a
              single number, set on their profile. Books carry a reading level too, which powers
              recommendations and helps with shelf choices.
            </P>
            <P last>
              If a book's level doesn't match how your school grades it, you can change it — the
              change applies to your school only, without affecting other schools using the shared
              catalogue.
            </P>
          </>
        ),
      },
      {
        id: 'recommendations',
        title: 'How book recommendations work',
        keywords: 'recommend suggest ai focus mode balanced consolidation challenge',
        body: (
          <>
            <P>
              The <strong>Recommend</strong> tab searches your school's own library to find the best
              match for a student — so every suggestion is a book you actually have on the shelf.
              Choose a focus mode: <strong>Balanced</strong> (a mix of levels),{' '}
              <strong>Consolidation</strong> (confidence-building reads at or below level), or{' '}
              <strong>Challenge</strong> (stretch reads above level).
            </P>
            <P last>
              AI-powered suggestions are an optional add-on for broader recommendations beyond your
              library — schools can bring their own API key or purchase the add-on.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'achievements-stats',
    title: 'Achievements & stats',
    blurb: 'Badges, the class garden, streaks, and class-wide insights.',
    accent: 'sky',
    icon: <EmojiEventsIcon sx={{ fontSize: 22 }} />,
    articles: [
      {
        id: 'badges',
        title: 'How badges work',
        keywords: 'badge bookworm milestones rewards achievements earn automatic',
        body: (
          <>
            <P>
              Students earn badges automatically as they read — no manual input needed. Every time a
              session is saved, Tally checks whether any new badges have been unlocked and shows a
              celebration if so.
            </P>
            <Steps
              ordered={false}
              items={[
                <span key="1">
                  <strong>Milestones</strong> — First Finish (first book logged), Series Finisher
                  (3+ books by the same author)
                </span>,
                <span key="2">
                  <strong>Volume</strong> — Bookworm (books read) and Time Traveller (minutes read),
                  each with four tiers. Targets scale by year group so KS1 and KS2 are measured
                  fairly.
                </span>,
                <span key="3">
                  <strong>Consistency</strong> — Steady Reader (3 days in a week), Week Warrior
                  (every day in a week), Monthly Marvel (4+ days every week for a month)
                </span>,
                <span key="4">
                  <strong>Exploration</strong> — Genre Explorer (3, 5, or 7 genres), Fiction &amp;
                  Fact (both fiction and non-fiction)
                </span>,
                <span key="5">
                  <strong>Secret badges</strong> — a couple of surprises that only reveal themselves
                  when earned
                </span>,
              ]}
            />
          </>
        ),
      },
      {
        id: 'class-garden',
        title: 'The class garden',
        keywords: 'garden goals term seedling sprout bloom whiteboard completion',
        body: (
          <P last>
            On the <strong>Achievements</strong> tab, select a class to see the class garden — a
            visual display that grows through four stages (Seedling &rarr; Sprout &rarr; Bloom
            &rarr; Full Garden) as your class completes its goals for the term. It works well
            projected on a classroom whiteboard to celebrate progress together. The completion rate
            alongside shows what percentage of all possible badges have been earned across the
            class.
          </P>
        ),
      },
      {
        id: 'stats',
        title: 'Reading stats for your class',
        keywords: 'stats overview frequency trends needs attention insights',
        body: (
          <Steps
            ordered={false}
            items={[
              <span key="1">
                <strong>Overview</strong> — active reader counts, reading days, and session totals
                with trend indicators
              </span>,
              <span key="2">
                <strong>Frequency</strong> — which days of the week your class reads most
              </span>,
              <span key="3">
                <strong>Streaks</strong> — a leaderboard of the longest current streaks
              </span>,
              <span key="4">
                <strong>Needs Attention</strong> — students who haven't read recently, sorted by
                urgency
              </span>,
            ]}
          />
        ),
      },
      {
        id: 'streaks',
        title: 'Streaks and the grace period',
        keywords: 'streak days in a row grace period weekend break',
        body: (
          <P last>
            Reading on consecutive days builds a streak. The grace period setting (in{' '}
            <strong>Settings</strong>) lets students miss a day without breaking their streak —
            useful so weekends don't undo a good week.
          </P>
        ),
      },
    ],
  },
  {
    id: 'accounts-access',
    title: 'Accounts & access',
    blurb: 'Roles, passwords, MIS sync, and sharing with parents.',
    accent: 'sage',
    icon: <KeyIcon sx={{ fontSize: 22 }} />,
    articles: [
      {
        id: 'roles',
        title: 'Roles explained',
        keywords: 'admin teacher readonly permissions who can see what',
        body: (
          <Steps
            ordered={false}
            items={[
              <span key="1">
                <strong>Admin</strong> — school-wide management: users, classes, settings, and
                everything teachers can do
              </span>,
              <span key="2">
                <strong>Teacher</strong> — manages students, classes, books, and reading sessions
              </span>,
              <span key="3">
                <strong>Read-only</strong> — can view everything but change nothing
              </span>,
            ]}
          />
        ),
      },
      {
        id: 'reset-password',
        title: 'Resetting your password',
        keywords: 'forgot password reset link locked out email',
        body: (
          <>
            <P>
              Click <strong>Forgot Password</strong> on the login screen and enter your email
              address. You'll receive a reset link that's valid for one hour. If you don't see the
              email, check your spam folder.
            </P>
            <P last>
              If your school uses MyLogin single sign-on, password resets are handled by MyLogin
              directly — please contact your school's IT team.
            </P>
          </>
        ),
      },
      {
        id: 'wonde-sync',
        title: 'What syncs from Wonde',
        keywords: 'mis sims arbor wonde sync nightly students classes data',
        body: (
          <>
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
                ['Reading sessions, books, and progress', 'Stays in Tally', 'Never sent to Wonde'],
              ]}
            />
            <P last>
              We only read from your MIS — we never write back to it, and reading data never leaves
              Tally. Admins can trigger a manual sync at any time from{' '}
              <strong>Settings &rarr; Wonde Sync</strong>.
            </P>
          </>
        ),
      },
      {
        id: 'parent-sharing',
        title: 'Sharing progress with parents',
        keywords: 'parent portal qr code link share home view',
        body: (
          <P last>
            From a student's profile you can generate a QR code or link for their parents — scan it
            and they get a read-only view of their child's reading: recent sessions, streak, and
            badges. No account or password needed. Links last for the academic year, and you can
            regenerate one at any time, which invalidates the old link.
          </P>
        ),
      },
    ],
  },
  {
    id: 'school-it',
    title: 'For school IT',
    blurb: 'Whitelisting, browser support, and data protection.',
    accent: 'sky',
    icon: <ShieldIcon sx={{ fontSize: 22 }} />,
    articles: [
      {
        id: 'whitelist',
        title: 'Whitelisting tallyreading.uk',
        keywords: 'firewall filter blocked network domain allow list',
        body: (
          <>
            <P>
              Tally Reading is entirely web-based — no software installation is required. Your IT
              team just needs to ensure this domain is reachable from the school network:
            </P>
            <HelpTable
              headers={['Domain', 'Protocol', 'Port']}
              rows={[[<code key="d">tallyreading.uk</code>, 'HTTPS', '443']]}
            />
          </>
        ),
      },
      {
        id: 'browsers',
        title: 'Supported browsers',
        keywords: 'chrome edge safari browser requirements plugins',
        body: (
          <P last>
            Any modern browser works — we recommend the latest Google Chrome, Microsoft Edge, or
            Safari. No browser extensions or plugins are needed, and it works on tablets and phones
            as well as desktops.
          </P>
        ),
      },
      {
        id: 'gdpr',
        title: 'GDPR & data protection',
        keywords: 'gdpr privacy ico data protection dpia encryption security',
        body: (
          <>
            <P>
              Tally is fully GDPR compliant and built specifically for UK primary schools. Data is
              stored on Cloudflare's UK and EU infrastructure, encrypted in transit and at rest.
              We're registered with the ICO (registration number ZC098130) and act as your data
              processor.
            </P>
            <P last>
              For full details see our{' '}
              <Link href="/privacy" sx={{ color: 'primary.main', fontWeight: 600 }}>
                Privacy Policy
              </Link>
              , or request our DPIA by emailing{' '}
              <Link
                href="mailto:help@tallyreading.uk"
                sx={{ color: 'primary.main', fontWeight: 600 }}
              >
                help@tallyreading.uk
              </Link>
              .
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    blurb: 'Quick fixes for common bumps in the road.',
    accent: 'coral',
    icon: <BuildIcon sx={{ fontSize: 22 }} />,
    articles: [
      {
        id: 'connection-private',
        title: '"Your connection isn\'t private" error',
        keywords: 'connection private certificate error blocked firewall',
        body: (
          <P last>
            This means your school firewall or web filter is blocking <code>tallyreading.uk</code>.
            Ask your IT team to add it to the allowed domains list (HTTPS on port 443) — see the
            "For school IT" section for the details to forward.
          </P>
        ),
      },
      {
        id: 'class-missing',
        title: "A teacher can't see their class",
        keywords: 'missing class visibility assignment cannot see students',
        body: (
          <>
            <P>Class visibility is controlled by class assignments. To check:</P>
            <Steps
              items={[
                <span key="1">
                  Go to <strong>Settings &rarr; Manage Users</strong>
                </span>,
                'Find the teacher and click to edit',
                'Tick the classes they should have access to and save',
              ]}
            />
            <P last>
              For Wonde-synced schools, class assignments come from your MIS automatically on the
              nightly sync. If a class is missing, check that the teacher is listed as the form
              tutor or class teacher in your MIS.
            </P>
          </>
        ),
      },
      {
        id: 'login-stuck',
        title: 'Stuck on the login screen',
        keywords: 'cannot log in sign in stuck loop wrong password',
        body: (
          <>
            <P>
              Double-check the email address matches the one your account was set up with, and use{' '}
              <strong>Forgot Password</strong> if in doubt. If your school uses MyLogin, use the
              MyLogin button rather than the email and password fields.
            </P>
            <P last>
              Still stuck? Email us and we'll sort it — include the email address you're trying to
              sign in with.
            </P>
          </>
        ),
      },
      {
        id: 'report-problem',
        title: 'Reporting a problem',
        keywords: 'bug issue report support ticket feedback broken',
        body: (
          <P last>
            The quickest route is the support icon in the app header — messages sent from there
            include the page you were on, which helps us help you faster. Otherwise, email{' '}
            <Link
              href="mailto:help@tallyreading.uk"
              sx={{ color: 'primary.main', fontWeight: 600 }}
            >
              help@tallyreading.uk
            </Link>
            .
          </P>
        ),
      },
    ],
  },
];

const FAQS = [
  {
    q: 'What does Tally Reading cost?',
    a: (
      <P last>
        £1 per pupil, per year — no minimum spend and no surprises. AI-powered book recommendations
        are an optional add-on at £49 per year (or free if your school brings its own API key).
      </P>
    ),
  },
  {
    q: 'Can we try it before committing?',
    a: (
      <P last>
        Yes — UK primary schools get a free trial term, no card required. You can also explore the
        instant demo from the home page to see Tally with realistic data before signing up.
      </P>
    ),
  },
  {
    q: 'Do teachers need to install anything?',
    a: (
      <P last>
        No. Tally runs entirely in the browser — Chrome, Edge or Safari are all fine — on desktops,
        tablets and phones. There are no plugins, extensions, or apps to install.
      </P>
    ),
  },
  {
    q: 'Where is our data stored?',
    a: (
      <P last>
        On Cloudflare's UK and EU infrastructure, encrypted in transit and at rest. We're registered
        with the ICO (ZC098130) and act as your data processor — see our{' '}
        <Link href="/privacy" sx={{ color: 'primary.main', fontWeight: 600 }}>
          Privacy Policy
        </Link>{' '}
        for the full picture.
      </P>
    ),
  },
  {
    q: 'Does Tally write anything back to our MIS?',
    a: (
      <P last>
        No. The Wonde sync is strictly read-only — we pull students, classes and teacher assignments
        from your MIS, and reading data never leaves Tally.
      </P>
    ),
  },
  {
    q: 'Can parents see their child’s reading?',
    a: (
      <P last>
        Yes. Teachers can share a QR code or link from any student's profile that gives parents a
        read-only view of their child's sessions, streak and badges — no account needed, and the
        link can be revoked at any time.
      </P>
    ),
  },
  {
    q: 'Can reading volunteers use Tally?',
    a: (
      <P last>
        Yes — invite volunteers as teachers so they can log sessions. The priority reading list
        shows exactly who needs reading with next, so you can hand a volunteer the device and let
        them get straight to it.
      </P>
    ),
  },
  {
    q: 'What happens to our data if we leave?',
    a: (
      <P last>
        It's your school's data. If you stop using Tally we delete it — and we're happy to confirm
        that in writing for your records.
      </P>
    ),
  },
];

const POPULAR = [
  { catId: 'books-library', label: 'Importing your library' },
  { catId: 'school-it', label: 'Whitelisting tallyreading.uk' },
  { catId: 'reading-sessions', label: 'Home Reading Register' },
  { catId: 'achievements-stats', label: 'Badges' },
];

/* ==================================================================
   Contact dialog — posts to the public /api/contact endpoint
================================================================== */

const ContactDialog = ({ open, onClose }) => {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm({ name: '', email: '', message: '' });
      setError(null);
      setSent(false);
      setLoading(false);
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong — please try again.');
      }
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: '16px', backgroundColor: 'background.paper' } }}
    >
      <DialogContent sx={{ p: { xs: 3, sm: 4 }, position: 'relative' }}>
        <IconButton
          onClick={onClose}
          size="small"
          aria-label="Close"
          sx={{ position: 'absolute', top: 12, right: 12, color: 'text.secondary' }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        {sent ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: 'primary.main', mb: 2 }} />
            <Typography
              variant="h6"
              sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, mb: 1 }}
            >
              Message on its way
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              We'll get back to you as soon as we can — usually within two working days.
            </Typography>
            <Button
              onClick={onClose}
              variant="contained"
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '10px', px: 3 }}
            >
              Close
            </Button>
          </Box>
        ) : (
          <>
            <Typography
              variant="h5"
              sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, mb: 0.5 }}
            >
              How can we help?
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
              The more detail the better — your school name, what you tried, and what you expected
              all help us help you faster.
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                <TextField
                  label="Your name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  fullWidth
                  size="small"
                  disabled={loading}
                />
                <TextField
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  fullWidth
                  size="small"
                  disabled={loading}
                />
              </Box>
              <TextField
                label="Message"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
                fullWidth
                multiline
                rows={5}
                sx={{ mt: 2 }}
                disabled={loading}
              />
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mt: 2.5,
                  gap: 2,
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  We aim to reply within two working days.
                </Typography>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
                  endIcon={!loading ? <ArrowForwardIcon sx={{ fontSize: 16 }} /> : null}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: '10px',
                    px: 3,
                    flexShrink: 0,
                  }}
                >
                  {loading ? 'Sending…' : 'Send message'}
                </Button>
              </Box>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ==================================================================
   Page sections
================================================================== */

const CategoryCard = ({ category, openArticleId, onToggleArticle, forceOpen }) => {
  const accent = ACCENTS[category.accent];
  return (
    <Paper
      id={category.id}
      elevation={0}
      sx={{
        p: { xs: 2.5, sm: 3 },
        borderRadius: '18px',
        backgroundColor: PAPER,
        border: `1px solid ${HAIRLINE}`,
        position: 'relative',
        overflow: 'hidden',
        scrollMarginTop: '96px',
        transition: 'border-color 0.25s, box-shadow 0.25s',
        '@media (hover: hover) and (pointer: fine)': {
          '&:hover': {
            borderColor: accent.border,
            boxShadow: '0 8px 24px rgba(139, 115, 85, 0.1)',
          },
        },
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: -36,
          right: -36,
          width: 110,
          height: 110,
          borderRadius: '50%',
          backgroundColor: accent.soft,
          pointerEvents: 'none',
        }}
      />
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: '12px',
          backgroundColor: accent.iconBg,
          color: accent.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 1.5,
          position: 'relative',
        }}
      >
        {category.icon}
      </Box>
      <Typography
        variant="h6"
        component="h3"
        sx={{
          fontFamily: 'Fraunces, serif',
          fontWeight: 600,
          fontSize: '1.2rem',
          color: 'text.primary',
          mb: 0.5,
        }}
      >
        {category.title}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, lineHeight: 1.55 }}>
        {category.blurb}
      </Typography>

      <Box sx={{ borderTop: `1px solid ${HAIRLINE_SOFT}`, pt: 1 }}>
        {category.articles.map((article) => {
          const isOpen = forceOpen || openArticleId === article.id;
          return (
            <Box key={article.id}>
              <Box
                component="button"
                onClick={() => onToggleArticle(isOpen && !forceOpen ? null : article.id)}
                aria-expanded={isOpen}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1.5,
                  py: 1.1,
                  px: 0.5,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderRadius: '8px',
                  color: isOpen ? accent.fg : 'text.primary',
                  fontFamily: '"DM Sans", sans-serif',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  transition: 'color 0.18s',
                  '&:hover': { color: accent.fg },
                }}
              >
                <span>{article.title}</span>
                <ExpandMoreIcon
                  sx={{
                    fontSize: 18,
                    flexShrink: 0,
                    color: 'inherit',
                    opacity: 0.7,
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}
                />
              </Box>
              <Collapse in={isOpen}>
                <Box sx={{ pb: 1.5, px: 0.5 }}>{article.body}</Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
};

/* ==================================================================
   Help page
================================================================== */

const Help = () => {
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState('getting-started');
  const [openArticles, setOpenArticles] = useState({});
  const [expandedFaq, setExpandedFaq] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const searchRef = useRef(null);

  const searching = query.trim().length > 0;

  // Cmd/Ctrl+K focuses search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.map((c) => ({
      ...c,
      articles: c.articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.keywords.includes(q) ||
          c.title.toLowerCase().includes(q)
      ),
    })).filter((c) => c.articles.length > 0);
  }, [query]);

  const matchCount = useMemo(() => filtered.reduce((n, c) => n + c.articles.length, 0), [filtered]);

  // Scroll-spy for the sidebar
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: '-25% 0px -65% 0px' }
    );
    CATEGORIES.forEach((c) => {
      const el = document.getElementById(c.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [filtered]);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const toggleArticle = (catId) => (articleId) =>
    setOpenArticles((prev) => ({ ...prev, [catId]: articleId }));

  const handleFaqChange = (panel) => (_, isExpanded) => {
    setExpandedFaq(isExpanded ? panel : false);
  };

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
      {/* ── Sticky nav */}
      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          backdropFilter: 'blur(14px)',
          backgroundColor: 'rgba(251, 247, 240, 0.85)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <Container
          maxWidth="lg"
          sx={{
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Link href="/" underline="none" sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: '9px',
                background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(107, 142, 107, 0.3)',
              }}
            >
              <TallyLogo size={20} color="white" />
            </Box>
            <Typography
              sx={{
                fontFamily: 'Fraunces, serif',
                fontWeight: 600,
                fontSize: '1.25rem',
                color: 'text.primary',
                letterSpacing: '-0.02em',
              }}
            >
              Tally Reading
            </Typography>
          </Link>

          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              display: { xs: 'none', sm: 'block' },
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            <Link href="/" underline="hover" sx={{ color: 'text.secondary' }}>
              Home
            </Link>{' '}
            <Box component="span" sx={{ opacity: 0.4, mx: 0.5 }}>
              /
            </Box>{' '}
            <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
              Help centre
            </Box>
          </Typography>

          <Button
            onClick={() => setContactOpen(true)}
            variant="contained"
            size="small"
            startIcon={<ChatBubbleOutlineIcon sx={{ fontSize: 16 }} />}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: '999px',
              px: 2,
              boxShadow: 'none',
            }}
          >
            Contact us
          </Button>
        </Container>
      </Box>

      {/* ── Hero */}
      <Box sx={{ position: 'relative', overflow: 'hidden', textAlign: 'center', px: 2 }}>
        <Box
          aria-hidden
          component="svg"
          width="900"
          height="400"
          viewBox="0 0 900 400"
          fill="none"
          sx={{
            position: 'absolute',
            top: -120,
            left: '50%',
            transform: 'translateX(-50%)',
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        >
          <ellipse cx="450" cy="200" rx="440" ry="180" stroke="rgba(107,142,107,0.12)" />
          <ellipse cx="450" cy="200" rx="360" ry="140" stroke="rgba(196,124,90,0.1)" />
          <ellipse cx="450" cy="200" rx="280" ry="100" stroke="rgba(201,168,76,0.1)" />
        </Box>

        <Container maxWidth="sm" sx={{ position: 'relative', pt: { xs: 6, sm: 9 }, pb: 5 }}>
          <Chip
            icon={<HelpOutlineIcon sx={{ fontSize: 14 }} />}
            label="Help centre"
            size="small"
            sx={{
              mb: 2.5,
              backgroundColor: 'rgba(107, 142, 107, 0.1)',
              color: '#5A7A5A',
              border: '1px solid rgba(107, 142, 107, 0.18)',
              fontWeight: 600,
              '& .MuiChip-icon': { color: '#5A7A5A' },
            }}
          />
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontFamily: 'Fraunces, serif',
              fontWeight: 500,
              fontSize: { xs: '2.1rem', sm: '2.9rem' },
              color: 'text.primary',
              mb: 1.5,
              letterSpacing: '-0.02em',
            }}
          >
            How can we{' '}
            <Box component="span" sx={{ fontStyle: 'italic', fontWeight: 400, color: '#5A7A5A' }}>
              help
            </Box>{' '}
            today?
          </Typography>
          <Typography
            variant="body1"
            sx={{ color: 'text.secondary', maxWidth: 480, mx: 'auto', mb: 4, lineHeight: 1.6 }}
          >
            Guides, troubleshooting and quick answers for teachers, admins and IT — everything you
            need to keep readers turning pages.
          </Typography>

          {/* Search */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              pl: 2.5,
              pr: 1,
              py: 0.75,
              backgroundColor: PAPER,
              borderRadius: '999px',
              border: `1px solid ${HAIRLINE}`,
              boxShadow: '0 1px 2px rgba(45,42,38,0.04), 0 12px 32px rgba(45,42,38,0.06)',
              maxWidth: 560,
              mx: 'auto',
            }}
          >
            <SearchIcon sx={{ color: 'text.secondary', opacity: 0.6, flexShrink: 0 }} />
            <InputBase
              inputRef={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Search, e.g. "import" or "whitelist"'
              fullWidth
              sx={{ fontSize: '1rem', py: 0.5 }}
              inputProps={{ 'aria-label': 'Search help articles' }}
            />
            {query && (
              <IconButton size="small" onClick={() => setQuery('')} aria-label="Clear search">
                <CloseIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              </IconButton>
            )}
            <Box
              component="kbd"
              sx={{
                display: { xs: 'none', sm: 'block' },
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.7rem',
                color: 'text.secondary',
                backgroundColor: 'rgba(139, 115, 85, 0.07)',
                px: 1,
                py: 0.5,
                borderRadius: '6px',
                border: `1px solid ${HAIRLINE}`,
                mr: 0.5,
                whiteSpace: 'nowrap',
              }}
            >
              ⌘ K
            </Box>
          </Box>

          {/* Popular chips */}
          <Box
            sx={{
              mt: 2.5,
              display: 'flex',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: 1,
              alignItems: 'center',
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5 }}>
              Popular:
            </Typography>
            {POPULAR.map((p) => (
              <Chip
                key={p.label}
                label={p.label}
                size="small"
                onClick={() => {
                  setQuery('');
                  setTimeout(() => scrollTo(p.catId), 50);
                }}
                sx={{
                  backgroundColor: PAPER,
                  border: `1px solid ${HAIRLINE}`,
                  color: 'text.primary',
                  fontWeight: 500,
                  '&:hover': {
                    backgroundColor: 'rgba(107, 142, 107, 0.08)',
                    borderColor: 'rgba(107, 142, 107, 0.4)',
                  },
                }}
              />
            ))}
          </Box>
        </Container>
      </Box>

      {/* ── Quick actions */}
      <Container maxWidth="md" sx={{ mb: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
            gap: 1.75,
          }}
        >
          {[
            {
              icon: <EmailIcon sx={{ fontSize: 20 }} />,
              accent: 'sage',
              title: 'Email a human',
              sub: 'help@tallyreading.uk',
              href: 'mailto:help@tallyreading.uk',
            },
            {
              icon: <ChatBubbleOutlineIcon sx={{ fontSize: 20 }} />,
              accent: 'coral',
              title: 'Send a message',
              sub: 'We read every one',
              onClick: () => setContactOpen(true),
            },
            {
              icon: <ArrowBackIcon sx={{ fontSize: 20 }} />,
              accent: 'amber',
              title: 'Back to Tally Reading',
              sub: 'Return to the app',
              href: '/',
            },
          ].map((item) => {
            const accent = ACCENTS[item.accent];
            return (
              <Paper
                key={item.title}
                component={item.href ? 'a' : 'button'}
                href={item.href}
                onClick={item.onClick}
                elevation={0}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.75,
                  p: 2,
                  borderRadius: '14px',
                  backgroundColor: PAPER,
                  border: `1px solid ${HAIRLINE}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  textDecoration: 'none',
                  width: '100%',
                  transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
                  '@media (hover: hover) and (pointer: fine)': {
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 8px 24px rgba(139, 115, 85, 0.12)',
                      borderColor: accent.border,
                    },
                  },
                }}
              >
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '11px',
                    backgroundColor: accent.iconBg,
                    color: accent.fg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 700,
                      color: 'text.primary',
                      fontFamily: '"Nunito", sans-serif',
                    }}
                  >
                    {item.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {item.sub}
                  </Typography>
                </Box>
                <ArrowForwardIcon sx={{ fontSize: 16, color: 'text.secondary', opacity: 0.6 }} />
              </Paper>
            );
          })}
        </Box>
      </Container>

      {/* ── Main body: sidebar + content */}
      <Container maxWidth="lg" sx={{ pt: 4, pb: 8 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '220px 1fr' },
            gap: { xs: 3, md: 6 },
            alignItems: 'start',
          }}
        >
          {/* Sidebar */}
          <Box
            component="nav"
            aria-label="Help topics"
            sx={{
              position: 'sticky',
              top: 88,
              display: { xs: 'none', md: 'block' },
            }}
          >
            <Typography
              variant="overline"
              sx={{
                display: 'block',
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: 'text.secondary',
                opacity: 0.7,
                pl: 1.75,
                mb: 1,
              }}
            >
              Topics
            </Typography>
            {CATEGORIES.map((c) => {
              const isActive = activeSection === c.id;
              const accent = ACCENTS[c.accent];
              return (
                <Box
                  key={c.id}
                  component="button"
                  onClick={() => scrollTo(c.id)}
                  sx={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    py: 1,
                    px: 1.75,
                    mb: 0.25,
                    border: '1px solid',
                    borderColor: isActive ? 'rgba(107, 142, 107, 0.2)' : 'transparent',
                    borderRadius: '10px',
                    backgroundColor: isActive ? 'rgba(107, 142, 107, 0.1)' : 'transparent',
                    color: isActive ? '#5A7A5A' : 'text.primary',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: '"DM Sans", sans-serif',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    transition: 'background-color 0.18s',
                    '&:hover': {
                      backgroundColor: isActive
                        ? 'rgba(107, 142, 107, 0.1)'
                        : 'rgba(139, 115, 85, 0.06)',
                    },
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '3px',
                      backgroundColor: accent.fg,
                      opacity: 0.55,
                      flexShrink: 0,
                    }}
                  />
                  {c.title}
                </Box>
              );
            })}
          </Box>

          {/* Content */}
          <Box component="main">
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="overline"
                sx={{
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: 'text.secondary',
                  opacity: 0.7,
                }}
              >
                Browse by topic
              </Typography>
              <Typography
                variant="h4"
                component="h2"
                sx={{
                  fontFamily: 'Fraunces, serif',
                  fontWeight: 500,
                  fontSize: { xs: '1.5rem', sm: '1.8rem' },
                  color: 'text.primary',
                  mt: 0.5,
                }}
              >
                {searching ? `Results for “${query.trim()}”` : 'Find your way around'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75, maxWidth: 540 }}>
                {searching
                  ? `${matchCount} article${matchCount === 1 ? '' : 's'} matched.`
                  : 'Plain-English guides, with a real human at the end of every one.'}
              </Typography>
            </Box>

            {filtered.length === 0 ? (
              <Paper
                elevation={0}
                sx={{
                  backgroundColor: PAPER,
                  border: `1px dashed ${HAIRLINE}`,
                  borderRadius: '16px',
                  p: 6,
                  textAlign: 'center',
                }}
              >
                <SearchIcon sx={{ fontSize: 36, color: 'text.secondary', opacity: 0.5, mb: 1 }} />
                <Typography
                  variant="h6"
                  sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, mb: 0.5 }}
                >
                  No articles match “{query.trim()}”
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
                  Try a different word, or send us a message and we'll write the missing guide.
                </Typography>
                <Button
                  onClick={() => setContactOpen(true)}
                  variant="contained"
                  endIcon={<ArrowForwardIcon sx={{ fontSize: 15 }} />}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '10px' }}
                >
                  Ask us instead
                </Button>
              </Paper>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' },
                  gap: 2.25,
                }}
              >
                {filtered.map((category) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    openArticleId={openArticles[category.id] || null}
                    onToggleArticle={toggleArticle(category.id)}
                    forceOpen={searching}
                  />
                ))}
              </Box>
            )}

            {/* ── FAQ */}
            <Box sx={{ mt: 7 }} id="faq">
              <Typography
                variant="overline"
                sx={{
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: 'text.secondary',
                  opacity: 0.7,
                }}
              >
                Frequently asked
              </Typography>
              <Typography
                variant="h4"
                component="h2"
                sx={{
                  fontFamily: 'Fraunces, serif',
                  fontWeight: 500,
                  fontSize: { xs: '1.5rem', sm: '1.8rem' },
                  color: 'text.primary',
                  mt: 0.5,
                  mb: 2.5,
                }}
              >
                Quick answers
              </Typography>

              <Paper
                elevation={0}
                sx={{
                  backgroundColor: PAPER,
                  border: `1px solid ${HAIRLINE}`,
                  borderRadius: '18px',
                  overflow: 'hidden',
                }}
              >
                {FAQS.map((faq, i) => (
                  <Accordion
                    key={i}
                    expanded={expandedFaq === i}
                    onChange={handleFaqChange(i)}
                    elevation={0}
                    disableGutters
                    sx={{
                      backgroundColor: 'transparent',
                      borderBottom: i === FAQS.length - 1 ? 'none' : `1px solid ${HAIRLINE_SOFT}`,
                      '&:before': { display: 'none' },
                      ...(expandedFaq === i && {
                        backgroundColor: 'rgba(255, 254, 249, 0.6)',
                      }),
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon sx={{ color: 'primary.main' }} />}
                      sx={{ px: 3, minHeight: 60 }}
                    >
                      <Typography
                        sx={{
                          fontFamily: '"Nunito", sans-serif',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          color: expandedFaq === i ? 'primary.dark' : 'text.primary',
                        }}
                      >
                        {faq.q}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 3, pt: 0, pb: 2.5, maxWidth: 720 }}>
                      {faq.a}
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Paper>
            </Box>

            {/* ── Contact card */}
            <Paper
              elevation={0}
              sx={{
                mt: 7,
                p: { xs: 3.5, sm: 5 },
                borderRadius: '22px',
                border: `1px solid ${HAIRLINE}`,
                background:
                  'linear-gradient(135deg, rgba(107,142,107,0.1) 0%, rgba(255,254,249,0.7) 50%, rgba(196,124,90,0.08) 100%)',
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'flex-start', sm: 'center' },
                gap: 3,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  bottom: -60,
                  right: -40,
                  width: 200,
                  height: 200,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(107, 142, 107, 0.08)',
                  pointerEvents: 'none',
                }}
              />
              <Box sx={{ flex: 1, position: 'relative' }}>
                <Typography
                  variant="h5"
                  component="h2"
                  sx={{
                    fontFamily: 'Fraunces, serif',
                    fontWeight: 500,
                    fontSize: { xs: '1.35rem', sm: '1.6rem' },
                    color: 'text.primary',
                    mb: 1,
                  }}
                >
                  Still need a hand?
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: 'text.secondary', maxWidth: 460, lineHeight: 1.6 }}
                >
                  We're a small UK team and we read every message. Tell us what you're stuck on and
                  we'll get back to you with a fix, a workaround, or a friendly nudge — usually
                  within two working days.
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.25, flexShrink: 0, position: 'relative' }}>
                <Button
                  onClick={() => setContactOpen(true)}
                  variant="contained"
                  startIcon={<ChatBubbleOutlineIcon sx={{ fontSize: 16 }} />}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '12px', px: 2.5 }}
                >
                  Send a message
                </Button>
                <Button
                  component="a"
                  href="mailto:help@tallyreading.uk"
                  variant="outlined"
                  startIcon={<EmailIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: '12px',
                    px: 2.5,
                    backgroundColor: 'rgba(255,255,255,0.6)',
                    borderColor: HAIRLINE,
                    color: 'text.primary',
                    '&:hover': {
                      borderColor: 'primary.main',
                      backgroundColor: 'rgba(255,255,255,0.8)',
                    },
                  }}
                >
                  Email
                </Button>
              </Box>
            </Paper>
          </Box>
        </Box>
      </Container>

      {/* ── Footer */}
      <Box component="footer" sx={{ borderTop: `1px solid ${HAIRLINE}`, py: 4 }}>
        <Container
          maxWidth="lg"
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
            Scratch IT LTD &middot; Company 08151576 &middot; ICO ZC098130
          </Typography>
          <Box sx={{ display: 'flex', gap: 2.5 }}>
            {[
              { label: 'Privacy', href: '/privacy' },
              { label: 'Terms', href: '/terms' },
              { label: 'Cookies', href: '/cookies' },
            ].map((l) => (
              <Link
                key={l.label}
                href={l.href}
                underline="hover"
                sx={{ color: 'text.secondary', fontSize: '0.8rem' }}
              >
                {l.label}
              </Link>
            ))}
          </Box>
        </Container>
      </Box>

      <ContactDialog open={contactOpen} onClose={() => setContactOpen(false)} />
    </Box>
  );
};

export default Help;
