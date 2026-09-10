"use client";
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Clock3, Coins, Gift, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { AnimatedCounter, RewardCard } from "./primitives";
import { categoryIcons, type PreviewTask } from "./data";

export function BalanceCard({ preview, points, onRewards }: { preview: boolean; points: number; onRewards: () => void }) {
  return <section className="rw-balance-card" aria-label={preview ? "Sample wallet balance" : "Your wallet"}><div className="rw-balance-aurora" aria-hidden="true" /><div className="rw-balance-top"><span><span className="rw-wallet-symbol"><Coins size={19} /></span>Your rewards</span><span className="rw-wallet-label">{preview ? "PREVIEW WALLET" : "YOUR WALLET"}</span></div><div className="rw-balance-center"><span className="rw-balance-label">Total points</span><div className="rw-points"><strong>{preview ? <AnimatedCounter value={points} /> : "—"}</strong><span>pts</span></div><span className="rw-balance-context">{preview ? <><span className="rw-green-dot" />+450 sample points today <Sparkles size={12} /></> : "Your points will appear when rewards launch"}</span></div><div className="rw-wallet-art" aria-hidden="true"><div className="rw-coin-orbit" /><span className="rw-coin rw-coin-back"><Zap size={29} fill="currentColor" /></span><span className="rw-coin rw-coin-front"><Zap size={36} fill="currentColor" /></span><i className="rw-coin-spark one">✦</i><i className="rw-coin-spark two">✦</i></div><div className="rw-balance-bottom"><div><span>USD equivalent</span><strong>{preview ? <AnimatedCounter value={points / 100} prefix="$" decimals={2} /> : "—"}</strong></div><div><span>Withdrawable</span><strong>{preview ? "$85.00" : "—"}<span className="rw-green-dot" /></strong></div><button className="rw-wallet-action" onClick={onRewards} aria-label={preview ? "View preview withdrawal details" : "View reward availability"}><ArrowUpRight size={20} /></button></div></section>;
}

export function TaskCard({ task, preview, completed, onStart }: { task: PreviewTask; preview: boolean; completed: boolean; onStart: (task: PreviewTask) => void }) {
  const Icon = categoryIcons[task.category];
  return <article className={`rw-task-card rw-category-${task.category.toLowerCase()} ${completed ? "is-completed" : ""}`}><div className="rw-task-top"><span className="rw-task-icon"><Icon size={24} fill={task.category === "Video" ? "currentColor" : "none"} /></span><span className="rw-task-category">{task.category}</span>{task.featured && <span className="rw-task-featured"><Zap size={11} fill="currentColor" />Quick win</span>}</div><h3>{task.title}</h3><p>{task.description}</p><div className="rw-task-meta"><span><Clock3 size={13} />{task.minutes} min</span><span><span className="rw-status-dot" />{completed ? "Preview completed" : preview ? "Not started · demo" : "Coming soon"}</span></div><div className="rw-task-footer"><span className="rw-task-points"><Coins size={16} /><strong>{preview ? `+${task.points}` : "—"}</strong><small>pts</small></span><button className={`rw-button ${completed ? "rw-button-complete" : "rw-button-secondary"}`} onClick={() => onStart(task)} disabled={completed}>{completed ? <>Done <Check size={15} /></> : <>{preview ? "Try preview" : "Details"}<ArrowRight size={15} /></>}</button></div></article>;
}

export function DailyBonusCard({ onOpen, preview }: { onOpen: () => void; preview: boolean }) {
  return <RewardCard className="rw-bonus-card"><span className="rw-gift-icon"><Gift size={25} /></span><div><span className="rw-overline">A LITTLE SOMETHING</span><h2>Your daily boost</h2><p>{preview ? "A peek at future daily rewards." : "Daily bonuses are on their way."}</p></div><button onClick={onOpen} className="rw-icon-button" aria-label="Learn about daily bonuses"><ChevronRight size={22} /></button></RewardCard>;
}

export function AccountReadyCard() {
  return <div className="rw-account-ready"><ShieldCheck size={19} /><span>Your account is verified. <strong>Ready for what’s next.</strong></span></div>;
}
