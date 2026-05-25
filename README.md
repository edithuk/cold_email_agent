# ✉️ Cold Email Agent (Premium CRM Upgrade)

A sleek, state-of-the-art recruiter outreach CRM web application designed to run highly personalized recruiter cold outreach campaigns. Upgraded with cloud authentication, dynamic template vaults, client-side cryptographic security, responsive layout engines, interactive pre-flight checks, deliverability score scanning, advanced multi-stage drip sequencing, and cloud background execution.

---

## ✨ Upgraded Features

### 🔐 1. Firebase Authentication & User Profiles
- **Multi-method Auth**: Clean email/password sign-up/login gates combined with one-click **Google OAuth**.
- **User-Scoped Persistence**: All templates, settings, and campaigns are dynamically scoped to the logged-in user in Cloud Firestore.
- **Auto-Loading Profile**: Access your custom outreach hub from any browser without losing your configurations.

### 🔒 2. Zero-Knowledge SMTP Encryption (AES-GCM)
- **High-Security client-side encryption**: Your sensitive Gmail App Password is encrypted **locally in your browser** using the Web Cryptography API (`SubtleCrypto` utilizing PBKDF2 key derivation and 256-bit AES-GCM).
- **Secure Cloud Storage**: Only the encrypted ciphertext is saved to Firestore. Without your unique account identifier and server-side environment secrets, the stored data is completely unreadable.

### 📁 3. Cloud Template Vault & Custom Tags
- **Dynamic Template CRUD**: Save, update, load, and delete named templates directly in the cloud.
- **🌍 Public / 🔒 Private Toggles**: Instantly share templates with the community or keep them securely in your personal vault.
- **Dynamic CSV + Custom tag chips**: Includes Core tags (`<name>`, `<company>`, etc.), **CSV-derived tags** (auto-detected from *any* column header in your spreadsheet), and **freeform Custom tags** clickable to insert directly at the cursor.

### 📱 4. Simulated Mobile & Desktop Device Preview Frame
- **Device Emulation**: Fluidly toggle the dynamic email compiler between **Desktop Web** and **Mobile App** preview modes.
- **Aesthetic Mobile Bezel**: Selecting mobile mode compiles your email directly inside a realistic, custom CSS-styled smartphone bezel with rounded corners, notch, and status bar, ensuring pixel-perfect layout testing.
- **Contact Navigator**: Arrow controls to cycle through all imported contacts and view exactly how each dynamic tag compiles.

### 📈 6. Deliverability Grade & Spam Word Scanner
- **Real-Time Pre-Flight Scan**: Scans email templates instantly against 250+ spam-trigger keywords across marketing, finance, clickbait, and urgency categories.
- **Dynamic Letter Grade**: Computes a deliverability score out of 100 with a clean `A` to `F` grade badge.
- **Interactive Highlight Tooltip**: Highlights flag-trigger keywords directly in the template preview and shows helpful alternatives to keep your emails out of the promotions/spam tab.

