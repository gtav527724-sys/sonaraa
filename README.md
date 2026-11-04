# SONARA — Music App

## Deploy (5 min, permanent)
1. GitHub: new repo `sonara` → upload these files
2. https://vercel.com/new → Import → `sonara` → Deploy
3. https://neon.tech → new project → copy URL
4. Vercel → Settings → Env Vars → add `DATABASE_URL` → Redeploy
5. Init DB once: `DATABASE_URL=<neon-url> bash init-db.sh`

## Android APK
APP_URL="https://<your>.vercel.app" bash android/build.sh
