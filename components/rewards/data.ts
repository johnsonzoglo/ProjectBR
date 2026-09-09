import { ClipboardList, Globe2, MessageSquareText, Play, Smartphone, Users } from "lucide-react";

export const categories = ["All", "Video", "App", "Survey", "Website", "Social", "Feedback"] as const;
export type Category = (typeof categories)[number];
export const categoryIcons = { Video: Play, App: Smartphone, Survey: ClipboardList, Website: Globe2, Social: Users, Feedback: MessageSquareText };
export type PreviewTask = { id: string; title: string; description: string; category: Exclude<Category, "All">; minutes: number; points: number; featured?: boolean };
export const previewTasks: PreviewTask[] = [
  { id: "video", title: "Watch. Discover. Earn.", description: "Get a fresh perspective in a short brand story.", category: "Video", minutes: 3, points: 150, featured: true },
  { id: "survey", title: "Your opinion has value", description: "Share your take in a quick lifestyle survey.", category: "Survey", minutes: 5, points: 300 },
  { id: "app", title: "Try your next favorite app", description: "Explore a new app and share your first impression.", category: "App", minutes: 8, points: 450 },
  { id: "website", title: "A little window shopping", description: "Explore a featured website at your own pace.", category: "Website", minutes: 2, points: 120 },
  { id: "social", title: "Meet a new community", description: "Discover an approved promotional campaign.", category: "Social", minutes: 3, points: 100 },
  { id: "feedback", title: "Help make it better", description: "Turn thoughtful product feedback into progress.", category: "Feedback", minutes: 6, points: 250 },
];
