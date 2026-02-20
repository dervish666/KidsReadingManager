import React, { useEffect, useRef, useState } from 'react';
import './LandingPage.css';

const TallyLogo = ({ size = 22 }) => (
  <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <path d="M4 4v16M8 4v16M12 4v16M16 4v16M20 12H4" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function LandingPage({ onSignIn }) {
  const [navScrolled, setNavScrolled] = useState(false);
  const [signupSubmitted, setSignupSubmitted] = useState(false);
  const revealRefs = useRef([]);

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
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  };

  const handleSignup = (e) => {
    e.preventDefault();
    setSignupSubmitted(true);
  };

  return (
    <div className="landing-page">
      <div className="lp-bookshelf-edge" />

      <div className="lp-body-offset">
        {/* NAV */}
        <nav className={`lp-nav${navScrolled ? ' scrolled' : ''}`}>
          <span className="lp-nav-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <span className="lp-nav-logo-icon"><TallyLogo /></span>
            <span>Tally</span>
          </span>
          <ul className="lp-nav-links lp-nav-links-desktop">
            <li><a href="#features">Features</a></li>
            <li><a href="#in-action">See it</a></li>
            <li>
              <button className="lp-btn lp-btn-signin" onClick={onSignIn}>
                Sign in
              </button>
            </li>
            <li><a href="#contact" className="lp-btn lp-btn-primary">Stay updated</a></li>
          </ul>
        </nav>

        {/* HERO */}
        <section className="lp-hero">
          <div className="lp-hero-content">
            <div className="lp-hero-badge">Coming soon for UK primary schools</div>
            <h1>
              Keep a <span className="lp-highlight">tally</span> of every<br />reading moment
            </h1>
            <p>
              A simple, thoughtful app that helps reading volunteers and teachers track sessions,
              discover books, and watch young readers grow — without the paperwork.
            </p>
            <div className="lp-hero-actions">
              <a href="#contact" className="lp-btn lp-btn-primary">
                Get notified at launch
                <ChevronRight />
              </a>
              <a href="#features" className="lp-btn lp-btn-outline">See what's coming</a>
            </div>
          </div>
        </section>

        {/* SCREENSHOT SHOWCASE */}
        <section className="lp-showcase">
          <div className="lp-showcase-inner">
            <div className="lp-showcase-main">
              <span className="lp-placeholder-label">App preview coming soon</span>
            </div>
            <div className="lp-showcase-floaters">
              <div className="lp-showcase-float-card">
                <span className="lp-placeholder-label">AI recommendations</span>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="lp-features" id="features">
          <div className="lp-section-header lp-reveal" ref={addRevealRef}>
            <h2>Everything you need,<br />nothing you don't</h2>
            <p>Designed around how reading volunteers and teachers actually work — on tablets, between sessions, one child at a time.</p>
          </div>
          <div className="lp-feature-grid">
            {[
              { icon: '📱', title: 'Scan & go', desc: 'Point your iPad at a barcode to instantly look up any book. No more typing titles or guessing authors — just scan the ISBN and start the session.' },
              { icon: '✨', title: 'Smart recommendations', desc: "AI-powered book suggestions based on each child's reading level, interests, and what they've enjoyed before. The right book at the right time." },
              { icon: '📊', title: 'Priority reading list', desc: "Automatically surfaces who needs a reading session most. See at a glance who's been waiting longest, so no child gets overlooked." },
              { icon: '🏫', title: 'Built for your school', desc: 'Import pupil lists from your MIS, organise by class or group, and manage reading volunteers — all from one place. No spreadsheets required.' },
              { icon: '📝', title: 'Session notes that matter', desc: "Record observations, track vocabulary, note enjoyment levels. Build a rich picture of each child's reading journey that teachers can actually use." },
              { icon: '🔒', title: 'Safe & simple', desc: "GDPR-compliant, UK-hosted, and designed with children's data protection at its core. No ads, no tracking, no nonsense." },
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
              <p>Real screens from real reading sessions. This is what it actually looks like when you sit down with a child and a book.</p>
            </div>

            {[
              { tag: 'Reading sessions', tagClass: 'lp-tag-green', tagIcon: '📖', title: 'Record a session in seconds', desc: 'Pick a student, scan or search for the book, assess their reading level, and add notes. The whole thing takes less time than finding your pen used to.', placeholder: 'Session recording' },
              { tag: 'Class register', tagClass: 'lp-tag-coral', tagIcon: '📋', title: 'The whole class at a glance', desc: "A simple register view showing who's been read with today, their current books, and running totals. Quick mark-off with one tap — tick, absent, or not seen.", placeholder: 'Class register' },
              { tag: 'AI recommendations', tagClass: 'lp-tag-amber', tagIcon: '✨', title: '"What should they read next?"', desc: "Personalised book suggestions that consider reading level, genre preferences, and what they've enjoyed before. With real covers, real reasons, and books you can actually find.", placeholder: 'Book recommendations' },
            ].map((row, i) => (
              <div className="lp-app-feature-row lp-reveal" key={i} ref={addRevealRef}>
                <div className="lp-app-feature-text">
                  <div className={`lp-app-feature-tag ${row.tagClass}`}>{row.tagIcon} {row.tag}</div>
                  <h3>{row.title}</h3>
                  <p>{row.desc}</p>
                </div>
                <div className="lp-app-feature-image">
                  <span className="lp-placeholder-label">{row.placeholder}</span>
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
                { num: '1', title: 'Set up your school', desc: "Import your pupil list from a CSV or connect to your school's management system. Add your reading volunteers." },
                { num: '2', title: 'Start reading', desc: 'Pick a pupil, scan or search for the book, and record the session. Notes, ratings, and vocabulary — all optional, all useful.' },
                { num: '3', title: 'Watch them grow', desc: 'Track reading patterns over time. Get book recommendations. Share progress with teachers and celebrate every milestone.' },
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
                { icon: '🇬🇧', label: 'UK-hosted data' },
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

        {/* CTA */}
        <section className="lp-cta" id="contact">
          <div className="lp-cta-box lp-reveal" ref={addRevealRef}>
            <h2>We're launching soon</h2>
            <p>Leave your email and we'll let you know when Tally is ready. Early sign-ups get a free month to try it out.</p>
            <form className="lp-signup-form" onSubmit={handleSignup}>
              {!signupSubmitted ? (
                <div className="lp-signup-fields">
                  <div className="lp-signup-input-row">
                    <input type="email" placeholder="your.name@school.sch.uk" required className="lp-signup-input" />
                    <button type="submit" className="lp-btn lp-btn-primary">Keep me posted</button>
                  </div>
                  <p className="lp-signup-note">No spam, just a heads-up when we're live.</p>
                </div>
              ) : (
                <div className="lp-signup-thanks">
                  <p>You're on the list!</p>
                  <p>We'll be in touch when Tally is ready.</p>
                </div>
              )}
            </form>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="lp-footer">
          <div className="lp-footer-content">
            <span className="lp-footer-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <span className="lp-footer-logo-icon"><TallyLogo size={18} /></span>
              <span>Tally</span>
            </span>
            <span className="lp-footer-text">&copy; 2026 Tally Reading. Made in Bristol.</span>
            <ul className="lp-footer-links">
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms</a></li>
            </ul>
          </div>
        </footer>
      </div>
    </div>
  );
}
