import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/how-it-works", "/contact", "/privacy", "/terms", "/login", "/register"],
      disallow: ["/admin", "/api", "/dashboard", "/membership", "/payments", "/profile", "/referrals", "/support", "/tasks", "/wallet"],
    },
  };
}
