_:
    just --choose

# First-time setup: install deps, link Vercel project, pull env vars
setup:
    npm install
    npx vercel link
    npx vercel env pull .env

# Frontend + Vercel Functions on http://localhost:3001
dev:
    npm run dev:vercel

# Re-fork the `local-dev` Neon branch from prod
db-reset:
    npm run db:reset
