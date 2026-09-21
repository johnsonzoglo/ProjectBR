import { redirect } from "next/navigation";

// Homepage temporarily disabled; its design is preserved in components/disabled-home-page.tsx.
export default function Home() { redirect("/tasks"); }