### ⏱️ 7. Multi-Stage Drip Follow-up Engine
- **Sequential Follow-ups**: Configure a sequence of up to 4 follow-up stages (Stage 1 initial send, Stages 2-4 automatic follow-ups if the recipient doesn't reply).
- **Dual-Mode Scheduling**:
  - **Relative Delay**: Set precise wait timers after the preceding send (e.g. wait `3 days` + `6 hours`).
  - **Absolute Date**: Use a dynamic date-time picker to schedule dispatch for a precise date and time.
- **Live Scheduling Dashboard**: The `Scheduled Follow-ups` panel lists upcoming, pending, sent, and failed jobs, including a one-click manual cancellation option.

### 🖥️ 8. Pro Viewport-Locked CSS Grid UX
- **No Page Scroll**: Switch to a locked-viewport 3-row grid. Left-hand sidebar stays pinned so credentials and checklist options are always visible.
- **Independent Scrolling Panels**: Proportional rows for Editor, Send Controls + Preview, and a side-by-side console (Activity Log | Scheduled Jobs | Contacts) scroll internally so the application feels like a native desktop app.

---

## 🛠️ Tech Stack

- **Frontend**: React (Vite), Firebase Client SDK, `react-quill-new` (Rich WYSIWYG editor), `xlsx` (Local spreadsheet parser), Web Cryptography API.
- **Backend (Express)**: Node.js, Express, `nodemailer` (SMTP transport).
- **Background Dispatcher (Cloud Functions v2)**: Node.js, `firebase-admin`, `@google-cloud/scheduler` (Hourly cron executor), Node 20 `webcrypto` (Decryption gateway).
- **Database / Auth**: Firebase Authentication, Cloud Firestore.

---

## 🚀 Getting Started

### 📦 1. Installation
Install all root, backend, and frontend dependencies by running this command in the project root:
```bash
npm run install:all
```

---

### 🔑 2. Firebase Configuration Setup
1. Go to the **[Firebase Console](https://console.firebase.google.com)** and create a new project named `cold-email-agent`.
2. Navigate to **Authentication** → **Sign-in method** → Enable **Email/Password** and **Google**.
3. Navigate to **Firestore Database** → **Create database** → Start in **Production mode** (choose your closest region).
4. Create a Web App under **Project Settings** (gear icon) and copy the `firebaseConfig` keys.
5. Create a new file in `frontend/.env.local` and add your keys (keep them gitignored):

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Client-side encryption key derivation salt (any long random string)
VITE_ENCRYPTION_SALT=7xK$m9B!vQ2wL&zP5pT#8cX1eN*m4vFj
```

---

### 🛡️ 3. Deploy Firestore Security Rules
Deploy these rules via the CLI in the root directory:
```bash
firebase deploy --only firestore:rules
```

---

### ⚡ 4. Background Job Deployment (Cloud Functions)
To handle background follow-up emails securely when the browser is closed:

1. **Upgrade to pay-as-you-go (Blaze)**: Needed to deploy Cloud Functions and use Secret Manager. (Stays 100% free under the generous free tier limits).
2. **Synchronize Encryption Secret**: Save your encryption salt to Google Cloud Secret Manager so the backend can decrypt your local SMTP key:
   ```bash
   firebase functions:secrets:set ENCRYPTION_SALT
   ```
   *(Paste your `VITE_ENCRYPTION_SALT` string when prompted)*
3. **Deploy Functions**:
   ```bash
   firebase deploy --only functions
   ```
4. **Create Composite Index**:
   Create a Composite Index in Firestore Console for subcollection group queries:
   * **Collection ID**: `scheduled_jobs`
   * **Fields**: `status` (Ascending) + `sendAfter` (Ascending)
   * **Query Scope**: `Collection group`

---

### 🏃‍♂️ 5. Run Development Server
Start the Vite frontend server and Express backend concurrently:
```bash
npm run dev
```

- **Vite Interface**: [http://localhost:5173](http://localhost:5173)
- **Express Backend**: [http://localhost:3001](http://localhost:3001)

---

## 📂 Project Structure

```text
cold_email_agent/
├── backend/                  # Node.js Express server (initial SMTP sends)
│   ├── server.js             # Nodemailer handler
│   └── package.json
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/       # Componentized frontend
│   │   │   ├── auth/         # LoginPage, UserMenu
│   │   │   ├── controls/     # SendControls
│   │   │   ├── editor/       # TemplateEditor, TemplateSidebar
│   │   │   ├── layout/       # Header
│   │   │   ├── panels/       # CredentialsPanel, ContactsPanel, ResumePanel
│   │   │   └── preview/      # PreviewPanel (Device Frame + Spam Highlighter)
│   │   ├── context/          # AuthContext, ThemeContext
│   │   ├── utils/            # SubtleCrypto AES-GCM & Spam scanner
│   │   │   ├── crypto.js
│   │   │   ├── template.js
│   │   │   └── spamScanner.js
│   │   ├── App.jsx           # Pro grid viewport shell assembly
│   │   ├── index.css         # Styling system
│   │   └── main.jsx          # Providers wrapper
│   ├── vite.config.js        # Dev proxy configurations
│   └── package.json
├── functions/                # Background Cloud Function (scheduled follow-ups)
│   ├── index.js              # Decrypts SMTP, parses templates & sends daily
│   └── package.json
├── package.json              # Orchestration settings
├── firestore.rules           # Security rules for production
└── README.md
```

---

## 📑 How to Run an Outreach Campaign

1. **Sign In**: Create a new account or log in with one-click **Google Sign-In**.
2. **Setup Credentials**: Enter your Gmail address and paste your 16-character **Google App Password**. Click **Verify** to secure it locally, test the backend integration, and sync it to your Firestore cloud profile.
3. **Load Contacts**: Drop your `.xlsx` or `.csv` spreadsheet.
4. **Map Fields**: Select which sheet columns correspond to standard outreach values (Email, Name, Company, Role).
5. **Craft Your Template Sequence**:
   - Write your Initial Email subject and body.
   - Click **+ Add Follow-up** to define up to 3 follow-up stages.
   - Use relative time delays (e.g. `After 2 days, 12 hours`) or pick an exact calendar date.
6. **Check Deliverability Grade**: Review the real-time spam scan. Hover over highlighted words in the Preview panel to see recommended synonyms to improve your deliverability score.
7. **Pre-flight Check**: Check that all items in the pre-flight checklist are green.
8. **Delay & Dispatch**: Set a safe delay (e.g. `15s` or higher) and hit **▶ Send Emails**! Initial emails will go out live, and future stages are written to Firestore as jobs for the Cloud Function to pick up automatically.
9. **Monitor Dashboard**: Keep track of scheduled, sent, and cancelled follow-ups under the bottom dashboard.

