# Rewardly mobile design system

Scope: all application screens, including Home, authentication, Tasks, Rewards, Referrals, Profile, Admin, getting started, loading/error states, and the not-found page. No API, authentication, database, or financial behavior changes.

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

`AnimatedCounter`, `ProgressRing`, `RewardCard`, `BalanceCard`, `TaskCard`, `StreakCard`, `AchievementBadge`, `DailyBonusCard`, `BottomNavigation`, `DashboardSkeleton`, `Modal`, and `ClaimSuccessModal` live in `components/rewards`.

## Interactions

- Category filters work on preview cards at Home and live task cards on Tasks.
- Preview tasks open a native modal dialog with instructions and a clearly identified demo code. Simulating verification updates only ephemeral sample balances and sample progress; refresh resets the preview.
- Signed-in Tasks, Wallet, Referrals, Dashboard, and Profile use real account activity. Streaks, deposits, and membership benefits are not invented to match reference imagery.
- Notification and daily-bonus buttons show honest feature information. No fake unread count or bonus claim.
- Light/dark preference is the only value saved to localStorage. Account and reward data never use browser storage.
- Counters animate on value changes; progress animates once; success confetti is finite. Reduced-motion disables animations, including count-up and smooth scrolling.
- Native dialog handles focus trapping, Escape, and return focus. Controls expose accessible names; navigation marks the active page; balance animations have a stable screen-reader value.

## Shared page implementation

`components/shell.tsx` uses the same desktop sidebar and mobile bottom navigation as Home. The active navigation item follows the current route. The Home and other screens share `useRewardTheme` so theme changes carry across navigation, including login and recovery screens. Only theme preference is stored locally.

`app/pages.css` applies the Home tokens to existing forms, cards, profile sessions, and admin lists. Admin table rows become cards below 1200px to keep the directory readable beside the desktop sidebar. Account-status edits use a focus-trapped dialog and retain the original API calls, permission checks, and required reason.

Local development remains the delivery surface for this update.

## Mobile reference update

The supplied TaskPay screenshots inform the signed-in UI: pale lavender backgrounds, white rounded cards, blue wallet and profile panels, green success/reward badges, a deep-purple referral invitation, and a five-item bottom navigation (Home, Tasks, Wallet, Refer, Profile). Rewardly retains its own branding. The brand and Home links open Dashboard. Light mode is the default; an existing saved theme preference is respected.

`app/reference-ui.css` layers this direction over the existing tokens, with responsive layouts and reduced-motion support. `components/rewards/task-tile.tsx` presents illustrated task banners using the original generated `public/images/reward-banner.png` artwork. Reward amounts and USD equivalents come from actual task rewards and the configured conversion rate; labels show verification and task state instead of fabricated durations or popularity counts.

`components/rewards/account-points.tsx` shows the real points balance in the shared header. Successful API mutations broadcast a refresh event so visible account summaries stay current. Profile displays actual claimed-task totals and referral earnings, with links to existing wallet/referral flows. Wallet shows progress toward the configured minimum withdrawal and the three supported request methods; deposits, gift cards, and instant payouts were not added.
