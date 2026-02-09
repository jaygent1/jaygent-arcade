# JAY GENT ARCADE - Setup Guide

## v3.0 - Social Features

This version adds user accounts, profiles, and followers using Supabase for authentication and PostgreSQL storage.

---

## 1. Supabase Setup

### Create Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for database provisioning (~2 min)

### Run Schema Migration
1. Go to **SQL Editor** in your Supabase dashboard
2. Paste the contents of `supabase/schema.sql`
3. Click **Run**

### Configure Auth Providers

Go to **Authentication > Providers** and enable:

#### Google
1. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Add `https://YOUR-PROJECT.supabase.co/auth/v1/callback` as redirect URI
3. Enter Client ID and Secret in Supabase

#### GitHub
1. Create OAuth app in [GitHub Developer Settings](https://github.com/settings/developers)
2. Authorization callback URL: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
3. Enter Client ID and Secret in Supabase

#### X (Twitter)
1. Create app in [Twitter Developer Portal](https://developer.twitter.com/)
2. Enable OAuth 2.0 with read:user permissions
3. Callback URL: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
4. Enter Client ID and Secret in Supabase

#### Facebook
1. Create app in [Facebook Developers](https://developers.facebook.com/)
2. Add Facebook Login product
3. Valid OAuth Redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
4. Enter App ID and Secret in Supabase

#### Magic Link (Email)
- Enabled by default
- Customize email templates in **Authentication > Email Templates**

### Get API Keys
1. Go to **Settings > API**
2. Copy:
   - Project URL → `SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_KEY`

---

## 2. Railway Deployment

### Quick Deploy
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

### Manual Deploy
1. Connect your GitHub repo
2. Add environment variables:
   ```
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_KEY=eyJ...
   PORT=8080
   ```
3. Deploy!

### Domain Setup
1. Go to **Settings > Domains**
2. Add custom domain (e.g., `jaygent.gg`)
3. Update DNS records as instructed

---

## 3. Local Development

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env

# Edit .env with your Supabase keys
nano .env

# Run server
npm start
```

Server runs at `http://localhost:8080`

---

## API Endpoints

### Auth
- `GET /api/auth/config` - Get Supabase config for frontend

### Users/Profiles
- `GET /api/me` - Get current user profile (auth required)
- `PATCH /api/me` - Update profile (auth required)
- `GET /api/users/:username` - Get public profile
- `GET /api/users/:username/followers` - Get followers list
- `GET /api/users/:username/following` - Get following list
- `POST /api/users/:username/follow` - Follow user (auth required)
- `DELETE /api/users/:username/follow` - Unfollow user (auth required)

### Feed
- `GET /api/feed` - Get scores from followed users (auth required)

### Scores
- `GET /api/scores` - Leaderboard
- `POST /api/scores` - Submit score (links to user if authenticated)

---

## Files Added/Changed

```
games/
├── lib/
│   └── supabase.js        # Server-side Supabase client
├── js/
│   └── auth.js            # Frontend auth module
├── supabase/
│   └── schema.sql         # Database schema
├── profile.html           # User profile page
├── railway.json           # Railway config
├── .env.example           # Environment template
└── SETUP.md               # This file
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (HTML/JS)                                     │
│  - Auth via @supabase/supabase-js (CDN)                │
│  - OAuth redirects handled by Supabase                  │
│  - JWT stored in localStorage                           │
└─────────────────────────────────────────────────────────┘
                        │ Bearer Token
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Node.js Server                                         │
│  - Validates JWT via Supabase Admin client              │
│  - Queries Supabase PostgreSQL for data                 │
│  - Gracefully degrades if Supabase not configured       │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Supabase                                               │
│  ├── Auth (handles OAuth, magic link, sessions)         │
│  └── PostgreSQL (profiles, follows, scores)             │
└─────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### "Auth not configured"
- Check that `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set
- On Railway: Check Variables tab

### OAuth redirect not working
- Verify callback URL matches exactly: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
- Check provider app is published/active

### Profiles not creating on signup
- Run the schema.sql migration in Supabase SQL Editor
- Check the `on_auth_user_created` trigger exists

---

Built with 🎩 by Jay Gent
