_:
    just --choose

# First-time setup: install deps
setup:
    npm install

# Frontend + Vercel Functions on http://localhost:3001
dev:
    npm run dev:vercel

# Re-fork the `local-dev` Neon branch from prod
db-reset:
    npm run db:reset
