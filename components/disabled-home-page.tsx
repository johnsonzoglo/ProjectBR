import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Coins,
  Layers2,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";

const steps = [
  {
    number: "01",
    icon: ClipboardCheck,
    title: "Pick what fits",
    copy: "Browse clear, approved opportunities and choose a task that works with your day.",
  },
  {
    number: "02",
    icon: BriefcaseBusiness,
    title: "Do the work",
    copy: "Follow simple instructions, share your perspective, and submit the requested proof.",
  },
  {
    number: "03",
    icon: Coins,
    title: "Watch it add up",
    copy: "See verified points, deposits, and every reward update in one transparent wallet.",
  },
];

const opportunities = [
  {
    icon: "✦",
    category: "Quick feedback",
    title: "Share a useful opinion",
    time: "5–10 min",
    reward: "+150 pts",
  },
  {
    icon: "▶",
    category: "Content review",
    title: "Explore something new",
    time: "10–15 min",
    reward: "+300 pts",
  },
  {
    icon: "✓",
    category: "Product check",
    title: "Test a simple experience",
    time: "15–20 min",
    reward: "+450 pts",
  },
];

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link href="/" className="landing-brand" aria-label="NuevaReviews home">
          <span>
            <Layers2 size={22} />
          </span>
          NuevaReviews<i>.</i>
        </Link>
        <nav aria-label="Primary navigation">
          <a href="#opportunities">Opportunities</a>
          <a href="#how-it-works">How it works</a>
          <a href="#member-story">Member story</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="landing-nav-actions">
          <Link href="/login" className="landing-link">
            Sign in
          </Link>
          <Link
            href="/register"
            className="landing-button landing-button-small"
          >
            Join free
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="landing-kicker">
            <Sparkles size={14} />
            YOUR TIME HAS VALUE
          </span>
          <h1>
            Turn spare moments into <em>something more.</em>
          </h1>
          <p>
            Complete straightforward online tasks, share what you know, and
            build rewards at your own pace—with every step clearly tracked.
          </p>
          <div className="landing-hero-actions">
            <Link href="/register" className="landing-button">
              Start earning free
              <ArrowRight size={18} />
            </Link>
            <a
              href="#opportunities"
              className="landing-button landing-button-ghost"
            >
              Explore tasks
            </a>
          </div>
          <div className="landing-community">
            <span className="landing-avatar landing-avatar-one">J</span>
            <span className="landing-avatar landing-avatar-two">A</span>
            <span className="landing-avatar landing-avatar-three">M</span>
            <div>
              <strong>Built for everyday people</strong>
              <small>Work when it works for you</small>
            </div>
          </div>
        </div>
        <div
          className="landing-visual"
          aria-label="People completing NuevaReviews tasks together"
        >
          <img
            src="/rewardly-team-hero.png"
            alt="A diverse team working together around a laptop"
          />
          <div className="landing-photo-shade" />
          <div className="landing-wallet-card">
            <div>
              <span>
                <Coins size={17} />
                REWARD BALANCE
              </span>
              <small>THIS WEEK</small>
            </div>
            <strong>
              12,450 <i>pts</i>
            </strong>
            <p>Progress you can actually see</p>
            <div className="landing-wallet-progress">
              <span />
            </div>
          </div>
          <div className="landing-task-float">
            <span>
              <CheckCircle2 size={20} />
            </span>
            <div>
              <small>JUST VERIFIED</small>
              <strong>Feedback task</strong>
            </div>
            <b>+150</b>
          </div>
          <div className="landing-proof-float">
            <TrendingUp size={18} />
            <span>
              <strong>Keep building</strong>
              <small>One task at a time</small>
            </span>
          </div>
        </div>
      </section>

      <section className="landing-proof-strip" aria-label="NuevaReviews benefits">
        <div>
          <strong>
            <ShieldCheck size={18} />
            Clear before you start
          </strong>
          <span>See instructions and reward value upfront</span>
        </div>
        <div>
          <strong>
            <Clock3 size={18} />
            Made for spare time
          </strong>
          <span>Choose opportunities that fit your schedule</span>
        </div>
        <div>
          <strong>
            <Coins size={18} />
            Every point accounted for
          </strong>
          <span>Follow your complete reward history</span>
        </div>
      </section>

      <section className="landing-opportunities" id="opportunities">
        <div className="landing-section-heading landing-heading-row">
          <div>
            <span className="landing-kicker">FRESH OPPORTUNITIES</span>
            <h2>
              Small tasks.
              <br />
              Real momentum.
            </h2>
          </div>
          <p>
            Start with something simple. Each approved task clearly shows what
            to do, how long it may take, and what it is worth.
          </p>
        </div>
        <div className="landing-opportunity-grid">
          {opportunities.map((item) => (
            <article key={item.title}>
              <div className="landing-opportunity-top">
                <span>{item.icon}</span>
                <small>{item.category}</small>
              </div>
              <h3>{item.title}</h3>
              <div>
                <span>
                  <Clock3 size={14} />
                  {item.time}
                </span>
                <strong>{item.reward}</strong>
              </div>
            </article>
          ))}
        </div>
        <Link href="/register" className="landing-text-link">
          Create an account to see available tasks
          <ArrowRight size={16} />
        </Link>
      </section>

      <section className="landing-section" id="how-it-works">
        <div className="landing-section-heading">
          <span className="landing-kicker">HOW NUEVAREVIEWS WORKS</span>
          <h2>
            A simple rhythm
            <br />
            that rewards effort.
          </h2>
          <p>
            No complicated setup. Just choose, complete, and follow your
            progress.
          </p>
        </div>
        <div className="landing-steps">
          {steps.map(({ number, icon: Icon, title, copy }) => (
            <article key={number}>
              <div>
                <span className="landing-step-icon">
                  <Icon size={24} />
                </span>
                <b>{number}</b>
              </div>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-story" id="member-story">
        <div className="landing-story-photo">
          <img
            src="/rewardly-member-story.png"
            alt="A NuevaReviews member checking progress while working from home"
          />
          <div className="landing-story-badge">
            <Star size={17} fill="currentColor" />
            <span>
              <strong>Time well spent</strong>
              <small>Flexible by design</small>
            </span>
          </div>
        </div>
        <div className="landing-story-copy">
          <span className="landing-kicker">
            <Users size={14} />
            MADE FOR REAL ROUTINES
          </span>
          <h2>Your day is already full. NuevaReviews fits around it.</h2>
          <p>
            Whether you have ten minutes between plans or a quiet hour in the
            evening, you decide when to participate. Your dashboard keeps the
            details organized so progress never feels vague.
          </p>
          <blockquote>
            “I can see what each task needs before I begin—and exactly where my
            rewards stand afterward.”
          </blockquote>
          <div className="landing-story-list">
            <span>
              <Check size={17} />
              No fixed schedule
            </span>
            <span>
              <Check size={17} />
              Transparent task review
            </span>
            <span>
              <Check size={17} />A secure personal account
            </span>
          </div>
        </div>
      </section>

      <section className="landing-section landing-faq" id="faq">
        <div className="landing-section-heading">
          <span className="landing-kicker">QUESTIONS, ANSWERED</span>
          <h2>Know how it works before you join.</h2>
          <p>Availability, review times, and reward values vary by task. NuevaReviews does not promise a fixed income.</p>
        </div>
        <div className="landing-faq-grid">
          <details><summary>Is NuevaReviews free to join?</summary><p>Creating an account is free. Some optional task groups can require an active membership, which is always shown before purchase.</p></details>
          <details><summary>When are points credited?</summary><p>Some tasks verify instantly. Others require an administrator to review submitted proof. The task shows its review method before you begin.</p></details>
          <details><summary>How do withdrawals work?</summary><p>Eligible earned reward points can be converted after meeting the displayed minimum and referral requirements. Deposited membership funds cannot be withdrawn.</p></details>
          <details><summary>Where can I get help?</summary><p>Signed-in members can use private support chat. You can also visit the contact page before creating an account.</p></details>
        </div>
      </section>

      <section className="landing-cta">
        <span className="landing-kicker">MAKE YOUR NEXT MOMENT COUNT</span>
        <h2>
          A little time can
          <br />
          go a long way.
        </h2>
        <p>Join NuevaReviews free and discover your next opportunity.</p>
        <Link href="/register" className="landing-button landing-button-light">
          Create my free account
          <ArrowRight size={18} />
        </Link>
        <span className="landing-cta-coin landing-cta-coin-one">R</span>
        <span className="landing-cta-coin landing-cta-coin-two">+</span>
      </section>
      <footer className="landing-footer">
        <Link href="/" className="landing-brand">
          <span>
            <Layers2 size={20} />
          </span>
          NuevaReviews<i>.</i>
        </Link>
        <p>Small steps. Clear rewards.</p>
        <div>
          <Link href="/login">Sign in</Link>
          <Link href="/register">Create account</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </footer>
    </main>
  );
}
