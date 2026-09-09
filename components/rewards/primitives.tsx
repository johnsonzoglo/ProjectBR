"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, CheckCircle2, Coins, Flame, LockKeyhole, Sparkles, Trophy, X, type LucideIcon } from "lucide-react";

export function AnimatedCounter({ value, decimals = 0, prefix = "" }: { value: number; decimals?: number; prefix?: string }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const progress = motion.matches ? 1 : Math.min((time - start) / 700, 1);
      setDisplay(from + (value - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  const format = (number: number) => prefix + number.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span className="rw-counter"><span aria-hidden="true">{format(display)}</span><span className="rw-sr-only">{format(value)}</span></span>;
}

export function RewardCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rw-card ${className}`}>{children}</section>;
}

export function ProgressRing({ completed, total }: { completed: number; total: number }) {
  const percentage = total ? Math.min(100, Math.round(completed / total * 100)) : 0;
  return <div className="rw-progress-ring" role="progressbar" aria-label="Daily task progress" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={completed} style={{ "--ring-progress": `${percentage}%` } as CSSProperties}><div><strong>{completed}<span>/{total}</span></strong><small>tasks done</small></div></div>;
}

export function StreakCard({ preview }: { preview: boolean }) {
  return <RewardCard className="rw-streak-card"><div className="rw-section-title"><span className="rw-title-icon rw-gold"><Flame size={20} /></span><h2>{preview ? "7-day streak" : "Build your streak"}</h2><span className="rw-tag rw-tag-gold">{preview ? "On fire" : "Coming soon"}</span></div><p>{preview ? "A little every day goes a long way." : "Active-day tracking is on its way."}</p><div className="rw-streak-days" aria-label={preview ? "Sample streak: seven active days" : "Streak tracking not available"}>{["M", "T", "W", "T", "F", "S", "S"].map((day, i) => <div key={i} className={preview ? i === 6 ? "rw-day today" : "rw-day complete" : "rw-day"}><span>{preview ? i === 6 ? <Flame size={18} /> : <Check size={15} /> : <span className="rw-day-dot" />}</span><small>{day}</small></div>)}</div><div className="rw-streak-foot"><Sparkles size={14} />{preview ? "Consistency looks good on you." : "Start small. Make it a habit."}</div></RewardCard>;
}

export function AchievementBadge({ title, icon: Icon, unlocked }: { title: string; icon: LucideIcon; unlocked: boolean }) {
  return <div className={`rw-achievement ${unlocked ? "unlocked" : ""}`}><div><Icon size={24} />{!unlocked && <span className="rw-badge-lock"><LockKeyhole size={9} /></span>}</div><strong>{title}</strong><small>{unlocked ? "Unlocked" : "Up next"}</small></div>;
}

export function Modal({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); trigger?.focus(); };
  }, []);
  return <dialog ref={ref} className={`rw-modal ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); close.current(); }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close.current(); } }}><div className="rw-modal-top"><span className="rw-overline">REWARDLY</span><button className="rw-icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>{children}</dialog>;
}

export function ClaimSuccessModal({ points, onClose }: { points: number; onClose: () => void }) {
  return <Modal title="Preview task completed" onClose={onClose} className="rw-success-modal"><div className="rw-confetti" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ "--piece": i } as CSSProperties} />)}</div><div className="rw-success-icon"><CheckCircle2 size={45} /></div><span className="rw-tag">DEMO COMPLETE</span><h2>That’s a little win!</h2><div className="rw-success-points"><Coins size={27} />+<AnimatedCounter value={points} /> <small>points</small></div><p>Your <strong>sample balance</strong> has been updated. This preview does not award real points or create a transaction.</p><button className="rw-button rw-button-primary" onClick={onClose}>Back to my preview <Trophy size={17} /></button></Modal>;
}
