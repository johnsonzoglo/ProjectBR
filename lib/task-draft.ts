"use client";

export type TaskDraft = { proof?: string; code?: string; answers?: Record<string, boolean>; selectedDesignId?: string; surveyAnswers?: Record<string, string>; rating?: number; review?: string };

export function draftKey(userId: string, runId: string) { return `rewardly:task-draft:${userId}:${runId}`; }

export function readDraft(key: string): TaskDraft {
  try { return JSON.parse(sessionStorage.getItem(key) || "{}") as TaskDraft; } catch { return {}; }
}

export function saveDraft(key: string, draft: TaskDraft) {
  try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* Storage is optional. */ }
}

export function clearDraft(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* Storage is optional. */ }
  void imageStore(key, "delete");
}

function imageStore(key: string, mode: "get" | "put" | "delete", image?: string): Promise<string | null> {
  return new Promise(resolve => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const open = indexedDB.open("rewardly-task-drafts", 1);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains("proofs")) open.result.createObjectStore("proofs"); };
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const db = open.result;
      const store = db.transaction("proofs", mode === "get" ? "readonly" : "readwrite").objectStore("proofs");
      const request = mode === "put" ? store.put(image, key) : mode === "get" ? store.get(key) : store.delete(key);
      request.onsuccess = () => { resolve(mode === "get" ? (request.result as string | null) || null : null); db.close(); };
      request.onerror = () => { resolve(null); db.close(); };
    };
  });
}

export const loadDraftImage = (key: string) => imageStore(key, "get");
export const saveDraftImage = (key: string, image: string) => imageStore(key, "put", image);
