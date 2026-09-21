"use client";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { TaskRun } from "../../lib/rewards";
import { readDraft, saveDraft } from "../../lib/task-draft";
export function MediaReviewForm({ run, draftKey, busy, onSubmit }: { run: TaskRun; draftKey: string; busy: boolean; onSubmit: (body: { rating: number; proof: string }) => void }) {
 const [rating, setRating] = useState(readDraft(draftKey).rating ?? run.rating ?? 0);
 const [proof, setProof] = useState(readDraft(draftKey).review ?? run.proof ?? "");
 useEffect(() => { saveDraft(draftKey, { ...readDraft(draftKey), rating, review: proof }); }, [draftKey, rating, proof]);
 return <form className="profile-form" onSubmit={e => { e.preventDefault(); if (rating && !busy) onSubmit({ rating, proof }); }}><fieldset className="rw-poll-form-fields" disabled={busy}><legend>Your honest rating</legend><div className="rw-star-options">{[1, 2, 3, 4, 5].map(value => <label key={value} className={"rw-star-option " + (value <= rating ? "is-selected" : "")}><input type="radio" name="star-rating" value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={value + (value === 1 ? " star" : " stars")} required /><Star aria-hidden="true" size={32} fill={value <= rating ? "currentColor" : "none"} /><span>{value}</span></label>)}</div><p role="status">{rating ? rating + " out of 5 stars selected" : "Choose 1 to 5 stars."} Your reward is the same for every rating.</p><label>Your review<textarea value={proof} onChange={e => setProof(e.target.value)} minLength={10} maxLength={4000} rows={5} required placeholder="What did you like? What could be improved?" /><small>At least 10 characters. Reviews are submitted privately to the admin.</small></label><button className="rw-button rw-button-primary rw-full" disabled={busy || !rating}>{busy ? "Submitting review..." : run.autoClaimOnVerification ? "Submit review & earn points" : "Submit review for approval"}</button></fieldset></form>;
}
