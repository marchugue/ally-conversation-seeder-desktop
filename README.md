# ALLY-JIS Conversation Seeder (Desktop Electron + React.js)

Minimal admin-only desktop Electron + React.js tool for seeding conversation points and streak days through the centralized ALLY-JIS backend.

## Features
- **Admin-Only Login Auth**: Authenticates via `POST /api/auth/login` and strictly enforces admin access via `GET /api/admin/me`.
- **Centralized Backend Connection**: Defaults to `https://api.ally-jis.com` (with one-click toggle to `http://localhost:3001` or any custom URL), proxied through Electron's main process (`net.fetch`).
- **Membership Conversations List**: Displays each conversation's member real names alongside their anonymous names.
- **Simple Seeder Controls**: Two inputs (`Point` and `Days Streak`) and one CTA button (`Seed Data`) calling `POST /api/admin/seeder/points`.

## Development & Run
```bash
npm install
npm run electron:dev   # Vite + Electron dev mode
npm run electron:start # Build Vite bundle + launch Electron
```

