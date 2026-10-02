import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { db } from "../../database.js";
import { requireUser } from "../permissions/access.js";
import { validate } from "./rewards.controller.js";

const campaignSchema = z.object({
  name: z.string().trim().min(3).max(120),
  objective: z.string().trim().min(10).max(1000),
  budgetCents: z.number().int().min(100).max(100000000),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
}).strict().refine(value => !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt), "Campaign end must be after its start.");

const briefSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(500),
  instructions: z.string().trim().min(10).max(4000),
  category: z.enum(["Website", "Video", "App", "Survey", "Feedback", "Other"]),
  rewardPoints: z.number().int().min(1).max(1000000),
  dailyLimit: z.number().int().min(1).max(1000000),
  totalLimit: z.number().int().min(1).max(10000000),
}).strict();

@Controller("api/v1/advertiser")
export class AdvertiserController {
  private async account(req: Request) {
    const account = await requireUser(req);
    if (!account.permissions.includes("campaigns.manage") && !account.permissions.includes("rewards.manage")) throw new BadRequestException("Advertiser access is required.");
    return account;
  }

  @Get("overview")
  async overview(@Req() req: Request) {
    const { user, permissions } = await this.account(req);
    const ownerWhere = permissions.includes("rewards.manage") ? {} : { ownerId: user.id };
    const campaigns = await db.campaign.findMany({ where: ownerWhere, orderBy: { createdAt: "desc" }, include: { tasks: { where: { removedAt: null }, select: { id: true, title: true, active: true, rewardPoints: true, _count: { select: { runs: true } } } } } });
    const taskIds = campaigns.flatMap(campaign => campaign.tasks.map(task => task.id));
    const completed = taskIds.length ? await db.taskRun.groupBy({ by: ["taskId"], where: { taskId: { in: taskIds }, status: "completed" }, _count: true, _sum: { rewardPoints: true } }) : [];
    const completionMap = new Map(completed.map(row => [row.taskId, row]));
    const items = campaigns.map(campaign => ({ ...campaign, tasks: campaign.tasks.map(task => ({ ...task, completions: completionMap.get(task.id)?._count || 0, spentPoints: completionMap.get(task.id)?._sum.rewardPoints || 0 })) }));
    return { campaigns: items, totals: { campaigns: items.length, tasks: items.reduce((sum, item) => sum + item.tasks.length, 0), completions: completed.reduce((sum, item) => sum + item._count, 0), spentPoints: completed.reduce((sum, item) => sum + (item._sum.rewardPoints || 0), 0) } };
  }

  @Post("campaigns")
  async create(@Req() req: Request, @Body() body: unknown) {
    const { user } = await this.account(req); const data = validate(campaignSchema, body);
    const campaign = await db.campaign.create({ data: { ...data, ownerId: user.id } });
    await db.auditLog.create({ data: { actorId: user.id, targetId: campaign.id, action: "campaign.created", detail: { name: campaign.name, budgetCents: campaign.budgetCents } } });
    return campaign;
  }

  @Patch("campaigns/:id")
  async update(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user, permissions } = await this.account(req);
    const existing = await db.campaign.findUnique({ where: { id } });
    if (!existing || (existing.ownerId !== user.id && !permissions.includes("rewards.manage"))) throw new BadRequestException("Campaign not found.");
    const data = validate(campaignSchema.extend({ status: z.enum(["draft", "submitted", "active", "paused", "completed"]) }), body);
    const campaign = await db.campaign.update({ where: { id }, data });
    await db.auditLog.create({ data: { actorId: user.id, targetId: id, action: "campaign.updated", detail: { status: campaign.status } } });
    return campaign;
  }

  @Post("campaigns/:id/tasks")
  async createTaskBrief(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user, permissions } = await this.account(req); const campaign = await db.campaign.findUnique({ where: { id } });
    if (!campaign || (campaign.ownerId !== user.id && !permissions.includes("rewards.manage"))) throw new BadRequestException("Campaign not found.");
    const data = validate(briefSchema, body);
    const task = await db.task.create({ data: { ...data, campaignId: id, taskType: "standard", verification: "manual", startsAt: campaign.startsAt, endsAt: campaign.endsAt, active: false } });
    await db.auditLog.create({ data: { actorId: user.id, targetId: task.id, action: "campaign.task_brief_created", detail: { campaignId: id, title: task.title } } });
    return task;
  }

  @Get("templates")
  async templates(@Req() req: Request) {
    await this.account(req);
    return [
      { key: "website-test", name: "Website usability test", category: "Website", rewardPoints: 500, description: "Ask participants to complete a flow and report what was clear or confusing.", instructions: "Open the website, complete the requested flow, then provide detailed feedback and a screenshot." },
      { key: "product-feedback", name: "Product feedback", category: "Feedback", rewardPoints: 400, description: "Collect structured feedback about a product concept or experience.", instructions: "Review the product information and answer each prompt honestly with specific observations." },
      { key: "video-review", name: "Video review", category: "Video", rewardPoints: 350, description: "Collect thoughtful reactions to approved video content.", instructions: "Watch the complete video, then provide a rating and a written review of at least 10 characters." },
      { key: "quick-survey", name: "Quick survey", category: "Survey", rewardPoints: 250, description: "Run a short research survey with clearly defined questions.", instructions: "Answer every question once. Responses should reflect your own experience and opinion." },
    ];
  }
}
