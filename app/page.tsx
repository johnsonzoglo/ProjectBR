import Link from "next/link";
import { ArrowRight, Check, ClipboardCheck, Coins, Layers2, ShieldCheck, Sparkles, Star, Users } from "lucide-react";

const steps = [
  { number: "01", icon: ClipboardCheck, title: "Choose a task", copy: "Browse approved opportunities and pick one that fits your time." },
  { number: "02", icon: ShieldCheck, title: "Complete & verify", copy: "Follow the instructions and submit the requested proof securely." },
  { number: "03", icon: Coins, title: "Collect rewards", copy: "Track verified points and your complete reward history in one place." },
];

export default function Home() {
  return <main className="landing-page">
    <header className="landing-nav">
      <Link href="/" className="landing-brand" aria-label="Rewardly home"><span><Layers2 size={22} /></span>rewardly<i>.</i></Link>
      <nav aria-label="Primary navigation"><a href="#how-it-works">How it works</a><a href="#why-rewardly">Why Rewardly</a></nav>
      <div className="landing-nav-actions"><Link href="/login" className="landing-link">Sign in</Link><Link href="/register" className="landing-button landing-button-small">Get started<ArrowRight size={16} /></Link></div>
    </header>
    <section className="landing-hero">
      <div className="landing-hero-copy">
        <span className="landing-kicker"><Sparkles size={14} />A LITTLE TIME. REAL POSSIBILITY.</span>
        <h1>Make your spare time <em>rewarding.</em></h1>
        <p>Discover simple, approved tasks. Share your perspective, build your points, and keep every reward clearly in view.</p>
        <div className="landing-hero-actions"><Link href="/register" className="landing-button">Start earning<ArrowRight size={18} /></Link><a href="#how-it-works" className="landing-button landing-button-ghost">See how it works</a></div>
        <div className="landing-trust"><span><Check size={15} />Free to join</span><span><Check size={15} />Clear rewards</span><span><Check size={15} />Secure account</span></div>
      </div>
      <div className="landing-visual" aria-label="Example Rewardly account progress">
        <span className="landing-orbit landing-orbit-one" /><span className="landing-orbit landing-orbit-two" />
        <div className="landing-wallet-card"><div><span><Coins size={18} />YOUR REWARDS</span><small>VERIFIED</small></div><strong>12,450 <i>pts</i></strong><p>$124.50 reward value</p><div className="landing-wallet-progress"><span /></div></div>
        <div className="landing-task-float"><span><ClipboardCheck size={20} /></span><div><small>QUICK TASK</small><strong>Share your opinion</strong></div><b>+150</b></div>
        <div className="landing-proof-float"><ShieldCheck size={18} /><span><strong>Task verified</strong><small>Points added safely</small></span></div>
        <span className="landing-spark landing-spark-one">✦</span><span className="landing-spark landing-spark-two">✦</span>
      </div>
    </section>
    <section className="landing-proof-strip" aria-label="Rewardly benefits"><div><strong>One clear place</strong><span>Tasks, points, and progress</span></div><div><strong>Verified activity</strong><span>Transparent task status</span></div><div><strong>Built around you</strong><span>Move at your own pace</span></div></section>
    <section className="landing-section" id="how-it-works">
      <div className="landing-section-heading"><span className="landing-kicker">HOW IT WORKS</span><h2>Three small steps.<br />One rewarding routine.</h2><p>No complicated setup. Create your account and find your next little win.</p></div>
      <div className="landing-steps">{steps.map(({ number, icon: Icon, title, copy }) => <article key={number}><div><span className="landing-step-icon"><Icon size={24} /></span><b>{number}</b></div><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>
    <section className="landing-highlight" id="why-rewardly">
      <div className="landing-highlight-art"><span className="landing-coin"><Layers2 size={58} /></span><span className="landing-mini-card"><Star size={16} fill="currentColor" /> Your effort counts</span></div>
      <div><span className="landing-kicker"><Users size={14} />REWARDS THAT FEEL CLEAR</span><h2>Your progress should make sense.</h2><p>See what each task is worth, follow its verification status, and review your reward history without guesswork.</p><ul><li><ShieldCheck size={18} />Approved tasks with clear instructions</li><li><Coins size={18} />Visible point values and balances</li><li><ClipboardCheck size={18} />A complete record of your activity</li></ul></div>
    </section>
    <section className="landing-cta"><span className="landing-kicker">YOUR NEXT LITTLE WIN</span><h2>Ready to make your time count?</h2><p>Create your free Rewardly account and start exploring.</p><Link href="/register" className="landing-button landing-button-light">Create my account<ArrowRight size={18} /></Link><span className="landing-cta-spark">✦</span></section>
    <footer className="landing-footer"><Link href="/" className="landing-brand"><span><Layers2 size={20} /></span>rewardly<i>.</i></Link><p>Small steps. Clear rewards.</p><div><Link href="/login">Sign in</Link><Link href="/register">Create account</Link></div></footer>
  </main>;
}
