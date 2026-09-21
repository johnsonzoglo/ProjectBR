import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { db } from "../../database.js";
import { requireUser } from "../permissions/access.js";
import { validate } from "../rewards/rewards.controller.js";
import { notificationFeed } from "./feed.js";
@Controller("api/v1/notifications")
export class NotificationsController {
 @Get("tasks") async tasks(@Req() req:Request) {
  const {user,permissions}=await requireUser(req);
  if(permissions.includes("users.read")) return [];
  const since=new Date(Date.now()-30*86400000);
  const runs=await db.taskRun.findMany({where:{userId:user.id,OR:[{status:"approved",submittedAt:{gte:since}},{status:"completed",completedAt:{gte:since}}]},select:{id:true,status:true,rewardPoints:true,submittedAt:true,task:{select:{title:true}}},orderBy:{submittedAt:"desc"},take:20});
  const keys=runs.map(run=>`task:${run.id}:${run.status}:${run.submittedAt?.getTime()}`);
  const reads=await db.notificationRead.findMany({where:{userId:user.id,key:{in:keys}},select:{key:true}});
  const read=new Set(reads.map(item=>item.key));
  return runs.flatMap((run,index)=>read.has(keys[index])?[]:[{...run,key:keys[index]}]);
 }
 @Get() async feed(@Req() req:Request,@Query("page") input="1") {const {user,permissions}=await requireUser(req);const all=await notificationFeed(user.id,permissions);const page=Math.max(1,Math.min(10000,Math.floor(Number(input)||1)));return {items:all.slice((page-1)*20,page*20),total:all.length,unread:all.filter(i=>!i.read).length,page};}
 @Post("read") async read(@Req() req:Request,@Body() body:unknown){const {user,permissions}=await requireUser(req);const data=validate(z.object({keys:z.array(z.string().max(200)).max(100)}).strict(),body);const all=await notificationFeed(user.id,permissions);const permitted=new Set(all.map(i=>i.key));await db.notificationRead.createMany({data:[...new Set(data.keys)].filter(key=>permitted.has(key)).map(key=>({userId:user.id,key})),skipDuplicates:true});return {success:true};}
}
