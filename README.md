# ✂️ Daily Halve

A daily precision game — cut an object as close to **50/50** as you can. One object, one cut, one chance per day.

**[Play at daily-halve.com](http://daily-halve.com)**

## How it works

1. An object is revealed each day
2. Click and drag to draw your cut line
3. Both halves get weighed on a balance scale
4. The closer to 50/50, the higher your score (max 1000)
5. Share your result with friends

## Tech stack

| Layer | Tech |
|---|---|
| Monorepo | Turborepo |
| Frontend | Next.js 15, TypeScript, App Router |
| Backend | Express 4, TypeScript |
| Package manager | pnpm |

## Project structure

```
daily-halve/
├── apps/
│   ├── web/          # Next.js frontend (port 3000)
│   └── api/          # Express API (port 3001)
└── packages/
    └── typescript-config/   # Shared TS configs
```

## Getting started

```bash
# Install dependencies
pnpm install

# Run all apps in dev mode
pnpm dev
```

## Scoring

```
score = 1000 × (1 − |50 − yourPct| / 50)
```

| Cut | Score |
|---|---|
| 50.0% / 50.0% | 1000 🎯 |
| 48% / 52% | 960 🔥 |
| 45% / 55% | 900 ✂️ |
| 40% / 60% | 800 👍 |
| 30% / 70% | 400 😬 |
