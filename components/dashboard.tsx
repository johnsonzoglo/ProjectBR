"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Bell, Check, ChevronRight, Coins, Crown, Flame, Gift, Medal, Moon, Play, RotateCcw, ShieldCheck, Sparkles, Sun, Target, Trophy, UserRound, Users, Zap } from "lucide-react";
import { api, type Profile } from "../lib/api";
import { AchievementBadge, ClaimSuccessModal, Modal, ProgressRing, RewardCard, StreakCard } from "./rewards/primitives";
import { AccountReadyCard, BalanceCard, DailyBonusCard, TaskCard } from "./rewards/cards";
import { BottomNavigation, DesktopNavigation } from "./rewards/navigation";
import { categories, previewTasks, categoryIcons, type Category, type PreviewTask } from "./rewards/data";
import { useRewardTheme } from "./rewards/theme";

type InfoPanel = "notifications" | "bonus" | "withdraw" | "level" | null;
const panels = {
  notifications: { title: "You’re all caught up.", icon: Bell, description: "Task approvals, reward updates, and account alerts will live here when notifications launch. There are no notifications to review yet." },
  bonus: { title: "A little boost, every day.", icon: Gift, description: "Daily bonus rewards are a preview of what’s next. Bonus amounts and eligibility will be set by the platform before launch. Nothing can be claimed yet." },
  withdraw: { title: "Your rewards, clearly explained.", icon: Coins, description: "The preview uses an illustrative rate of 100 points to $1. Balances are examples. Real conversions and withdrawals will become available after the wallet module is connected." },
  level: { title: "Every small step counts.", icon: Trophy, description: "Levels, XP, streaks, and badges are design previews. They show how progress could look; your account has not earned these milestones. Qualification rules will be published before launch." },
};

