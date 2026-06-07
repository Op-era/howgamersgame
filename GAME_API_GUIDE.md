# HowGamersGame — Game Developer API Guide

## Overview

Games hosted on **howgamersgame.online** can integrate with the platform's coin system, letting players spend and earn coins inside your game. Coins are purchased by players using real money through the site's store.

---

## Authentication

All API requests from your game require a **Game API Key**.

```
Authorization: Bearer hgg_your_api_key_here
```

API keys are issued per game in the admin dashboard. Keep your key secret — store it server-side or in a secure game backend.

---

## Base URL

```
https://howgamersgame.online/api
```

---

## Endpoints

### 1. Get Coin Balance

Check how many coins a player has.

```
GET /api/coins/balance?userId={userId}
Authorization: Bearer <game-api-key>
```

**Response:**
```json
{
  "userId": "uuid-of-user",
  "balance": 2400
}
```

**Error responses:**
- `401` — Invalid or missing API key
- `404` — User not found

---

### 2. Spend Coins

Deduct coins from a player's balance (for purchases inside your game).

```
POST /api/coins/spend
Authorization: Bearer <game-api-key>
Content-Type: application/json

{
  "userId": "uuid-of-user",
  "amount": 250,
  "reason": "Purchased double-jump upgrade"
}
```

**Response (success):**
```json
{
  "success": true,
  "spent": 250,
  "balance": 2150
}
```

**Response (insufficient coins):**
```json
{
  "error": "Insufficient coins",
  "balance": 150
}
```

**Error responses:**
- `401` — Invalid API key
- `402` — Insufficient coins
- `404` — User not found
- `409` — Concurrent update — retry the request

---

### 3. Award Coins

Give coins to a player (achievements, daily rewards, etc.).  
Max 10,000 per single call to prevent exploit abuse.

```
POST /api/coins/award
Authorization: Bearer <game-api-key>
Content-Type: application/json

{
  "userId": "uuid-of-user",
  "amount": 50,
  "reason": "Daily login bonus"
}
```

**Response:**
```json
{
  "success": true,
  "awarded": 50,
  "balance": 2200
}
```

---

## Getting the Player's userId

When your game is launched, the platform passes the user's ID in a query parameter on the iframe URL:

```
https://yourgame.com/play?userId=abc123&token=<signed-jwt>
```

The `token` is a short-lived JWT you can verify with the shared secret (provided separately) to ensure it wasn't forged.

**Example URL your game receives:**
```
https://mygame.com/index.html?userId=7f3a...&token=eyJ...
```

---

## Coin Value Reference

| Purchase | Coins | Bonus |
|----------|-------|-------|
| $1       | 100   | —     |
| $5       | 550   | +10%  |
| $10      | 1,200 | +20%  |
| $20      | 2,200 | +10%  |
| $40      | 5,000 | +25%  |
| $100     | 14,000| +40%  |

1 coin ≈ $0.01 base value. Use this to price your in-game items accordingly.

---

## Adding Your Game to the Platform

To list a game on the platform, provide:

1. **Title** — The name displayed on the cartridge and TV screen
2. **Description** — Short (1–2 sentences) shown on the TV
3. **Long description** (optional)
4. **Genre** tag (e.g., Puzzle, Action, RPG)
5. **Game URL** — Where your game is hosted (must be HTTPS)
6. **Cover art** — See `CARTRIDGE_TEMPLATE.md` for specs
7. **Cartridge label** — Small thumbnail (see template)

---

## Cartridge Art Template

### Required assets:

#### 1. Cover Art (TV + full cartridge display)
- **Size:** 800 × 600 px
- **Format:** PNG or WebP
- **Content:** Full game art — shown on the TV when cartridge is selected, and on the pulled-out cartridge face
- Upload to Supabase Storage → `games/covers/{game-slug}.png`

#### 2. Cartridge Label (rack thumbnail)
- **Size:** 200 × 120 px
- **Format:** PNG
- **Content:** Small logo / icon of the game — shown in the cartridge rack slot label area
- Upload to Supabase Storage → `games/labels/{game-slug}.png`

The blank cartridge body 3D model/image is provided by the platform. Your art is composited onto it automatically.

---

## Security Notes

- **Never expose your game API key** in client-side JavaScript.
- Use a backend server (Node, Cloudflare Workers, etc.) to make coin API calls.
- Always validate `userId` with the provided JWT token before spending coins.
- The platform logs all transactions — disputes can be reviewed in the admin dashboard.
