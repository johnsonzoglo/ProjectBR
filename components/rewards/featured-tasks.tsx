"use client";
import { useState } from "react";
import { TaskTile } from "./task-tile";
import type { Task } from "../../lib/rewards";
export function FeaturedTasks({tasks,rate,onOpen}:{tasks:Task[];rate?:number;onOpen:(task:Task)=>void}){const [index,setIndex]=useState(0);if(!tasks.length)return null;const current=index%tasks.length;return <section className="featured-section" aria-label="Featured tasks"><h2>Featured tasks</h2><TaskTile task={tasks[current]} rate={rate} onOpen={onOpen}/>{tasks.length>1&&<nav className="cover-carousel-dots" aria-label="Choose featured task">{tasks.map((task,i)=><button key={task.id} className={current===i?"is-active":""} onClick={()=>setIndex(i)} aria-label={"Show "+task.title} aria-pressed={current===i}/>)}</nav>}</section>;}
