import React, { useEffect, useRef, useState } from 'react';
import './LandingPage.css';

import screenshotStudents from '../assets/screenshots/screenshot-students.png';
import screenshotReading from '../assets/screenshots/screenshot-reading.png';
import screenshotRegister from '../assets/screenshots/screenshot-register.png';
import screenshotRecommendations from '../assets/screenshots/screenshot-recommendations.png';
import screenshotStats from '../assets/screenshots/screenshot-stats.png';
import screenshotParent from '../assets/screenshots/screenshot-parent-portal.png';
import TallyLogo from './TallyLogo';
import { useAuth } from '../contexts/AuthContext';

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M6 3l5 5-5 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Tick = () => (
  <svg className="tick" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path
      d="M3.5 9.5l3.5 3.5 7.5-8"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const WondeLogo = ({ size = 30 }) => (
  <svg viewBox="0 0 40 48" width={size} height={size * 1.2} fill="#4162fe" aria-hidden="true">
    <path d="M20,0A67.191,67.191,0,0,0,0,3V24.96C0,36.48,8,44.16,20,48c12-3.84,20-11.52,20-23.04V3A67.1959,67.1959,0,0,0,20,0M30,5V24L20,18,10,24V5c3-1,10-1,10-1s7,0,10,1M20,43.781A28.3649,28.3649,0,0,1,8.602,36.802L20,29.914l11.398,6.888A28.3783,28.3783,0,0,1,20,43.781" />
  </svg>
);

const TOUR_ROWS = [
  {
    flip: false,
    tag: 'Reading sessions',
    tagClass: 'green',
    tagIcon: '📖',
    title: 'Record a session in seconds',
    desc: 'Pick a student, scan or search for the book, assess how independently they read, and add a note. The whole thing takes less time than finding your pen used to.',
    points: [
      'Scan the ISBN barcode to add any book',
      'Assessment slider from Needing help to Independent',
    ],
    img: screenshotReading,
    alt: 'Recording a reading session in Tally',
  },
  {
    flip: true,
    tag: 'Home reading',
    tagClass: 'coral',
    tagIcon: '📋',
    title: 'Save 10 minutes per class, every day',
    desc: "Diaries come in, you tap a few buttons, and the whole class is logged — who's read, how often, and what book they're on. Simple, fast, and you don't even have to find a pen.",
    points: ['Whole-class register in one grid view', 'Backfill a whole week in one sitting'],
    img: screenshotRegister,
    alt: 'The Home Reading Register grid view',
  },
  {
    flip: false,
    tag: 'Parent portal',
    tagClass: 'green',
    tagIcon: '👨‍👩‍👧',
    title: 'Home reading, connected',
    desc: 'Print a sheet of QR codes, send them home, and parents scan to see their child’s progress and log reading — straight from their phone. No app to install, no password to remember.',
    points: [
      'One QR code per child, printed and ready',
      'Progress stays joined up between home and school',
    ],
    img: screenshotParent,
    alt: 'The parent reading portal opened from a QR code',
  },
  {
    flip: true,
    tag: 'Recommendations',
    tagClass: 'amber',
    tagIcon: '✨',
    title: '“What should they read next?”',
    desc: 'Suggestions that consider reading level, genre preferences, and what each child has enjoyed before — drawn from books you actually have on the shelf, with real covers and real reasons.',
    points: ["Matched from your school's own library", 'Optional AI suggestions for broader picks'],
    img: screenshotRecommendations,
    alt: 'Personalised book recommendations for a pupil',
  },
  {
    flip: false,
    tag: 'Reading stats',
    tagClass: 'sky',
    tagIcon: '📊',
    title: 'See the bigger picture',
    desc: 'Track reading patterns across your class with clear stats — sessions this week, streaks, home versus school reading, and who’s leading the way. All at a glance, for teachers and leadership alike.',
    points: [
      'Active readers, reading days and trends',
      'A Needs Attention list, sorted by urgency',
    ],
    img: screenshotStats,
    alt: 'The class reading statistics dashboard',
  },
];

const FEATURES = [
  {
    icon: '📱',
    title: 'Scan & go',
    desc: 'Point your iPad at a barcode to instantly look up any book. No more typing titles or guessing authors — scan the ISBN and start.',
  },
  {
    icon: '📝',
    title: 'Notes that matter',
    desc: "Record observations, track vocabulary, note enjoyment. Build a rich picture of each child's reading journey teachers can use.",
  },
  {
    icon: '🏅',
    title: 'Badges & goals',
    desc: 'Children earn reading badges and grow a class garden as they read. Set goals and watch the whole class light up.',
  },
  {
    icon: '📚',
    title: '2,400+ books',
    desc: 'A shared library with covers, reading levels and genres. Search, filter, scan, or import your whole collection from a CSV.',
  },
  {
    icon: '👨‍👩‍👧',
    title: 'Parents in the loop',
    desc: 'Print QR codes, send them home, and parents log reading from their phone — no app, no login, no friction.',
  },
  {
    icon: '🔒',
    title: 'Safe & simple',
    desc: 'GDPR-compliant, EU-hosted, and built around children’s data protection. No ads, no tracking, no nonsense.',
  },
];

const STEPS = [
  {
    num: '1',
    title: 'Set up your school',
    desc: 'Import your pupil list from a CSV, or connect via Wonde and your classes, students and teachers sync automatically from your MIS.',
  },
  {
    num: '2',
    title: 'Start reading',
    desc: 'Pick a pupil, scan or search for the book, and record the session. Notes, ratings and vocabulary — all optional, all useful.',
  },
  {
    num: '3',
    title: 'Watch them grow',
    desc: 'Track reading patterns over time, get recommendations, and send QR codes home so parents can see progress and log reading too.',
  },
];

const CORE_FEATURES = [
  'Reading session tracking',
  'Home reading register',
  'Parent portal with QR codes',
  'Book library with barcode scanning',
  'Reading stats, badges & reading garden',
  'Wonde MIS integration & CSV import/export',
];

const AI_FEATURES = [
  'Unlimited AI book recommendations',
  "Personalised to each child's reading journey",
  'Choice of AI provider',
];

export default function LandingPage({ onSignIn }) {
  const { loginWithDemo } = useAuth();
  const [navScrolled, setNavScrolled] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState(null);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const revealRefs = useRef(new Set());

  const [cookieBannerDismissed, setCookieBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem('cookieBannerDismissed') === 'true';
    } catch {
      return false;
    }
  });

  const dismissCookieBanner = () => {
    setCookieBannerDismissed(true);
    try {
      localStorage.setItem('cookieBannerDismissed', 'true');
    } catch {
      // ignore
    }
  };

  const handleTryDemo = async () => {
    setDemoLoading(true);
    try {
      const response = await fetch('/api/auth/demo', { method: 'POST' });
      if (!response.ok) throw new Error('Demo unavailable');
      const data = await response.json();
      // Delegate storage + state updates to AuthContext so the demo path
      // stays in sync with /auth/login and /auth/mylogin/callback.
      loginWithDemo(data);
      window.location.href = '/';
    } catch {
      setDemoLoading(false);
    }
  };

  const handleContact = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.querySelector('input[name="name"]').value;
    const email = form.querySelector('input[name="email"]').value;
    const message = form.querySelector('textarea[name="message"]').value;
    setContactLoading(true);
    setContactError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong');
      }
      setContactSubmitted(true);
    } catch (err) {
      setContactError(err.message);
    } finally {
      setContactLoading(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => setNavScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    revealRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const addRevealRef = (el) => {
    if (el) revealRefs.current.add(el);
  };

  return (
    <div className="landing-page">
      {/* NAV */}
      <header className={`nav${navScrolled ? ' scrolled' : ''}`}>
        <div className="wrap nav-inner">
          <a className="brand" href="#top" aria-label="Tally Reading home">
            <span className="brand-mark" aria-hidden="true">
              <TallyLogo size={20} />
            </span>
            <span>Tally</span>
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a className="navlink" href="#tour">
              See it
            </a>
            <a className="navlink" href="#features">
              Features
            </a>
            <a className="navlink" href="#pricing">
              Pricing
            </a>
            <div className="nav-cta">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onSignIn}>
                Sign in
              </button>
              <a className="btn btn-primary btn-sm" href="#start">
                Start free trial
              </a>
            </div>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="hero">
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">
                <span className="dot" /> Free trial for UK primary schools
              </span>
              <h1>
                Keep a <span className="hl">tally</span> of every reading moment
              </h1>
              <p className="hero-sub">
                A simple, thoughtful app that helps teachers and reading volunteers track sessions,
                discover books, and watch young readers grow — without the paperwork.
              </p>
              <div className="hero-actions">
                <a className="btn btn-primary btn-lg" href="#start">
                  Start free trial
                  <ChevronRight />
                </a>
                <button
                  type="button"
                  className="btn btn-outline btn-lg"
                  onClick={handleTryDemo}
                  disabled={demoLoading}
                >
                  {demoLoading ? 'Loading demo…' : 'Explore the live demo'}
                </button>
              </div>
              <div className="hero-trust">
                <span className="ht">
                  <span className="tick">£1</span> per pupil, per year
                </span>
                <span className="sep" />
                <span className="ht">GDPR · EU-hosted</span>
                <span className="sep" />
                <span className="ht">Syncs with your MIS</span>
              </div>
            </div>
            <div className="shot hero-shot">
              <div className="shot-frame">
                <img
                  src={screenshotStudents}
                  alt="Tally Reading Students view, showing the priority reading list for a class"
                />
              </div>
              <div className="float">
                <img
                  src={screenshotRecommendations}
                  alt="Book recommendations matched to a child's reading level"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* METRIC STRIP */}
        <section className="strip">
          <div className="wrap strip-inner">
            <div className="metric">
              <b>£1</b>
              <span>per pupil, per year — no minimum spend</span>
            </div>
            <span className="vr" />
            <div className="metric">
              <b>~10 min</b>
              <span>saved per class, every day</span>
            </div>
            <span className="vr" />
            <div className="metric">
              <b>2,400+</b>
              <span>books in the shared library</span>
            </div>
          </div>
        </section>

        {/* PRODUCT TOUR */}
        <section className="section" id="tour">
          <div className="wrap">
            <div className="shead reveal" ref={addRevealRef}>
              <span className="eyebrow">
                <span className="dot" /> See it in action
              </span>
              <h2>Real screens, real reading sessions</h2>
              <p>
                This is what it actually looks like when you sit down with a child and a book — on
                the tablet that’s already in the classroom.
              </p>
            </div>

            <div className="tour">
              {TOUR_ROWS.map((row, i) => (
                <article
                  className={`row${row.flip ? ' flip' : ''} reveal`}
                  key={i}
                  ref={addRevealRef}
                >
                  <div className="row-text">
                    <span className={`tag ${row.tagClass}`}>
                      {row.tagIcon} {row.tag}
                    </span>
                    <h3>{row.title}</h3>
                    <p>{row.desc}</p>
                    <ul className="row-points">
                      {row.points.map((point, j) => (
                        <li key={j}>
                          <Tick /> {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="row-media">
                    <div className="shot-frame">
                      <img src={row.img} alt={row.alt} loading="lazy" />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURE GRID */}
        <section className="section tinted" id="features">
          <div className="wrap">
            <div className="shead reveal" ref={addRevealRef}>
              <h2>
                Everything you need,
                <br />
                nothing you don’t
              </h2>
              <p>
                Designed around how teachers and reading volunteers actually work — on tablets,
                between sessions, one child at a time.
              </p>
            </div>
            <div className="fgrid">
              {FEATURES.map((f, i) => (
                <div className="fcard reveal" key={i} ref={addRevealRef}>
                  <div className="ficon">{f.icon}</div>
                  <h4>{f.title}</h4>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>

            <div className="wonde reveal" ref={addRevealRef}>
              <span className="wonde-logo" aria-hidden="true">
                <WondeLogo size={30} />
              </span>
              <div>
                <h4>Integrated with Wonde</h4>
                <p>
                  Connect your school MIS and your classes, students and teachers sync automatically
                  — with single sign-on for all staff. No spreadsheets, no manual data entry.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="section">
          <div className="wrap">
            <div className="shead reveal" ref={addRevealRef}>
              <h2>Up and running in minutes</h2>
              <p>No training needed. If you can use a tablet, you can use Tally.</p>
            </div>
            <div className="steps">
              {STEPS.map((step, i) => (
                <div className="step reveal" key={i} ref={addRevealRef}>
                  <div className="step-n">{step.num}</div>
                  <h4>{step.title}</h4>
                  <p>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className="section tinted" id="pricing">
          <div className="wrap">
            <div className="shead reveal" ref={addRevealRef}>
              <h2>Simple, honest pricing</h2>
              <p>
                £1 per pupil, per year. No surprises, no minimum spend, and a free term to try it
                with one class.
              </p>
            </div>
            <div className="pricing-cards">
              <div className="pcard reveal" ref={addRevealRef}>
                <span className="ptag">Core</span>
                <div className="price">
                  <span className="amt">£1</span>
                  <span className="per">/ pupil / year</span>
                </div>
                <p className="pnote">That’s it. No hidden fees.</p>
                <ul className="pfeatures">
                  {CORE_FEATURES.map((f, i) => (
                    <li key={i}>
                      <Tick /> {f}
                    </li>
                  ))}
                </ul>
                <a className="btn btn-outline" href="#start">
                  Start free trial
                </a>
              </div>
              <div className="pcard featured reveal" ref={addRevealRef}>
                <span className="ptag">Core + AI</span>
                <div className="price">
                  <span className="amt">+£49</span>
                  <span className="per">/ year</span>
                </div>
                <p className="pnote">Add to any plan, whole school.</p>
                <ul className="pfeatures">
                  {AI_FEATURES.map((f, i) => (
                    <li key={i}>
                      <Tick /> {f}
                    </li>
                  ))}
                </ul>
                <a className="btn btn-primary" href="#start">
                  Start free trial
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* TRUST */}
        <section className="section">
          <div className="wrap trust">
            <div className="reveal" ref={addRevealRef}>
              <h2>Built with schools, for schools</h2>
              <p>
                Tally was born from real reading sessions at a real primary school. We know the iPad
                is balanced on a tiny chair, the session is twenty minutes, and the child just wants
                to read — not wait for software to load.
              </p>
              <div className="trust-items">
                <span className="trust-item">
                  <span className="ti">🇪🇺</span> EU-hosted data
                </span>
                <span className="trust-item">
                  <span className="ti">🔒</span> GDPR compliant
                </span>
                <span className="trust-item">
                  <span className="ti">
                    <WondeLogo size={15} />
                  </span>{' '}
                  Wonde MIS integration
                </span>
                <span className="trust-item">
                  <span className="ti">💬</span> Real human support
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="section" id="start" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="cta-box reveal" ref={addRevealRef}>
              <h2>Start your free trial</h2>
              <p>
                Drop us a message and we’ll get your school set up — no commitment, no card details.
              </p>
              {!contactSubmitted ? (
                <form className="cta-form" onSubmit={handleContact} noValidate>
                  <div className="frow">
                    <input
                      className="field"
                      type="text"
                      name="name"
                      placeholder="Your name"
                      required
                      maxLength={100}
                      autoComplete="name"
                      disabled={contactLoading}
                    />
                  </div>
                  <input
                    className="field"
                    type="email"
                    name="email"
                    placeholder="your.name@school.sch.uk"
                    required
                    autoComplete="email"
                    disabled={contactLoading}
                  />
                  <textarea
                    className="field"
                    name="message"
                    placeholder="How can we help?"
                    required
                    maxLength={5000}
                    disabled={contactLoading}
                  />
                  <button
                    className="btn btn-primary btn-lg"
                    type="submit"
                    disabled={contactLoading}
                  >
                    {contactLoading ? 'Sending…' : 'Send message'}
                  </button>
                  {contactError && <p className="cta-error">{contactError}</p>}
                  <p className="cta-note">
                    We’ll reply to your email within one working day. See our{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">
                      Privacy Policy
                    </a>
                    .
                  </p>
                </form>
              ) : (
                <div className="cta-thanks">
                  <p className="cta-thanks-title">Thanks for getting in touch!</p>
                  <p>We’ll reply to your email shortly.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <div className="wrap footer-inner">
          <a className="brand" href="#top">
            <span className="brand-mark" aria-hidden="true">
              <TallyLogo size={16} />
            </span>
            <span>Tally</span>
          </a>
          <span className="footer-meta">© 2026 Tally Reading. Made in Bristol.</span>
          <ul className="footer-links">
            <li>
              <a href="/help" target="_blank" rel="noopener noreferrer">
                Help
              </a>
            </li>
            <li>
              <a href="/privacy" target="_blank" rel="noopener noreferrer">
                Privacy
              </a>
            </li>
            <li>
              <a href="/terms" target="_blank" rel="noopener noreferrer">
                Terms
              </a>
            </li>
            <li>
              <a href="/cookies" target="_blank" rel="noopener noreferrer">
                Cookies
              </a>
            </li>
          </ul>
        </div>
      </footer>

      {!cookieBannerDismissed && (
        <div className="cookie-banner" role="region" aria-label="Cookie notice">
          <p className="cookie-text">
            We use one cookie to keep you securely signed in. No tracking, no analytics, no
            third-party cookies.{' '}
            <a href="/cookies" className="cookie-link">
              Cookie policy
            </a>
          </p>
          <button className="cookie-dismiss" onClick={dismissCookieBanner}>
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
