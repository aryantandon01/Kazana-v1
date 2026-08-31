# Kazana Mobile (Expo)

React Native app using the same Next.js API as the web app.

## Setup

```bash
cd apps/mobile
npm install
```

Create `apps/mobile/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_API_URL=http://localhost:3000
```

For a physical device, use your machine's LAN IP instead of `localhost` for `EXPO_PUBLIC_API_URL`.

## Run

```bash
npm start
```

## Features

- Discover resumes (`GET /api/resumes`)
- Browse jobs (`GET /api/jobs`)
- View matches (`GET /api/matches`) — requires login
- Settings + Expo push token registration (`POST /api/devices`)

## Push notifications

1. Log in on mobile (same Supabase account as web)
2. Open Settings → enable push → Save
3. Run `npm run match` and `npm run notify` on the server (or wait for Vercel cron)
