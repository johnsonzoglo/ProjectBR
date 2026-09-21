import { db } from "../../database.js";
export type Notice = { key: string; title: string; message: string; href: string; category: string; createdAt: Date };
export async function notificationFeed(userId: string, permissions: string[]) {
 const items: Notice[]=[]; const since=new Date(Date.now()-30*86400000);
 const add=(key:string,title:string,message:string,href:string,category:string,createdAt:Date)=>items.push({key,title,message,href,category,createdAt});
 const staff=permissions.includes("users.read");
 if(staff){
  if(permissions.includes("rewards.manage")) await Promise.all([
   db.taskRun.findMany({where:{status:"pending_review",user:{status:"active"}},select:{id:true,submittedAt:true,startedAt:true,task:{select:{title:true}}}}).then(rows=>rows.forEach(r=>add("review:"+r.id+":"+r.submittedAt?.getTime(),"Submission needs review",r.task.title,"/admin/reviews","tasks",r.submittedAt||r.startedAt))),
   db.withdrawal.findMany({where:{status:{in:["pending","approved"]}},select:{id:true,status:true,amountCents:true,updatedAt:true}}).then(rows=>rows.forEach(r=>add("withdrawal:"+r.id+":"+r.status,r.status==="approved"?"Approved payout awaits sending":"Withdrawal needs approval","$"+(r.amountCents/100).toFixed(2),"/admin/withdrawals","payments",r.updatedAt))),
   db.deposit.findMany({where:{status:"pending_review"},select:{id:true,amountCents:true,submittedAt:true,createdAt:true}}).then(rows=>rows.forEach(r=>add("deposit:"+r.id+":"+r.submittedAt?.getTime(),"Deposit proof needs review","$"+(r.amountCents/100).toFixed(2),"/admin/payments","payments",r.submittedAt||r.createdAt))),
   db.auditLog.findMany({where:{action:{in:["task.fast_repeat_flagged","task.shared_proof_flagged"]},createdAt:{gte:since}},select:{id:true,action:true,createdAt:true},take:50,orderBy:{createdAt:"desc"}}).then(rows=>rows.forEach(r=>add("task-risk:"+r.id,r.action==="task.shared_proof_flagged"?"Task proof reused across accounts":"Very fast repeat submission","Review the task submission before approval.","/admin/reviews","tasks",r.createdAt)))
  ]);
  if(permissions.includes("audit.read")) {const failures=await db.auditLog.findMany({where:{action:"email.delivery_failed",createdAt:{gte:since}},select:{id:true,reason:true,createdAt:true}});failures.forEach(r=>add("email:"+r.id,"Account email failed",r.reason||"Check SMTP configuration and the account email address.","/admin/audit","email",r.createdAt));}
 }else{
  await Promise.all([
   db.taskRun.findMany({where:{userId,OR:[{status:"approved"},{completedAt:{gte:since}},{status:"in_progress",reviewReason:{not:null},submittedAt:{gte:since}}]},select:{id:true,status:true,rewardPoints:true,reviewReason:true,submittedAt:true,completedAt:true,startedAt:true,task:{select:{title:true}}}}).then(rows=>rows.forEach(r=>add("task:"+r.id+":"+r.status+":"+r.submittedAt?.getTime(),r.status==="completed"?"Reward credited":r.status==="approved"?"Task approved - claim your points":"Task needs a correction",r.task.title+" - "+(r.status==="in_progress"?r.reviewReason:r.rewardPoints+" points"),r.status==="completed"?"/wallet":"/tasks","tasks",r.completedAt||r.submittedAt||r.startedAt))),
   db.withdrawal.findMany({where:{userId,updatedAt:{gte:since}},select:{id:true,status:true,amountCents:true,updatedAt:true}}).then(rows=>rows.forEach(r=>add("withdrawal:"+r.id+":"+r.status,"Withdrawal "+r.status,"$"+(r.amountCents/100).toFixed(2)+(r.status==="approved"?" approved; payment has not been marked sent yet.":" reward withdrawal update."),"/wallet","payments",r.updatedAt))),
   db.deposit.findMany({where:{userId,status:{in:["completed","rejected","pending_review"]},OR:[{reviewedAt:{gte:since}},{submittedAt:{gte:since}}]},select:{id:true,status:true,amountCents:true,reviewedAt:true,submittedAt:true,createdAt:true}}).then(rows=>rows.forEach(r=>add("deposit:"+r.id+":"+r.status+":"+r.submittedAt?.getTime(),"Deposit "+r.status.replaceAll("_"," "),"$"+(r.amountCents/100).toFixed(2)+" deposit update.","/payments","payments",r.reviewedAt||r.submittedAt||r.createdAt))),
   db.membershipPurchase.findMany({where:{userId,OR:[{createdAt:{gte:since}},{expiresAt:{gte:since,lte:new Date(Date.now()+3*86400000)}}]},select:{id:true,status:true,createdAt:true,expiresAt:true,plan:{select:{name:true}}}}).then(rows=>rows.forEach(r=>{const phase=r.status!=="active"?r.status:r.expiresAt&&r.expiresAt<=new Date()?"expired":r.expiresAt&&r.expiresAt.getTime()<=Date.now()+3*86400000?"expiring soon":"active";add("membership:"+r.id+":"+phase,"Membership "+phase,r.plan.name,"/membership","membership",phase==="expired"?r.expiresAt!:r.createdAt);})),
   db.ledgerEntry.findMany({where:{userId,kind:"referral_credit",createdAt:{gte:since}},select:{id:true,points:true,createdAt:true}}).then(rows=>rows.forEach(r=>add("referral:"+r.id,"Referral reward credited",r.points+" points added to your wallet.","/referrals","referrals",r.createdAt)))
  ]);
 }
 if (permissions.includes("chat.manage") || !staff) {
  const chats = await db.chatConversation.findMany({ where: permissions.includes("chat.manage") ? {} : {userId}, include: { reads: {where:{userId}}, messages: {where:{senderId:{not:userId}},orderBy:{id:"desc"},take:1,select:{id:true,senderName:true,createdAt:true}} } });
  chats.forEach(chat=>{const message=chat.messages[0];if(message && message.id>(chat.reads[0]?.lastReadId||0)) add("chat:"+message.id,"New support message",permissions.includes("chat.manage")?"Message from "+message.senderName:"The support team replied to your conversation.",(permissions.includes("chat.manage")?"/admin/chat":"/support")+"?conversation="+chat.id,"chat",message.createdAt);});
 }
 items.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()||a.key.localeCompare(b.key));
 const reads=await db.notificationRead.findMany({where:{userId,key:{in:items.map(i=>i.key)}},select:{key:true}});const read=new Set(reads.map(r=>r.key));
 return items.map(item=>({...item,read:read.has(item.key)}));
}
