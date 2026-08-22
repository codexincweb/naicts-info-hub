# NAICTS INFOHUB — Complete Production-Oriented Build

NAICTS INFOHUB is a faculty-first information platform for National Association of Information and Communication Technology Students FUTMINNA. Visitors can open the website and read official, announcements, PRO communications and events from the faculty **without creating an account**.

## Public product rules
- No public registration or login.
- No member dashboard.
- No public download center.
- Public visitors can read and share published information.
- Only authorized staff use the protected CMS.

## CMS roles
- `super_admin` — full CMS control.
- `admin` — administration and publishing.
- `pro` — PR/news/event publishing responsibilities.
- `editor` — content preparation and review; publishing is restricted.

Publishing flow: **Draft → Review → Approved → Published → Archived**.

## Stack
- Node.js 20+
- Express 5
- PostgreSQL (production-safe database)
- JWT + bcryptjs for staff authentication
- Cloudinary for persistent image storage
- Vanilla HTML/CSS/JS frontend
- Helmet + CORS

## Why PostgreSQL instead of SQLite?
Render web-service filesystems should not be treated as the permanent source of truth for production application data. This build uses PostgreSQL from the beginning, so news, announcements, PRO posts, events and staff records survive deployments and restarts.

## Why Cloudinary for images?
Uploaded images are kept outside the Render web-service filesystem. The application stores the returned secure image URL in PostgreSQL. This prevents media from disappearing after redeployments.

## Run locally in Termux
1. Install Node.js 20+ and Git.
2. Extract the project and enter it:
   `cd NAICTS-INFOHUB-COMPLETE`
3. Installed dependencies:
   `npm install`
4. Copy environment configuration:
   `cp .env.example .env`
5. Create a local PostgreSQL database and put its connection string in `DATABASE_URL`.
6. Set a strong `JWT_SECRET`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`.
7. Incase I  need image uploads locally, I'll the three Cloudinary values.
8. Start:
   `npm start`
9. Open:
   `http://localhost:3000`
10. CMS:
   `http://localhost:3000/admin`

The database tables are created automatically on startup.

## GitHub from Termux
Do not commit `.env`.

```bash
git init
git add .
git commit -m "Build NAICTS INFOHUB production foundation"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/NAICTS-INFOHUB.git
git push -u origin main
```

## Render deployment
The included `render.yaml` describes the intended architecture: one Node web service + one PostgreSQL database. You can deploy the repository through Render Blueprint or configure the service manually.

Recommended Render settings:
- Build command: `npm install`
- Start command: `npm start`
- Runtime: Node
- `NODE_ENV=production`
- `DATABASE_URL`: Render PostgreSQL connection string
- `JWT_SECRET`: long random secret
- `ADMIN_EMAIL`:  real CMS email
- `ADMIN_PASSWORD`: strong initial CMS password
- Cloudinary credentials: from my Cloudinary account

**I will not and never put `.env`, database passwords, JWT secrets or Cloudinary secrets in GitHub.** Add secrets through Render Environment Variables.

## Health check
After deployment, I opened `/api/health`. A healthy response reports PostgreSQL and whether Cloudinary media storage is configured.

## Branding / logo
`public/assets/logo.svg` is the centralized branding asset currently included which is the SICT logo. The header, hero, footer, admin login and loading screen reference this same file. Replace that single file with the official supplied NAICTS/faculty logo when the original asset is available, keeping the filename `logo.svg`.

## Loading behavior
The public website uses the NAICTS logo as the central loading visual. Public navigation uses in-page/hash routing so article views can open without a full-page reload.

## Production security checklist
- I uses a long random `JWT_SECRET`.
- Used a strong unique CMS password.
- Used HTTPS through Render.
- Keeps all secrets in Render environment variables.
- I don't not commit `.env`.
- I Rotate the initial admin password after first deployment.
- And lastly I Configure Cloudinary before enabling image uploads.
