import { redirect } from "next/navigation";

// Temporarily use Tasks as the user landing page.
export default function DashboardPage() { redirect("/tasks"); }
