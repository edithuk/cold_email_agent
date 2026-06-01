# 🌊 DripFlow — Cold Email Outreach CRM

DripFlow is a full-stack, production-grade cold email outreach platform. It lets you run personalised multi-stage drip campaigns, manage contacts from spreadsheets, compose rich HTML templates, and track delivery in real time — all secured with client-side AES-GCM encryption so your Gmail credentials never touch a server in plain text.

---

## ✨ Features

### 🔐 Firebase Authentication
- **Google OAuth + Email/Password** sign-in
- Every campaign, template, credential, and scheduled job is scoped to the authenticated user in Firestore
- Auto-loads profile from any browser, zero re-configuration

### 🔒 Zero-Knowledge SMTP Encryption (AES-256-GCM)
- Your Gmail App Password is encrypted **entirely in the browser** via the Web Cryptography API (`SubtleCrypto` — PBKDF2 key derivation + AES-GCM)
- Only the ciphertext is stored in Firestore; the server never sees the plaintext password
- Cloud Functions derive the same key server-side to dispatch background emails

### 📊 Dashboard & Campaign History
- Aggregate metrics: total campaigns, total recipients, overall delivery success rate
- Full campaign history card grid with live status badges (`running`, `queued`, `paused`, `completed`, `stopped`)
- Click any past campaign card to re-open its detailed monitor view

### 🧙 4-Step Campaign Wizard
| Step | Name | What you do |
|------|------|-------------|
| 1 | **Setup** | Name the campaign, verify SMTP, upload a resume attachment, load a `.csv`/`.xlsx` contact sheet |
| 2 | **Compose** | Write each stage in a Quill rich-text editor; insert dynamic tags; preview on desktop or phone bezel |
| 3 | **Review** | Pre-flight spam scan, full checklist, template flow summary |
| 4 | **Monitor** | Real-time progress bar, live log console, per-contact status table, follow-up schedule |

### ⏱️ Server-Side Drip Campaign Engine
- Campaigns run **entirely on Google Cloud** — closing your browser doesn't stop sending
- Up to 4 stages: initial send + 3 follow-ups per contact
- Configurable **inter-contact delay** (seconds) and **inter-stage delay** (relative days/hours or absolute date-time)
- Account-level **queue**: multiple campaigns per Gmail account queue automatically — one active at a time
- **Pause / Resume / Stop** controls update Firestore; the Cloud Function reads the flag mid-chunk

### 📋 Send Queue Page (`/queue`)
- Full list of all campaigns with real-time status
- Paginated view of all contacts and their per-email delivery status
- Queue position indicator for waiting campaigns

### 📁 Template Vault
- Save, load, update, and delete named templates to Firestore
- **Public / Private** toggle to share templates with the community
- Dynamic tag chips: CSV column headers auto-detected + custom freeform tags

### 🔍 Spam Score & Deliverability Grade
- 250+ spam-trigger keyword scan across marketing, finance, clickbait, and urgency categories
- Live **A–F** grade badge with a score out of 100
- Tooltip highlights in the preview show which words triggered flags

### 🤖 AI Copilot
- In-editor AI assistant powered by **Groq (Llama 3.3 70B)** or **Google Gemini**
- Helps draft, rewrite, and improve email copy without leaving the composer

### 🌗 Dark / Light Theme
- System-aware default; toggle persists across sessions

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite, `react-router-dom` v6, `react-quill-new`, `xlsx` |
| Styling | Vanilla CSS (design tokens, glassmorphism, scroll-driven animations) |
| Auth & Database | Firebase Authentication, Cloud Firestore |
| API (HTTP) | Firebase Cloud Functions v2 — Express app exported as `api` |
| Background Jobs | Firebase Cloud Functions v2 — Firestore trigger + Cloud Scheduler |
| Encryption | Web Crypto API (browser) + Node 20 `webcrypto` (functions) |
| Email Transport | Nodemailer → Gmail SMTP |
| AI Copilot | Groq API / Google Gemini API |
| Secrets | Firebase Secret Manager (`ENCRYPTION_SALT`) |
| CI/CD | GitHub Actions → Firebase Hosting + Functions |

---

## 📂 Project Structure

