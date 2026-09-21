import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { db } from "../../database.js";
import { requireUser } from "../permissions/access.js";
import { validate } from "./rewards.controller.js";
const inputSchema=z.object({title:z.string().trim().min(3).max(100),description:z.string().trim().max(300),image:z.string().max(2800000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),destination:z.string().max(2000).refine(value=>/^\/(?!\/)[A-Za-z0-9/_?=&%-]*$/.test(value)||z.url({protocol:/^https?$/}).safeParse(value).success,"Use a site path or HTTP/HTTPS link"),placement:z.enum(["banner","ad"]),active:z.boolean(),startsAt:z.iso.datetime(),endsAt:z.iso.datetime().nullable()}).strict().refine(v=>!v.endsAt||new Date(v.endsAt)>new Date(v.startsAt),"End must follow start");
const live=()=>({active:true,startsAt:{lte:new Date()},OR:[{endsAt:null},{endsAt:{gt:new Date()}}]});
@Controller("api/v1")
export class PromotionsController {
 @Get("promotions") async list(@Req() req:Request){await requireUser(req);const rows=await db.promotion.findMany({where:live(),omit:{image:true},orderBy:{updatedAt:"desc"},take:10});return rows.map(r=>({...r,imageUrl:"/api/v1/promotions/"+r.id+"/image?v="+r.updatedAt.getTime()}));}
 @Get("promotions/:id/image") async image(@Req() req:Request,@Param("id") id:string,@Res() res:Response){const {permissions}=await requireUser(req);const row=await db.promotion.findFirst({where:{id,...(permissions.includes("rewards.manage")?{}:live())}});const match=row&&/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(row.image);if(!match)throw new NotFoundException("Image unavailable.");res.type(match[1]).send(Buffer.from(match[2],"base64"));}
 @Get("admin/promotions") async admin(@Req() req:Request){await requireUser(req,"rewards.manage");return db.promotion.findMany({orderBy:{updatedAt:"desc"},take:100});}
 @Post("admin/promotions") async create(@Req() req:Request,@Body() body:unknown){const {user}=await requireUser(req,"rewards.manage");const input=validate(inputSchema,body);return db.$transaction(async tx=>{const row=await tx.promotion.create({data:input});await tx.auditLog.create({data:{actorId:user.id,targetId:row.id,action:"promotion.created",detail:{title:row.title}}});return row;});}
 @Put("admin/promotions/:id") async update(@Req() req:Request,@Param("id") id:string,@Body() body:unknown){const {user}=await requireUser(req,"rewards.manage");const input=validate(inputSchema,body);return db.$transaction(async tx=>{if(!await tx.promotion.findUnique({where:{id}}))throw new NotFoundException();const row=await tx.promotion.update({where:{id},data:input});await tx.auditLog.create({data:{actorId:user.id,targetId:id,action:"promotion.updated",detail:{active:row.active}}});return row;});}
 @Delete("admin/promotions/:id") async remove(@Req() req:Request,@Param("id") id:string){const {user}=await requireUser(req,"rewards.manage");return db.$transaction(async tx=>{await tx.promotion.deleteMany({where:{id}});await tx.auditLog.create({data:{actorId:user.id,targetId:id,action:"promotion.removed"}});return {success:true};});}
}
