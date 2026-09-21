import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { env } from "../../config.js";

const proofDirectory = resolve(env.TASK_PROOF_DIR);
const dataImage = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const storedProof = /^task-proof:([a-f0-9]{64})\.(png|jpeg|webp)$/;

export function decodeTaskProof(value: string) {
  const match = dataImage.exec(value);
  if (!match) throw new BadRequestException("Upload a PNG, JPG, or WebP image.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 2 * 1024 * 1024 || bytes.toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "")) {
    throw new BadRequestException("Upload an image under 2 MB.");
  }
  return { bytes, type: match[1], hash: createHash("sha256").update(bytes).digest("hex") };
}

export function taskProofReference(hash: string, type: string) { return `task-proof:${hash}.${type}`; }
export function taskProofUrl(runId: string) { return `/api/v1/task-proofs/${runId}`; }
export function displayTaskProof<T extends { id: string; proofImage?: string | null }>(run: T): T {
  return run.proofImage?.startsWith("task-proof:") ? { ...run, proofImage: taskProofUrl(run.id) } : run;
}

export async function saveTaskProof(value: string) {
  const { bytes, type, hash } = decodeTaskProof(value);
  const reference = taskProofReference(hash, type);
  await mkdir(proofDirectory, { recursive: true });
  try { await writeFile(resolve(proofDirectory, `${hash}.${type}`), bytes, { flag: "wx", mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  return { reference, hash };
}

export async function loadTaskProof(reference: string) {
  const match = storedProof.exec(reference);
  if (!match) return null;
  try { return { bytes: await readFile(resolve(proofDirectory, `${match[1]}.${match[2]}`)), type: match[2] }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
