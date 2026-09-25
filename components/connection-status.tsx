"use client";
import { useEffect, useState } from "react";
export function ConnectionStatus(){const[offline,setOffline]=useState(false);useEffect(()=>{const sync=()=>setOffline(!navigator.onLine);sync();addEventListener("online",sync);addEventListener("offline",sync);return()=>{removeEventListener("online",sync);removeEventListener("offline",sync)}},[]);return offline?<div className="rw-offline" role="status">You are offline. Saved drafts remain on this device; reconnect to submit.</div>:null}
