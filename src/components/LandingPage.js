import React, { useEffect, useRef, useState } from 'react';
import './LandingPage.css';

import screenshotStudents from '../assets/screenshots/screenshot-students.png';
import screenshotReading from '../assets/screenshots/screenshot-reading.png';
import screenshotRegister from '../assets/screenshots/screenshot-register.png';
import screenshotRecommendations from '../assets/screenshots/screenshot-recommendations.png';
import screenshotStats from '../assets/screenshots/screenshot-stats.png';
import screenshotBooks from '../assets/screenshots/screenshot-books.png';
import TallyLogo from './TallyLogo';

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M6 3l5 5-5 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function LandingPage({ onSignIn }) {
  const [navScrolled, setNavScrolled] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const revealRefs = useRef(new Set());

  const handleTryDemo = async () => {
    setDemoLoading(true);
    try {
      const response = await fetch('/api/auth/demo', { method: 'POST' });
      if (!response.ok) throw new Error('Demo unavailable');
      const data = await response.json();
      const userWithOrg = {
        ...data.user,
        organizationId: data.organization?.id,
        organizationName: data.organization?.name,
        organizationSlug: data.organization?.slug,
      };
      localStorage.setItem('krm_auth_token', data.accessToken);
      localStorage.setItem('krm_user', JSON.stringify(userWithOrg));
      localStorage.setItem('krm_auth_mode', 'multitenant');
      // Auto-select the demo teacher's assigned class
      if (data.user.assignedClassIds?.length > 0) {
        sessionStorage.setItem('pendingClassAutoFilter', JSON.stringify(data.user.assignedClassIds));
      }
      window.location.href = '/';
    } catch {
      setDemoLoading(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setNavScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
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
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    revealRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const addRevealRef = (el) => {
    if (el) {
      revealRefs.current.add(el);
    }
  };

  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState(null);

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

  return (
    <div className="landing-page">
      <div className="lp-bookshelf-edge" aria-hidden="true" />

      <div className="lp-body-offset">
        {/* NAV */}
        <nav className={`lp-nav${navScrolled ? ' scrolled' : ''}`}>
          <span
            className="lp-nav-logo"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            role="button"
            tabIndex={0}
          >
            <span className="lp-nav-logo-icon">
              <TallyLogo />
            </span>
            <span>Tally</span>
          </span>
          <ul className="lp-nav-links lp-nav-links-desktop">
            <li>
              <a href="#features">Features</a>
            </li>
            <li>
              <a href="#in-action">See it</a>
            </li>
            <li>
              <button className="lp-btn lp-btn-signin" onClick={onSignIn}>
                Sign in
              </button>
            </li>
            <li>
              <a href="#contact" className="lp-btn lp-btn-primary">
                Stay updated
              </a>
            </li>
          </ul>
          <div className="lp-nav-links-mobile">
            <button className="lp-btn lp-btn-signin" onClick={onSignIn}>
              Sign in
            </button>
          </div>
        </nav>

        {/* HERO */}
        <section className="lp-hero">
          <div className="lp-hero-content">
            <div className="lp-hero-badge">Coming soon for UK primary schools</div>
            <h1>
              Keep a <span className="lp-highlight">tally</span> of every
              <br />
              reading moment
            </h1>
            <p>
              A simple, thoughtful app that helps reading volunteers and teachers track sessions,
              discover books, and watch young readers grow — without the paperwork.
            </p>
            <div className="lp-hero-actions">
              <button
                className="lp-btn lp-btn-primary"
                onClick={handleTryDemo}
                disabled={demoLoading}
              >
                {demoLoading ? 'Loading demo...' : 'Try the demo'}
                {!demoLoading && <ChevronRight />}
              </button>
              <a href="#features" className="lp-btn lp-btn-outline">
                Learn more
              </a>
            </div>
          </div>
        </section>

        {/* SCREENSHOT SHOWCASE */}
        <section className="lp-showcase">
          <div className="lp-showcase-inner">
            <div className="lp-showcase-main">
              <img
                src={screenshotStudents}
                alt="Tally Reading — Students view showing priority reading list"
              />
            </div>
            <div className="lp-showcase-floaters">
              <div className="lp-showcase-float-card">
                <img src={screenshotRecommendations} alt="AI book recommendations" loading="lazy" />
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="lp-features" id="features">
          <div className="lp-section-header lp-reveal" ref={addRevealRef}>
            <h2>
              Everything you need,
              <br />
              nothing you don't
            </h2>
            <p>
              Designed around how reading volunteers and teachers actually work — on tablets,
              between sessions, one child at a time.
            </p>
          </div>
          <div className="lp-feature-grid">
            {[
              {
                icon: '📱',
                title: 'Scan & go',
                desc: 'Point your iPad at a barcode to instantly look up any book. No more typing titles or guessing authors — just scan the ISBN and start the session.',
              },
              {
                icon: '✨',
                title: 'Smart recommendations',
                desc: "AI-powered book suggestions based on each child's reading level, interests, and what they've enjoyed before. The right book at the right time.",
              },
              {
                icon: '🏠',
                title: 'Home reading without the hassle',
                desc: "Replace paper reading diaries with a quick digital register. One tap per child, per day — saving teachers roughly 10 minutes per class on admin alone.",
              },
              {
                icon: '🏫',
                title: 'Built for your school',
                desc: 'Import pupil lists from your MIS, organise by class or group, and manage reading volunteers — all from one place. No spreadsheets required.',
              },
              {
                icon: '📝',
                title: 'Session notes that matter',
                desc: "Record observations, track vocabulary, note enjoyment levels. Build a rich picture of each child's reading journey that teachers can actually use.",
              },
              {
                icon: '🔒',
                title: 'Safe & simple',
                desc: "GDPR-compliant, EU-hosted, and designed with children's data protection at its core. No ads, no tracking, no nonsense.",
              },
            ].map((f, i) => (
              <div className="lp-feature-card lp-reveal" key={i} ref={addRevealRef}>
                <div className="lp-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* APP IN ACTION */}
        <section className="lp-app-showcase" id="in-action">
          <div className="lp-app-showcase-content">
            <div className="lp-section-header lp-reveal" ref={addRevealRef}>
              <h2>See it in action</h2>
              <p>
                Real screens from real reading sessions. This is what it actually looks like when
                you sit down with a child and a book.
              </p>
            </div>

            {[
              {
                tag: 'Reading sessions',
                tagClass: 'lp-tag-green',
                tagIcon: '📖',
                title: 'Record a session in seconds',
                desc: 'Pick a student, scan or search for the book, assess their reading level, and add notes. The whole thing takes less time than finding your pen used to.',
                img: screenshotReading,
                alt: 'Recording a reading session',
              },
              {
                tag: 'Home reading',
                tagClass: 'lp-tag-coral',
                tagIcon: '📋',
                title: 'Save 10 minutes per class, every day',
                desc: "No more chasing paper diaries or deciphering ticks. Parents record reading at home, teachers see the whole class in one register — who's read, how often, and what book they're on. That's roughly 10 minutes back per class, per day.",
                img: screenshotRegister,
                alt: 'Home reading register view',
              },
              {
                tag: 'AI recommendations',
                tagClass: 'lp-tag-amber',
                tagIcon: '✨',
                title: '"What should they read next?"',
                desc: "Personalised book suggestions that consider reading level, genre preferences, and what they've enjoyed before. With real covers, real reasons, and books you can actually find.",
                img: screenshotRecommendations,
                alt: 'AI-powered book recommendations',
              },
              {
                tag: 'Reading stats',
                tagClass: 'lp-tag-green',
                tagIcon: '📊',
                title: 'See the bigger picture',
                desc: "Track reading patterns across your class with clear stats — sessions this week, streaks, home vs school reading, and who's leading the way. All at a glance.",
                img: screenshotStats,
                alt: 'Reading statistics dashboard',
              },
              {
                tag: 'Book library',
                tagClass: 'lp-tag-coral',
                tagIcon: '📚',
                title: '2,400+ books and growing',
                desc: "A shared book library with covers, reading levels, and genres. Search, filter, scan barcodes, or import your whole collection from a CSV. No more guessing what's available.",
                img: screenshotBooks,
                alt: 'Book library management',
              },
            ].map((row, i) => (
              <div className="lp-app-feature-row lp-reveal" key={i} ref={addRevealRef}>
                <div className="lp-app-feature-text">
                  <div className={`lp-app-feature-tag ${row.tagClass}`}>
                    {row.tagIcon} {row.tag}
                  </div>
                  <h3>{row.title}</h3>
                  <p>{row.desc}</p>
                </div>
                <div className="lp-app-feature-image">
                  <img src={row.img} alt={row.alt} loading="lazy" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="lp-how-it-works">
          <div className="lp-how-content">
            <div className="lp-section-header lp-reveal" ref={addRevealRef}>
              <h2>Up and running in minutes</h2>
              <p>No training needed. If you can use a tablet, you can use Tally.</p>
            </div>
            <div className="lp-steps">
              {[
                {
                  num: '1',
                  title: 'Set up your school',
                  desc: "Import your pupil list from a CSV or connect to your school's management system. Add your reading volunteers.",
                },
                {
                  num: '2',
                  title: 'Start reading',
                  desc: 'Pick a pupil, scan or search for the book, and record the session. Notes, ratings, and vocabulary — all optional, all useful.',
                },
                {
                  num: '3',
                  title: 'Watch them grow',
                  desc: 'Track reading patterns over time. Get book recommendations. Share progress with teachers and celebrate every milestone.',
                },
              ].map((step, i) => (
                <div className="lp-step lp-reveal" key={i} ref={addRevealRef}>
                  <div className="lp-step-number">{step.num}</div>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TRUST */}
        <section className="lp-trust">
          <div className="lp-trust-content lp-reveal" ref={addRevealRef}>
            <h2>Built with schools, for schools</h2>
            <p>
              Tally was born from real reading sessions at a real primary school. We know the iPad
              is balanced on a tiny chair, the session is twenty minutes, and the child just wants
              to read — not wait for software to load.
            </p>
            <div className="lp-trust-items">
              {[
                { icon: '🇪🇺', label: 'EU-hosted data' },
                { icon: '🔒', label: 'GDPR compliant' },
                { icon: '🏫', label: 'MIS integration ready' },
                { icon: '💬', label: 'Real human support' },
              ].map((item, i) => (
                <div className="lp-trust-item" key={i}>
                  <div className="lp-trust-icon">{item.icon}</div>
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Get in Touch */}
        <section className="lp-cta" id="contact">
          <div className="lp-cta-box lp-reveal" ref={addRevealRef}>
            <h2>Get in Touch</h2>
            <p>
              Interested in Tally Reading for your school? Drop us a message and we'll get back to
              you.
            </p>
            <form className="lp-contact-form" onSubmit={handleContact}>
              {!contactSubmitted ? (
                <div className="lp-contact-fields">
                  <input
                    type="text"
                    name="name"
                    placeholder="Your name"
                    required
                    maxLength={100}
                    className="lp-contact-input"
                    disabled={contactLoading}
                  />
                  <input
                    type="email"
                    name="email"
                    placeholder="your.name@school.sch.uk"
                    required
                    className="lp-contact-input"
                    disabled={contactLoading}
                  />
                  <textarea
                    name="message"
                    placeholder="How can we help?"
                    required
                    maxLength={5000}
                    rows={4}
                    className="lp-contact-textarea"
                    disabled={contactLoading}
                  />
                  <button
                    type="submit"
                    className="lp-btn lp-btn-primary"
                    disabled={contactLoading}
                  >
                    {contactLoading ? 'Sending...' : 'Send Message'}
                  </button>
                  {contactError && <p className="lp-contact-error">{contactError}</p>}
                  <p className="lp-contact-note">
                    We'll reply to your email within one working day. See our{' '}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#6B8E6B' }}
                    >
                      Privacy Policy
                    </a>
                    .
                  </p>
                </div>
              ) : (
                <div className="lp-contact-thanks">
                  <p>Thanks for getting in touch!</p>
                  <p>We'll reply to your email shortly.</p>
                </div>
              )}
            </form>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="lp-footer">
          <div className="lp-footer-content">
            <span
              className="lp-footer-logo"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Scroll to top"
            >
              <span className="lp-footer-logo-icon">
                <TallyLogo size={18} />
              </span>
              <span>Tally</span>
            </span>
            <span className="lp-footer-text">&copy; 2026 Tally Reading. Made in Bristol.</span>
            <ul className="lp-footer-links">
              <li>
                <a href="/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
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
      </div>
    </div>
  );
}
