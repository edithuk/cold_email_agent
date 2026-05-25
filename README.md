# ✉️ Cold Email Agent (Premium CRM Upgrade)

A sleek, state-of-the-art recruiter outreach CRM web application designed to run highly personalized recruiter cold outreach campaigns. Upgraded with cloud authentication, dynamic template vaults, client-side cryptographic security, responsive layout engines, and interactive pre-flight checks.

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
- **🌍 Public / 🔒 Private Toggles**: Instantly share high-converting templates with the community or keep them securely in your personal vault.
- **Dynamic CSV + Custom tag chips**: Includes Core tags (`<name>`, `<company>`, etc.), **CSV-derived tags** (auto-detected from *any* column header in your spreadsheet), and **freeform Custom tags** clickable to insert directly at the cursor.

### 📱 4. Simulated Mobile & Desktop Device Preview Frame
- **Device Emulation**: Fluidly toggle the dynamic email compiler between **Desktop Web** and **Mobile App** preview modes.
- **Aesthetic Mobile Bezel**: Selecting mobile mode compiles your email directly inside a realistic, custom CSS-styled smartphone bezel with rounded corners, notch, and status bar, ensuring pixel-perfect layout testing.
- **Contact Navigator**: Arrow controls to cycle through all imported contacts and view exactly how each dynamic tag compiles.

### ✅ 5. Interactive Pre-Flight Checklist
- **Real-time Validation**: 6-point checklist automatically monitors credentials verification, spreadsheet uploads, column maps, template completeness, unmapped tags, and email format issues.
- **Campaign Gatekeeper**: Highlights blocking errors (e.g. unverified SMTP) and non-blocking warnings (e.g. malformed recipient email) before you start.

### ☀️/🌙 6. Dual Theme Support & Refined UX
- **Obsidian Slate Dark Mode**: Seamless toggle between the warm cream palette and a premium dark mode designed to reduce eye strain.
- **＋ New Campaign Button**: Quick reset action that clears current contacts, CSV map, templates, logs, and attachments while securely keeping SMTP credentials. Includes a **two-click confirmation state** to prevent accidental wipes.

---

## 🛠️ Tech Stack

- **Frontend**: React (Vite), Firebase Client SDK, `react-quill-new` (Rich WYSIWYG editor), `xlsx` (Local spreadsheet parser), Web Cryptography API.
- **Backend**: Node.js, Express, `nodemailer` (SMTP transport).
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
VITE_ENCRYPTION_SALT=random_alphanumeric_secret_salt_string_here
```

---

### 🛡️ 3. Deploy Firestore Security Rules
To enable secure, authenticated database access, navigate to the **Firestore Database** → **Rules** tab in the Firebase console and deploy these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only the authenticated user can read/write their own profiles, SMTP keys, and templates
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

### 🏃‍♂️ 4. Run Development Server
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
├── backend/                  # Node.js Express server
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
│   │   │   └── preview/      # PreviewPanel (Emulated Device Frame)
│   │   ├── context/          # AuthContext, ThemeContext
│   │   │   ├── AuthContext.jsx
│   │   │   └── ThemeContext.jsx
│   │   ├── utils/            # SubtleCrypto AES-GCM & Template compilers
│   │   │   ├── crypto.js
│   │   │   └── template.js
│   │   ├── App.jsx           # App shell assembly
│   │   ├── index.css         # Dark & Light Warm Cream design systems
│   │   └── main.jsx          # Providers wrapper entry point
│   ├── vite.config.js        # Dev proxy configurations
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
5. **Craft Your Template**:
   - Write your email subject and body.
   - Insert Core tags, sheet-derived columns, or create new freeform Custom tags.
   - Use the **📂 Saved Templates** sidebar to save this layout to Firestore or load existing public/private templates.
6. **Double-Check Preview**: Emulate **Mobile/Desktop** views and cycle through your contact rows using the navigator to ensure tag compiling is correct.
7. **Pre-flight Check**: Check that all items in the pre-flight checklist are green.
8. **Delay & Dispatch**: Set a safe delay (e.g. `15s` or higher) and hit **▶ Send Emails**!
