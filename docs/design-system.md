# Rewardly mobile design system — Home Dashboard

Scope: `/` (interactive, explicitly labeled sample preview) and `/dashboard` (existing authenticated account). Other pages retain their original interface. No API, authentication, database, or financial behavior changes.

## Tokens

Tokens are defined in `app/rewards.css` under `.reward-app` and are reusable by subsequent screens:

| Token | Dark default | Light theme |
| --- | --- | --- |
| Primary | #a397ff | #6547db |
| Secondary | #73b8ff | #2462c4 |
| Accent | #ffd477 | #906006 |
| Success | #6ee7b7 | #16734d |
| Warning | #ffd477 | #906006 |
| Error | #ff9d9d | #b72e45 |
| Background | #0e1120 | #f4f5fc |
| Surface | #171b2e | #ffffff |
| Text primary | #f6f5ff | #202039 |
| Text secondary | #a7abc4 | #64647d |

Surfaces use 20–26px radii, one-pixel borders, restrained shadows, and a purple wallet gradient. Controls have 44px minimum touch targets. Typography uses the existing Geist font. Layout is mobile-first: one column by default, two-column task cards from 600px, desktop sidebar from 1024px, wide dashboard split from 1280px. Bottom navigation respects safe-area insets.

## Reusable components

`AnimatedCounter`, `ProgressRing`, `RewardCard`, `BalanceCard`, `TaskCard`, `StreakCard`, `AchievementBadge`, `MembershipCard`, `DailyBonusCard`, `BottomNavigation`, `DashboardSkeleton`, `Modal`, and `ClaimSuccessModal` live in `components/rewards`.

## Interactions

- Category filters only filter preview task cards.
- Preview tasks open a native modal dialog with instructions and a clearly identified demo code. Simulating verification updates only ephemeral sample balances and sample progress; refresh resets the preview.
- Live accounts show unavailable balances and upcoming features, never invented points, streaks, XP, membership tiers, or earnings.
- Notification and daily-bonus buttons show honest feature information. No fake unread count or bonus claim.
- Light/dark preference is the only value saved to localStorage. Account and reward data never use browser storage.
- Counters animate on value changes; progress animates once; success confetti is finite. Reduced-motion disables animations, including count-up and smooth scrolling.
- Native dialog handles focus trapping, Escape, and return focus. Controls expose accessible names; navigation marks the active page; balance animations have a stable screen-reader value.

Next screen: Tasks, after review of the Home Dashboard.