```
cold_email_agent/
├── frontend/                        # React + Vite web application
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/                # LoginPage, UserMenu
│   │   │   ├── controls/            # SendControls (start/pause/resume/stop)
│   │   │   ├── dashboard/           # Dashboard (metrics + campaign history)
│   │   │   ├── editor/              # TemplateEditor, TemplateSidebar
│   │   │   ├── layout/              # Header (URL-aware breadcrumb)
│   │   │   ├── panels/              # CredentialsPanel, ContactsPanel,
│   │   │   │                        # ResumePanel, ScheduledJobsPanel
│   │   │   ├── preview/             # PreviewPanel (device bezel + spam highlighter)
│   │   │   ├── queue/               # SendQueuePage (full campaign + contact list)
│   │   │   └── wizard/              # CampaignWizard + StepSetup, StepCompose,
│   │   │                            # StepReview, StepMonitor
│   │   ├── context/                 # AuthContext, ThemeContext
│   │   ├── utils/
│   │   │   ├── aiCopilot.js         # Groq / Gemini client
│   │   │   ├── crypto.js            # AES-GCM encrypt/decrypt (browser)
│   │   │   ├── spamScanner.js       # 250+ keyword spam scanner
│   │   │   ├── stageUtils.js        # Follow-up stage helpers
│   │   │   └── template.js          # <tag> compiler
│   │   ├── firebase.js              # Firebase init + emulator connections
│   │   ├── App.jsx                  # Route definitions + global state
│   │   ├── index.css                # Design system (tokens, animations)
│   │   └── main.jsx                 # Provider wrappers + BrowserRouter
│   ├── .env.example                 # ← copy to .env.local and fill in values
│   ├── vite.config.js               # Dev server + /api proxy to emulator
│   └── package.json
│
├── functions/                       # Firebase Cloud Functions (Node 20)
│   ├── index.js                     # Thin entry point — exports all functions
│   ├── lib/
│   │   ├── init.js                  # Firebase Admin init + shared singletons
│   │   ├── crypto.js                # AES-GCM decrypt (mirrors frontend/crypto.js)
│   │   ├── template.js              # <tag> compiler (mirrors frontend/template.js)
│   │   ├── auth.js                  # Bearer-token verifier for Express routes
│   │   ├── smtp.js                  # Credential fetch + nodemailer factory
│   │   ├── queue.js                 # Account-level campaign queue management
│   │   └── swagger.js               # OpenAPI spec + Swagger UI middleware
│   ├── triggers/
│   │   ├── scheduledFollowUps.js    # Cloud Scheduler (every 1 h) follow-up dispatch
│   │   └── campaignChunk.js         # Firestore onDocumentWritten chunk processor
│   ├── routes/
│   │   ├── campaigns.js             # POST start/stop/pause/resume-campaign
│   │   └── email.js                 # POST validate-credentials, send-email
│   ├── .env.example                 # ← documents required Firebase Secrets
│   ├── .secret.local                # Local secret values for emulator (git-ignored)
│   └── package.json
│
├── .github/workflows/               # CI/CD pipelines
│   ├── firebase-hosting-merge.yml   # Auto-deploy frontend on main merge
│   ├── firebase-hosting-pull-request.yml  # Preview channel on PRs
│   └── firebase-manual-deploy.yml   # Manual trigger for functions deploy
│
├── firebase.json                    # Emulator ports + hosting rewrites
├── firestore.rules                  # User-scoped security rules
├── firestore.indexes.json           # Composite index for scheduled_jobs
├── package.json                     # Root scripts (dev:local, dev:prod, install:all)
└── README.md
```

---

## 🌐 Application Routes

| URL | Page |
|-----|------|
| `/` | Dashboard — metrics, campaign history |
| `/campaign/new` | 4-step campaign wizard |
| `/campaign/:id` | Campaign detail / monitor (deep-linkable, survives refresh) |
| `/queue` | Send queue — all campaigns + paginated contact list |

---

## 🔌 API Endpoints

All endpoints live under the `api` Cloud Function. Base URL in production:
`https://us-central1-<project-id>.cloudfunctions.net/api`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | — | Health check |
| `GET` | `/api/docs` | — | Interactive Swagger UI |
| `POST` | `/api/start-campaign` | Bearer | Create campaign + acquire queue slot |
| `POST` | `/api/stop-campaign` | Bearer | Graceful stop (or cancel if queued) |
| `POST` | `/api/pause-campaign` | Bearer | Pause between contacts |
| `POST` | `/api/resume-campaign` | Bearer | Resume a paused campaign |
| `POST` | `/api/validate-credentials` | — | Verify Gmail SMTP credentials |
| `POST` | `/api/send-email` | — | Send a single email (selective mode) |

Interactive documentation is available at `/api/docs` on any running instance.

---

## 🚀 Local Setup

### Prerequisites
- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project with **Authentication**, **Firestore**, and **Functions** enabled

---

### 1. Clone & Install

```bash
git clone https://github.com/your-username/cold_email_agent.git
cd cold_email_agent
npm run install:all          # installs root + frontend + functions dependencies
```

---

### 2. Firebase Project Setup

```bash
firebase login
firebase use --add            # select your Firebase project
```

---

### 3. Configure Frontend Environment

```bash
cp frontend/.env.example frontend/.env.local
```

