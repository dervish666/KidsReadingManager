import React, { useEffect, useRef, useState } from 'react';
import './LandingPage.css';

import screenshotStudents from '../assets/screenshots/screenshot-students.webp';
import screenshotReading from '../assets/screenshots/screenshot-reading.webp';
import screenshotRegister from '../assets/screenshots/screenshot-register.webp';
import screenshotRecommendations from '../assets/screenshots/screenshot-recommendations.webp';
import screenshotStats from '../assets/screenshots/screenshot-stats.webp';
import screenshotParent from '../assets/screenshots/screenshot-parent-portal.webp';
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
    desc: 'Pick a student, scan or search for the book, rate how independently they read, and add a note. It takes less time than finding your pen used to.',
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
    desc: 'Diaries come in, you tap down the column, and the class is logged. Four buttons per child: read, read more than once, absent, or nothing this time.',
    points: ['Whole-class register in one grid view', 'Backfill a whole week in one sitting'],
    img: screenshotRegister,
    alt: 'The Home Reading Register grid view',
  },
  {
    flip: false,
    tag: 'Parent portal',
    tagClass: 'green',
    tagIcon: '👨‍👩‍👧',
    title: 'A QR code instead of a login',
    desc: 'Print a sheet of QR codes and send them home. Parents scan one with a phone camera to see how their child is getting on, and to add the ten minutes they did last night. Nothing to install and no password for anyone to forget.',
    points: [
      'One QR code per child, printed and ready',
      'Reading logged at home lands in your class view',
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
    desc: 'Matched on reading level, the genres they like and what they’ve finished before. Every suggestion is a book your school already owns, with the cover and a sentence saying why.',
    points: ["Matched from your school's own library", 'Optional AI suggestions for broader picks'],
    img: screenshotRecommendations,
    alt: 'Personalised book recommendations for a pupil',
  },
  {
    flip: false,
    tag: 'Reading stats',
    tagClass: 'sky',
    tagIcon: '📊',
    title: 'Spot the child who’s gone quiet',
    desc: 'Sessions this week, reading streaks, home against school, and the children nobody has heard from in a fortnight. The same page works for a class teacher and for a head who wants the whole-school figure.',
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
    desc: 'Point the iPad at a barcode and the book looks itself up. Title, author, cover, reading level, the lot.',
  },
  {
    icon: '📝',
    title: 'Notes worth keeping',
    desc: "Jot down the word they stumbled on, the series they’ve got into, whether they wanted to carry on. Next year's teacher inherits the context, not just the dates.",
  },
  {
    icon: '🏅',
    title: 'Badges & goals',
    desc: 'Children earn badges as they read, and the class garden grows with them. Set a class goal and they’ll ask you every morning how close it is.',
  },
  {
    icon: '📚',
    title: '2,400+ books',
    desc: 'A shared catalogue with covers, reading levels and genres. Search it, filter it, scan it, or import your own collection from a spreadsheet.',
  },
  {
    icon: '👨‍👩‍👧',
    title: 'Parents included',
    desc: 'A printed code in the reading diary is all a parent needs. They scan it, see the term so far, and add tonight’s reading.',
  },
  {
    icon: '🔒',
    title: 'Safe with children’s data',
    desc: 'EU-hosted and GDPR-compliant, designed around children’s data from the first line. One cookie, to keep you signed in. No ads and no trackers.',
  },
];

const STEPS = [
  {
    num: '1',
    title: 'Set up your school',
    desc: 'Upload a CSV of your pupils, or connect Wonde and let your classes, pupils and staff come straight from the MIS.',
  },
  {
    num: '2',
    title: 'Start reading',
    desc: 'Pick a pupil, scan or search for the book, record how it went. Notes, ratings and vocabulary are all optional, and all worth having.',
  },
  {
    num: '3',
    title: 'Send it home',
    desc: 'Watch the pattern build over a term, get suggestions for what each child reads next, and send QR codes home so parents can join in.',
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
  'Picked for what each child has already read',
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
                Keep a <span className="hl">tally</span> of what every child is reading
              </h1>
              <p className="hero-sub">
                Reading records for primary schools, without the paperwork. Teachers and volunteers
                log a session in seconds, find the next book, and see who hasn’t read this week.
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
              <span>per pupil, per year, no minimum spend</span>
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
              <h2>Screenshots, not mock-ups</h2>
              <p>
                This is what it looks like when you sit down with a child and a book, on the tablet
                that’s already in the classroom.
              </p>
            </div>

            <figure className="guide-video reveal" ref={addRevealRef}>
              <div className="shot-frame">
                <video
                  controls
                  preload="none"
                  playsInline
                  poster="/tally-guide-poster.webp"
                  width="1280"
                  height="720"
                >
                  <source src="/tally-guide.mp4" type="video/mp4" />
                  Your browser can’t play this video.{' '}
                  <a href="/tally-guide.mp4">Download it instead</a>.
                </video>
              </div>
              <figcaption>
                Thirty seconds on how it fits together. Subtitled, so it works with the sound off.
              </figcaption>
            </figure>

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
                Enough to be useful,
                <br />
                small enough to learn in a morning
              </h2>
              <p>
                Built for the way reading happens in school: on a tablet, squeezed between other
                things, one child at a time.
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
                  Connect your MIS and your classes, pupils and staff arrive on their own, then stay
                  in step overnight. Staff sign in with the MyLogin details they already use, so
                  there’s no second password and no spreadsheet to keep up to date.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="section">
          <div className="wrap">
            <div className="shead reveal" ref={addRevealRef}>
              <h2>Three steps to the first session</h2>
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
              <h2>£1 per pupil, per year</h2>
              <p>
                No minimum spend and no per-teacher licences. There’s a free 30-day trial, so you
                can run it with one class before you commit the budget.
              </p>
            </div>
            <div className="pricing-cards">
              <div className="pcard reveal" ref={addRevealRef}>
                <span className="ptag">Core</span>
                <div className="price">
                  <span className="amt">£1</span>
                  <span className="per">/ pupil / year</span>
                </div>
                <p className="pnote">That’s the whole bill.</p>
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
                <p className="pnote">Whole school, on top of the £1.</p>
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
              <h2>Written between reading sessions</h2>
              <p>
                Tally started at a Bristol primary school, built by someone sitting in on the
                reading sessions. That’s where the shape of it comes from: the iPad balanced on a
                tiny chair, twenty minutes on the clock, and a child who wants to read rather than
                watch a screen load.
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
                  <span className="ti">💬</span> Emails answered by a person
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
                Send us a message and we’ll get your school set up. No commitment, and we won’t ask
                for card details.
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
            <li>
              <a href="/legal" target="_blank" rel="noopener noreferrer">
                Legal
              </a>
            </li>
          </ul>
        </div>
      </footer>

      {!cookieBannerDismissed && (
        <div className="cookie-banner" role="region" aria-label="Cookie notice">
          <p className="cookie-text">
            We use one cookie, to keep you signed in. No analytics and no third-party cookies.{' '}
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
