# SecureVault — MFA Authentication System
### Complete Technical Documentation

---

## Table of Contents

1. [What This Project Does](#1-what-this-project-does)
2. [Architecture Overview](#2-architecture-overview)
3. [Folder Structure](#3-folder-structure)
4. [How Authentication Works — Step by Step](#4-how-authentication-works)
5. [Database Design Explained](#5-database-design)
6. [Security Features Explained](#6-security-features)
7. [API Reference](#7-api-reference)
8. [How to Run Locally (Step by Step)](#8-how-to-run-locally)
9. [How to Deploy for Free](#9-free-deployment)
10. [Environment Variables Reference](#10-environment-variables)
11. [Common Errors & Fixes](#11-common-errors)
12. [Tech Stack Summary](#12-tech-stack)

---

## 1. What This Project Does

This is a complete **2-factor authentication (2FA/MFA) system** built with the MERN stack. When a user logs in, they must:

1. **Step 1** — Enter their email and password (standard login)
2. **Step 2** — Verify a one-time code via their chosen MFA method

Supported MFA methods:
- **Email OTP** — A 6-digit code is emailed via Gmail SMTP. Valid for 5 minutes.
- **TOTP App** — Works with Google Authenticator, Authy, or any RFC 6238-compatible app. Code rotates every 30 seconds.

**Who this is for:** This is an enterprise internship project demonstrating production-level authentication architecture using 100% free tools.

---

## 2. Architecture Overview

```
Browser (React/Vite on Vercel)
        │
        │  HTTPS requests with credentials
        ▼
Express API (Node.js on Render)
        │
        ├── Rate Limiter (express-rate-limit)
        ├── Helmet (secure HTTP headers)
        ├── CORS (restricted to frontend URL)
        │
        ├── POST /api/auth/register
        ├── POST /api/auth/login       ──► OTP via Gmail SMTP
        ├── POST /api/auth/verify-mfa  ──► Issues JWT in HttpOnly cookie
        ├── GET  /api/auth/dashboard   ──► Protected (requires JWT)
        └── POST /api/auth/logout
                │
                ▼
        MongoDB Atlas (M0 free cluster)
        ├── users collection
        └── otpsessions collection (TTL auto-delete after 5 min)
```

**Key design decision:** The system uses a **two-request login flow**:
- Request 1: Validates password → sends OTP → returns `sessionToken` (a random hex string, NOT a JWT)
- Request 2: Client submits `sessionToken` + OTP → server validates → issues real JWT cookie

The `sessionToken` is intentionally weak (no user data inside it). It only maps to an OTP record in the database. This prevents attackers from using the token for anything until the OTP is verified.

---

## 3. Folder Structure

```
mfa-system/
│
├── backend/
│   ├── server.js              ← Express app setup, DB connection
│   ├── package.json
│   ├── .env.example           ← Copy to .env and fill in
│   │
│   ├── models/
│   │   ├── User.js            ← User schema (email, passwordHash, mfaSecret)
│   │   └── OtpSession.js      ← Temporary OTP record with TTL auto-delete
│   │
│   ├── controllers/
│   │   └── authController.js  ← All business logic (register, login, verify)
│   │
│   ├── routes/
│   │   └── authRoutes.js      ← Route definitions + input validation rules
│   │
│   ├── middleware/
│   │   └── authMiddleware.js  ← JWT verification for protected routes
│   │
│   └── utils/
│       ├── emailService.js    ← Nodemailer Gmail SMTP setup
│       └── totpService.js     ← otplib TOTP secret/QR/verify
│
└── frontend/
    ├── index.html
    ├── vite.config.js         ← Dev proxy: /api → localhost:5000
    ├── tailwind.config.js
    ├── .env.example
    │
    └── src/
        ├── main.jsx           ← React entry point
        ├── App.jsx            ← Route logic (login / register / mfa / dashboard)
        ├── index.css          ← Design system (CSS variables, animations)
        │
        ├── context/
        │   └── AuthContext.jsx ← Global user state, login/logout functions
        │
        ├── components/
        │   ├── Register.jsx        ← Registration form + TOTP QR setup
        │   ├── LoginForm.jsx       ← Step 1: email + password
        │   ├── MfaVerification.jsx ← Step 2: 6-digit OTP input + countdown
        │   └── Dashboard.jsx       ← Protected page shown after full auth
        │
        └── utils/
            └── api.js             ← Axios instance with interceptors
```

---

## 4. How Authentication Works

### Registration

```
User fills form → POST /register
    ↓
Server hashes password with bcrypt (12 salt rounds)
    ↓
If MFA = email:   User saved, ready to login
If MFA = totp:    Server generates TOTP secret → creates QR code
                  QR returned to frontend for user to scan
                  User scans → enters first TOTP code
                  POST /verify-totp-setup confirms secret works
                  User marked as verified
```

### Login — Step 1 (Password Check)

```
User submits email + password → POST /login
    ↓
Server finds user by email (fails silently if not found — prevents user enumeration)
    ↓
bcrypt.compare(submitted password, stored hash)
    ↓ success
Generate sessionToken = crypto.randomBytes(32).toString('hex')
    ↓
If email MFA:
    Generate 6-digit OTP = crypto.randomInt(900000) + 100000
    Hash OTP with bcrypt (10 rounds)
    Store OtpSession { userId, otpHash, sessionToken, expiresAt: +5min }
    Send OTP email via Nodemailer
    Return { sessionToken, emailHint: "a***@gmail.com" }

If TOTP MFA:
    Store OtpSession { ..., channel: 'totp' } (no OTP to generate)
    Return { sessionToken, mfaChannel: 'totp' }
```

### Login — Step 2 (MFA Verification)

```
User submits { sessionToken, otp } → POST /verify-mfa
    ↓
Find OtpSession by sessionToken
Check: not expired, not used, attemptCount < 5
    ↓
If email:  bcrypt.compare(submitted otp, stored otpHash)
If totp:   otplib.authenticator.verify(token, user.mfaSecret)
    ↓ valid
Mark session as used (prevents replay attack)
Update user.lastLogin
Issue JWT → set as HttpOnly cookie (expires 7 days)
Return user data
    ↓ invalid
Increment attemptCount
Return error with remaining attempts
If attemptCount >= 5: delete session (force re-login)
```

### Protected Routes

```
GET /dashboard (with JWT cookie)
    ↓
authMiddleware reads cookie (or Authorization header fallback)
    ↓
jwt.verify(token, JWT_SECRET) → extracts userId
    ↓
Fetch user from DB (confirms account still exists)
    ↓
Attach user to req.user
    ↓
Controller returns dashboard data
```

---

## 5. Database Design

### User Schema

| Field | Type | Notes |
|-------|------|-------|
| name | String | 2–50 chars |
| email | String | Unique, lowercased |
| passwordHash | String | bcrypt hash, hidden from queries by default |
| mfaSecret | String | Base32 TOTP secret, hidden from queries |
| preferredMfaChannel | String | 'email' or 'totp' |
| isMfaEnabled | Boolean | Always true in this system |
| isTotpVerified | Boolean | TOTP users must verify QR before logging in |
| isVerified | Boolean | Email users: true on register. TOTP users: true after QR verification |
| lastLogin | Date | Updated on every successful full login |

**Why passwordHash and mfaSecret have `select: false`:**
Mongoose's `select: false` means these fields are never returned in any query by default. You must explicitly add `.select('+passwordHash')` to get them. This prevents accidental exposure in API responses.

### OTP Session Schema

| Field | Type | Notes |
|-------|------|-------|
| userId | ObjectId | References User |
| otpHash | String | bcrypt hash of the 6-digit code |
| sessionToken | String | Random hex, given to frontend |
| channel | String | 'email' or 'totp' |
| expiresAt | Date | Default: now + 5 minutes |
| attemptCount | Number | Incremented on wrong OTP |
| isUsed | Boolean | Set to true after successful verification |

**TTL Index:** The line `otpSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })` tells MongoDB to automatically delete any OtpSession document once `expiresAt` has passed. This means expired sessions are cleaned up without any cron jobs.

---

## 6. Security Features

| Feature | Where | Why |
|---------|-------|-----|
| bcrypt (12 rounds) | Registration | Password hashes are one-way and slow to brute-force |
| bcrypt (10 rounds) | OTP storage | OTPs are also hashed — if DB is leaked, raw codes aren't exposed |
| HttpOnly Cookie | Login success | JavaScript cannot read this cookie → XSS proof |
| Secure + SameSite cookie | Production | Prevents CSRF and cookie interception over HTTP |
| sessionToken (not JWT) | Step 1 response | The interim token has zero privileges until OTP is verified |
| Attempt counting | OTP verification | 5 wrong guesses = session deleted, must re-login |
| TTL index | MongoDB | OTP sessions auto-delete after 5 minutes |
| isUsed flag | OTP session | Prevents the same OTP from being used twice (replay attack) |
| Rate limiting | All routes | Login: 10 req/15min, MFA: 15 req/15min, Register: 5 req/hr |
| Helmet | Express | Sets 15+ secure HTTP response headers |
| CORS restriction | Express | Only accepts requests from the configured frontend URL |
| Consistent error messages | Login | "Invalid email or password" — never reveals which field is wrong |
| express-validator | All routes | Input sanitized and validated before touching DB |
| JWT expiry | Auth tokens | 7-day expiry, re-auth required after that |

---

## 7. API Reference

### POST /api/auth/register
```json
Request:
{
  "name": "Veeresh Kumar",
  "email": "veeresh@example.com",
  "password": "SecurePass123",
  "preferredMfaChannel": "email"
}

Response 201:
{
  "success": true,
  "message": "Account created successfully.",
  "data": {
    "userId": "...",
    "name": "Veeresh Kumar",
    "preferredMfaChannel": "email",
    "qrCode": null
  }
}
```

For TOTP, `qrCode` is a base64 PNG data URL. `mfaSecret` is also returned (show once, user must save it).

---

### POST /api/auth/login
```json
Request:
{ "email": "veeresh@example.com", "password": "SecurePass123" }

Response 200:
{
  "success": true,
  "message": "OTP sent to your email.",
  "data": {
    "sessionToken": "a1b2c3...64hexchars",
    "mfaChannel": "email",
    "emailHint": "v******@example.com"
  }
}
```

---

### POST /api/auth/verify-mfa
```json
Request:
{ "sessionToken": "a1b2c3...", "otp": "482910" }

Response 200:
{
  "success": true,
  "message": "Authentication successful.",
  "data": { "user": { "id": "...", "name": "Veeresh Kumar", ... } }
}

Sets cookie: jwt=<JWT>; HttpOnly; Secure; SameSite=None
```

---

### GET /api/auth/dashboard
```
Headers: Cookie: jwt=<JWT>   (sent automatically by browser)

Response 200:
{
  "success": true,
  "data": { "user": { "id", "name", "email", "preferredMfaChannel", "lastLogin" } }
}
```

---

### POST /api/auth/logout
Clears the JWT cookie. Returns `{ "success": true }`.

---

## 8. How to Run Locally

### Prerequisites
- Node.js v18 or higher
- A free MongoDB Atlas account (cluster takes ~2 minutes to set up)
- A Gmail account (you'll generate an App Password)

---

### Step 1: Clone / Download the project

```bash
# If using git:
git clone <your-repo-url>
cd mfa-system

# Or just unzip the project folder
```

---

### Step 2: Set up MongoDB Atlas

1. Go to https://cloud.mongodb.com → Create free account
2. Create a new **M0 Free Cluster** (any region)
3. In "Database Access" → Add user → copy username & password
4. In "Network Access" → Add IP Address → "Allow Access from Anywhere" (0.0.0.0/0) for dev
5. In your cluster → "Connect" → "Drivers" → copy the connection string
   - It looks like: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/`
   - Add the database name at the end: `...mongodb.net/mfa_system`

---

### Step 3: Set up Gmail App Password

**You cannot use your regular Gmail password.** You need a special App Password:

1. Enable 2-Step Verification on your Google account (if not already)
2. Go to: https://myaccount.google.com/security
3. Search "App passwords" → Select "Mail" → "Windows Computer" → Generate
4. Copy the 16-character password (spaces don't matter)

---

### Step 4: Configure backend environment

```bash
cd mfa-system/backend
cp .env.example .env
```

Edit `.env`:
```
MONGO_URI=<paste-your-atlas-connection-string-here>
JWT_SECRET=<generate-a-random-64-char-string>
EMAIL_USER=<your-gmail-address>
EMAIL_PASS=<16-char-app-password-no-spaces>
EMAIL_FROM=SecureVault <<your-gmail-address>>
CLIENT_URL=http://localhost:5173
NODE_ENV=development
APP_NAME=SecureVault
PORT=5000
```

---

### Step 5: Install and run backend

```bash
cd mfa-system/backend
npm install
npm run dev
```

You should see:
```
✅ MongoDB connected
🚀 Server running on port 5000
```

---

### Step 6: Configure and run frontend

Open a **new terminal**:

```bash
cd mfa-system/frontend
cp .env.example .env
# .env can stay as-is for local dev (Vite proxy handles /api calls)
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

---

### Step 7: Test the full flow

1. Click "Create one" to register
2. Enter name, email, strong password
3. Choose **Email OTP** first (simpler to test)
4. Click "Create Account"
5. Go to Sign In, enter your credentials
6. Check your email inbox for the 6-digit code
7. Enter the code in the OTP cells
8. You should land on the Dashboard

To test **TOTP**:
1. Register a second account, choose "Authenticator App"
2. Install Google Authenticator on your phone
3. Scan the QR code shown after registration
4. Enter the 6-digit code from the app to complete setup
5. On login, open the app and enter the current code

---

## 9. Free Deployment

### Backend → Render

1. Push your backend folder to a GitHub repo
2. Go to https://render.com → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. Add Environment Variables (same as your `.env` file, but change):
   - `NODE_ENV=production`
   - `CLIENT_URL=https://your-app.vercel.app` ← your Vercel URL

⚠️ **Render free tier spins down after 15 minutes of inactivity.** First request after sleep takes ~30 seconds. This is normal for the free tier.

---

### Frontend → Vercel

1. Push your frontend folder to GitHub
2. Go to https://vercel.com → New Project → Import repo
3. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite
4. Add Environment Variable:
   - `VITE_API_URL=https://your-backend.onrender.com`
5. Deploy

After deploying:
- Go back to Render → Update `CLIENT_URL` to your Vercel URL
- Redeploy the backend for the CORS change to take effect

---

## 10. Environment Variables

### Backend (.env)

| Variable | Required | Description |
|----------|----------|-------------|
| MONGO_URI | ✅ | MongoDB Atlas connection string |
| JWT_SECRET | ✅ | Secret for signing JWTs (32+ chars random string) |
| JWT_EXPIRES_IN | Optional | Default: 7d. Can be 1d, 12h, etc. |
| PORT | Optional | Default: 5000 |
| CLIENT_URL | ✅ | Frontend URL for CORS (no trailing slash) |
| NODE_ENV | ✅ | development or production |
| EMAIL_USER | ✅ for email MFA | Your Gmail address |
| EMAIL_PASS | ✅ for email MFA | 16-char Gmail App Password |
| EMAIL_FROM | Optional | Display name in sent emails |
| APP_NAME | Optional | Shown in emails and UI. Default: SecureVault |

### Frontend (.env)

| Variable | Required | Description |
|----------|----------|-------------|
| VITE_API_URL | Prod only | Your Render backend URL. Not needed locally (Vite proxy handles it) |

---

## 11. Common Errors & Fixes

**"Invalid email or password" (even with correct credentials)**
→ Check that you copied the right MongoDB connection string. Check if your IP is whitelisted in Atlas Network Access.

**"Connection refused" or network error on frontend**
→ Make sure the backend is running (`npm run dev` in `/backend`). Check that `vite.config.js` proxy points to port 5000.

**Email OTP not arriving**
→ Check spam folder. Verify your Gmail App Password is correct (no spaces when pasting). Make sure 2FA is enabled on your Google account — App Passwords require it.

**"TOTP: invalid token"**
→ Your phone clock might be out of sync. Android: Settings → Date & Time → Sync now. iPhone: Settings → General → Date & Time → Set Automatically.

**Render deployment: CORS errors**
→ Make sure `CLIENT_URL` in Render environment variables exactly matches your Vercel URL (no trailing slash, correct https://).

**"Too many requests"**
→ You've hit a rate limit. Wait 15 minutes or restart the backend server in development.

---

## 12. Tech Stack

| Layer | Technology | Why Free |
|-------|-----------|----------|
| Frontend | React 18 + Vite | Open source |
| Styling | Tailwind CSS | Open source |
| Hosting (Frontend) | Vercel Free tier | Unlimited personal projects |
| Backend | Node.js + Express | Open source |
| Hosting (Backend) | Render Free tier | 750 hrs/month |
| Database | MongoDB Atlas M0 | 512MB forever free |
| Auth Tokens | JWT (jsonwebtoken) | Open source |
| Password hashing | bcryptjs | Open source |
| Email OTP | Nodemailer + Gmail | Free Gmail SMTP |
| TOTP | otplib | Open source (implements RFC 6238) |
| QR Code | qrcode | Open source |
| Security headers | helmet | Open source |
| Rate limiting | express-rate-limit | Open source |
| Validation | express-validator | Open source |

**Total infrastructure cost: $0/month**

---

*Built as an enterprise internship demonstration project. Architecture follows production best practices: no plaintext secrets, no JWT in localStorage, defense in depth.*