Edit `frontend/.env.local` and fill in your values:

```env
# Firebase project config (Firebase Console → Project Settings → Your apps)
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Local vs production — 'true' uses emulators, 'false' uses production Firebase
VITE_USE_EMULATOR=true

# Must match ENCRYPTION_SALT in functions/.secret.local and Secret Manager
VITE_ENCRYPTION_SALT=any_long_random_string

# AI Copilot: 'gemini' or 'groq'
VITE_AI_PROVIDER=groq
VITE_GROQ_API_KEY=your_groq_api_key
VITE_GROQ_MODEL=llama-3.3-70b-versatile
# VITE_GEMINI_API_KEY=your_gemini_key
# VITE_GEMINI_MODEL=gemini-2.0-flash
```

---

### 4. Configure Functions Secret (Local Emulator)

Create `functions/.secret.local` (already git-ignored):

```bash
echo "ENCRYPTION_SALT=any_long_random_string" > functions/.secret.local
```

> ⚠️ The value **must exactly match** `VITE_ENCRYPTION_SALT` in `frontend/.env.local`, otherwise the server cannot decrypt saved SMTP passwords.

---

### 5. Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

### 6. Run Locally (Everything Against Emulators)

```bash
npm run dev
```

This starts **both** in one terminal:
- Firebase Emulators (Auth :9099 | Firestore :8080 | Functions :5001 | PubSub :8085)
- Vite dev server at **[http://localhost:5173](http://localhost:5173)**

The Emulator UI is available at **[http://localhost:4000](http://localhost:4000)**.

> The Vite proxy automatically forwards `/api/*` requests to the local Functions emulator. The Firebase SDK connects to local Auth and Firestore emulators. Nothing touches production while `VITE_USE_EMULATOR=true`.

---

### 7. Run Against Production Firebase (Optional)

```bash
npm run dev:prod
```

Overrides the emulator flag and connects your local frontend directly to production Firebase. Useful for checking live data.

---

## 🚢 Production Deployment

### Deploy Everything
```bash
firebase deploy
```

### Deploy Functions Only
```bash
firebase deploy --only functions
```

### Deploy Frontend (Hosting) Only
```bash
npm run build --prefix frontend
firebase deploy --only hosting
```

### Set Production Secret
```bash
firebase functions:secrets:set ENCRYPTION_SALT
# Paste the same value as VITE_ENCRYPTION_SALT when prompted
```

### Required Firestore Composite Index
In the Firebase Console, create a composite index on the `scheduled_jobs` **collection group**:
- Field 1: `status` — Ascending
- Field 2: `sendAfter` — Ascending
- Query scope: **Collection group**

Or deploy via `firestore.indexes.json`:
```bash
firebase deploy --only firestore:indexes
```

---

## 📋 Running a Campaign

1. **Sign In** — Google OAuth or email/password
2. **Save Credentials** — Enter your Gmail address + [16-character App Password](https://myaccount.google.com/apppasswords). Click **Verify** — the app encrypts it in the browser before saving to Firestore
3. **New Campaign** — Click **＋ New Campaign** on the dashboard
4. **Step 1 — Setup**: Name the campaign, upload a `.csv`/`.xlsx` contact sheet, optionally attach a resume PDF
5. **Step 2 — Compose**: Write your initial email. Add follow-up stages with relative delays (e.g. *3 days 6 hours*) or an absolute date. Use `<name>`, `<company>`, and any CSV column header as template tags
6. **Step 3 — Review**: Check the pre-flight spam score and delivery checklist
7. **Step 4 — Send**: Click **▶ Send Emails**. Campaigns run on Google Cloud — you can close the tab. Come back anytime to see live progress
8. **Control Mid-Campaign**: Use **Pause / Resume / Stop** from the campaign detail page or the Send Queue page at `/queue`

---

## 🔐 Security Notes

- SMTP passwords are **never transmitted in plain text** — encryption happens before any network call
- All Firestore data is protected by user-scoped security rules (`request.auth.uid == userId`)
- Firebase Admin SDK (used in Cloud Functions) bypasses Firestore rules by design — it is trusted server-side code
- The `ENCRYPTION_SALT` secret is stored in **Google Cloud Secret Manager** and injected at runtime — it never appears in source code or environment variables in production

---

## 🗺️ Environment Summary

| | `npm run dev` (local) | `npm run dev:prod` | Production |
|---|---|---|---|
| Frontend | localhost:5173 | localhost:5173 | Firebase Hosting |
| Functions | Emulator :5001 | **Production** | Cloud Run (us-central1) |
| Firestore | Emulator :8080 | **Production** | Cloud Firestore |
| Auth | Emulator :9099 | **Production** | Firebase Auth |
| Data | Ephemeral (resets on emulator restart) | Live production data | Live production data |
