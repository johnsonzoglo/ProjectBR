"use client";
import { useEffect, useState } from "react";
import { api, type Profile } from "../lib/api";
export function HeaderProfileAvatar({ name }: { name: string }) {
  const [image,setImage]=useState<string|null>(null);
  useEffect(()=>{api<Profile>("/me").then(profile=>setImage(profile.user.image||null)).catch(()=>undefined)},[]);
  return <span className="neon-avatar">{image?<img src={image} alt=""/>:name.slice(0,1).toUpperCase()}<i /></span>;
}