export function Dashboard({ profile }: { profile?: Profile }) {
  const preview = !profile;
  const name = profile?.user.name || "explorer";
  const { theme, toggleTheme } = useRewardTheme();
  const [greeting, setGreeting] = useState("Hey there");
  const [category, setCategory] = useState<Category>("All");
  const [expanded, setExpanded] = useState(false);
  const [info, setInfo] = useState<InfoPanel>(null);
  const [selected, setSelected] = useState<PreviewTask | null>(null);
  const [step, setStep] = useState<"details" | "verify">("details");
  const [code, setCode] = useState("");
  const [claimError, setClaimError] = useState("");
  const [checking, setChecking] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const [success, setSuccess] = useState<number | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tasksRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const hour = new Date().getHours();
      setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
    });
    return () => { cancelAnimationFrame(frame); if (timer.current) clearTimeout(timer.current); };
  }, []);
  async function logout() {
    setLogoutBusy(true); setError("");
    try { await api("/auth/sign-out", { method: "POST", body: "{}" }); window.location.assign("/login"); }
    catch (e) { setError((e as Error).message); setLogoutBusy(false); }
  }
  function openTask(task: PreviewTask) { setSelected(task); setStep("details"); setCode(""); setClaimError(""); }
  function closeTask() { if (timer.current) clearTimeout(timer.current); setChecking(false); setSelected(null); }
  function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !preview || checking || completed.includes(selected.id)) return;
    if (code.trim().toUpperCase() !== "DEMO150") { setClaimError("Use the demo code DEMO150 to try this preview."); return; }
    setClaimError(""); setChecking(true);
    const task = selected;
    timer.current = setTimeout(() => {
      setCompleted(previous => previous.includes(task.id) ? previous : [...previous, task.id]);
      setSelected(null); setChecking(false); setSuccess(task.points);
    }, 650);
  }
  function exploreTasks() {
    tasksRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    tasksRef.current?.focus({ preventScroll: true });
  }
  const samplePoints = 12450 + previewTasks.filter(task => completed.includes(task.id)).reduce((sum, task) => sum + task.points, 0);
  const dailyCompleted = preview ? Math.min(7, 4 + completed.length) : 0;
  const filtered = previewTasks.filter(task => category === "All" || task.category === category);
  const visibleTasks = category === "All" && !expanded ? filtered.slice(0, 4) : filtered;
  const currentPanel = info ? panels[info] : null;
  const TaskIcon = selected ? categoryIcons[selected.category] : Play;

  return <div className="reward-app" data-theme={theme}>
    <a href="#rw-main" className="rw-skip-link">Skip to dashboard</a>
    <DesktopNavigation preview={preview} name={name} admin={!!profile?.permissions.includes("users.read")} onLogout={logout} busy={logoutBusy} />
    <div className="rw-main-wrap">
      <header className="rw-header"><Link href={preview ? "/login" : "/profile"} className="rw-avatar rw-header-avatar" aria-label={preview ? "Sign in to your account" : "Your profile"}>{preview ? <UserRound size={25} /> : name.slice(0, 1).toUpperCase()}<span className="rw-avatar-online" /></Link><div className="rw-greeting"><span>LET’S MAKE TODAY COUNT</span><h1>{greeting}, <strong>{name.split(" ")[0]}.</strong><span className="rw-wave" aria-hidden="true">👋</span></h1><Link href={preview ? "/register" : "/profile"} className="rw-member-chip">{preview ? <><Crown size={12} />Starter · preview</> : <><ShieldCheck size={12} />Verified account</>}<ChevronRight size={11} /></Link></div><div className="rw-header-actions"><button className="rw-icon-button rw-theme-toggle" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} onClick={toggleTheme}>{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button><button className="rw-icon-button rw-notification-button" onClick={() => setInfo("notifications")} aria-label="Open notifications"><Bell size={20} /></button></div></header>
      <main id="rw-main" className="rw-main">
        <div className="rw-preview-banner"><span className="rw-preview-icon"><Sparkles size={14} /></span><p>{preview ? <><strong>A sneak peek at your next chapter.</strong><span> Demo data. No real rewards.</span></> : <><strong>Your account is ready.</strong><span> Rewards features are coming soon.</span></>}</p>{preview ? <Link href="/register">Join Rewardly<ArrowUpRight size={15} /></Link> : <Link href="/profile">My account<ArrowUpRight size={15} /></Link>}</div>
        {error && <div role="alert" className="rw-error">{error}</div>}
        <div className="rw-dashboard-grid">
          <div className="rw-wallet-area"><BalanceCard preview={preview} points={samplePoints} onRewards={() => setInfo("withdraw")} /></div>
          <RewardCard className="rw-progress-card"><div className="rw-section-title"><span className="rw-title-icon"><Target size={19} /></span><h2>Your daily mission</h2><span className="rw-tag">{preview ? "DEMO" : "SOON"}</span></div><div className="rw-progress-body"><ProgressRing completed={dailyCompleted} total={preview ? 7 : 0} /><div><span className="rw-progress-eyebrow">{preview ? dailyCompleted === 7 ? "MISSION COMPLETE" : "YOU’VE GOT THIS" : "A FRESH START"}</span><h3>{preview ? dailyCompleted === 7 ? <>Look at you<br />go!</> : <>{7 - dailyCompleted} more little<br />wins to go.</> : <>Good things<br />are on the way.</>}</h3><p>{preview ? "Keep your momentum going." : "Approved tasks arrive next."}</p></div></div><button className="rw-mission-button" onClick={exploreTasks}>{preview ? "Find your next task" : "Explore task previews"}<ArrowRight size={16} /></button></RewardCard>
          <div className="rw-streak-area"><StreakCard preview={preview} /></div>
          <section className="rw-tasks-area" id="rw-tasks" ref={tasksRef} tabIndex={-1} aria-labelledby="rw-tasks-title"><div className="rw-task-section-heading"><div><span className="rw-overline">LITTLE EFFORT. REAL POSSIBILITY.</span><h2 id="rw-tasks-title">Find your next win<span className="rw-title-dot">.</span></h2><p>{preview ? "A few minutes. A fresh opportunity." : "A preview of the tasks we’re building."}</p></div><span className="rw-task-count">{preview ? `${previewTasks.length} previews` : "Coming soon"}</span></div><div className="rw-task-filters" role="group" aria-label="Filter preview tasks by category">{categories.map(item => <button key={item} className={item === category ? "is-active" : ""} aria-pressed={item === category} onClick={() => { setCategory(item); setExpanded(false); }}>{item === "All" && <Sparkles size={12} />}{item}</button>)}</div><div className="rw-tasks-grid" aria-live="polite">{visibleTasks.map(task => <TaskCard key={task.id} task={task} preview={preview} completed={completed.includes(task.id)} onStart={openTask} />)}</div>{category === "All" && <button className="rw-view-all" onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer previews" : "See all 6 task previews"}<ArrowRight size={15} /></button>}</section>
          <div className="rw-bonus-area"><DailyBonusCard onOpen={() => setInfo("bonus")} preview={preview} /></div>
          <RewardCard className="rw-journey-card"><div className="rw-section-title"><span className="rw-title-icon"><Trophy size={20} /></span><h2>Your little wins, celebrated</h2><button className="rw-icon-button" aria-label="About levels and achievements" onClick={() => setInfo("level")}><ArrowUpRight size={19} /></button></div><div className="rw-level-section"><span className="rw-level-icon"><Zap size={22} fill="currentColor" /></span><div className="rw-level-info"><div><strong>{preview ? "Level 4 · Go-getter" : "Your journey starts here"}</strong><span>{preview ? "650 / 1,000 XP" : "Levels coming soon"}</span></div><div className="rw-xp-track" role="progressbar" aria-label="Sample experience progress" aria-valuemin={0} aria-valuemax={1000} aria-valuenow={preview ? 650 : 0}><span style={{ width: preview ? "65%" : "0%" }} /></div><small>{preview ? "350 sample XP to your next level" : "Progress will follow the published qualification rules."}</small></div></div><div className="rw-achievements"><AchievementBadge icon={Zap} title="First steps" unlocked={preview || !!profile?.user.emailVerified} /><AchievementBadge icon={Flame} title="On a roll" unlocked={preview} /><AchievementBadge icon={Users} title="Better together" unlocked={false} /><AchievementBadge icon={Medal} title="Big dreamer" unlocked={false} /></div><span className="rw-fine-print">{preview ? "Sample levels, streaks, and achievements" : "Visual previews · achievement tracking is not active"}</span></RewardCard>
          <section className="rw-referral-teaser"><span className="rw-friends-icon"><Users size={27} /></span><div><span className="rw-overline">GOOD THINGS ARE BETTER SHARED</span><h2>Bring your people.</h2><p>More friends. More little wins together.</p></div><Link href="/referrals" className="rw-button rw-button-secondary">Explore referrals<ArrowUpRight size={16} /></Link><div className="rw-referral-decoration" aria-hidden="true"><span>✦</span><span>✦</span></div></section>
        </div>
        {!preview && <AccountReadyCard />}
        <footer className="rw-footer"><span><ShieldCheck size={13} />Your effort. Your pace. Your possibilities.</span>{preview && completed.length > 0 && <button onClick={() => { setCompleted([]); setSuccess(null); }}><RotateCcw size={13} />Reset demo</button>}<span>Rewardly · Home preview</span></footer>
      </main>
    </div>
    <BottomNavigation preview={preview} />
    {currentPanel && <Modal title={currentPanel.title} onClose={() => setInfo(null)}><span className="rw-modal-hero-icon"><currentPanel.icon size={34} /></span><span className="rw-tag">{info === "notifications" ? "NOTIFICATIONS" : "FEATURE PREVIEW"}</span><h2>{currentPanel.title}</h2><p>{!preview && info === "withdraw" ? "Your wallet will show points, conversion rates, and eligible balances after the rewards module is connected. Withdrawals are not available yet." : currentPanel.description}</p><button className="rw-button rw-button-primary" onClick={() => setInfo(null)}>Got it <Check size={17} /></button></Modal>}
    {selected && <Modal title={preview ? "Try a sample task" : "Upcoming task details"} onClose={closeTask}><span className={`rw-modal-hero-icon rw-category-${selected.category.toLowerCase()}`}><TaskIcon size={33} /></span><span className="rw-tag">{preview ? "INTERACTIVE DEMO · NO REAL REWARDS" : "COMING SOON"}</span><h2>{selected.title}</h2><p>{selected.description}</p><div className="rw-modal-reward"><span>{selected.minutes} min · {selected.category}</span><strong>{preview ? `+${selected.points} sample points` : "Reward to be announced"}</strong></div>{preview ? step === "details" ? <><ol className="rw-task-instructions"><li><span>1</span>Follow the task instructions.</li><li><span>2</span>Submit the required completion evidence.</li><li><span>3</span>Get verified and see your progress grow.</li></ol><div className="rw-demo-disclosure"><ShieldCheck size={17} /><p>This is a guided preview. No external task is performed and no real points are awarded.</p></div><button className="rw-button rw-button-primary" onClick={() => setStep("verify")}>Try the verification preview<ArrowRight size={17} /></button></> : <form onSubmit={verify} className="rw-verify-form"><label htmlFor="rw-demo-code">Demo completion code</label><p>Enter <code>DEMO150</code> to simulate an approved task.</p><input id="rw-demo-code" autoComplete="off" maxLength={20} value={code} onChange={event => setCode(event.target.value)} placeholder="Enter demo code" aria-describedby={claimError ? "rw-claim-error" : undefined} aria-invalid={!!claimError} required disabled={checking} />{claimError && <p className="rw-error" id="rw-claim-error" role="alert">{claimError}</p>}<button className="rw-button rw-button-primary" disabled={checking}>{checking ? <><span className="rw-spinner" />Simulating verification…</> : <>Complete demo +{selected.points} pts<ShieldCheck size={17} /></>}</button><span className="rw-fine-print">Only temporary sample data will change.</span></form> : <><div className="rw-demo-disclosure"><ShieldCheck size={17} /><p>Approved tasks, verification methods, and reward amounts will become available in the tasks module.</p></div><button className="rw-button rw-button-primary" onClick={closeTask}>Back to dashboard<ArrowRight size={17} /></button></>}</Modal>}
    {success !== null && <ClaimSuccessModal points={success} onClose={() => { setSuccess(null); requestAnimationFrame(() => tasksRef.current?.focus({ preventScroll: true })); }} />}
  </div>;
}
