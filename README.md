# ✉️ Cold Email Agent

A sleek, minimalist, and offline-first web application designed to orchestrate highly personalized recruiter cold outreach campaigns. Built with React (Vite) and Express (Node.js), this application enables you to parse contact sheets locally, personalize templates in a rich-text WYSIWYG editor, attach your resume, and queue sequential SMTP dispatch securely via Gmail.

---

## ✨ Features

- **🔐 100% Local & Secure**: Credentials and Excel/CSV spreadsheets are parsed entirely in the browser (`SheetJS`). No client data is ever stored on a remote server.
- **📝 Quill Rich-Text WYSIWYG Editor**: Personalize the body of your emails with bold text, headings, lists, bullet points, and links. What you see is exactly what your recipient receives.
- **🏷️ Dynamic Template Interpolation**: Supports placeholder tags (`<name>`, `<company>`, `<role>`) in both the Subject line and the rich HTML body.
- **📄 Resume Attachment Support**: Drop your PDF or Word resume once, and it is automatically encoded and attached to every outgoing email in the sequence.
- **⏱️ Spam Filter Avoidance**: Integrated sending loop with a configurable delay slider (5s to 120s) between dispatch events.
- **⏸️ Live Control Center**: Start, Pause, Resume, or Stop your active campaign at any time with real-time status trackers (Total, Sent, Failed, Pending).
- **🖥️ Fluid Scroll-Bound Console**: Keep track of the active dispatch progress via a robust, auto-scrolled **Activity Log** console and a structured contact list tracker.
- **🎨 Warm Cream Aesthetics**: Sleek, minimalist user interface designed in a warm cream, light-mode palette with steel blue accents.

---

## 🛠️ Tech Stack

- **Frontend**: React (Vite), CSS Custom Properties (Theme tokens), `react-quill-new` (Rich text), `xlsx` (Local Excel/CSV parsing).
- **Backend**: Node.js, Express, `nodemailer` (SMTP transport).

---

## 🚀 Getting Started

### 📋 Prerequisites
Ensure you have **Node.js (v16+)** and **npm** installed on your machine.

---

### 🔑 1. Setup Gmail App Password (Required)
For security, Google prevents external apps from logging into Gmail with your primary password. You must generate an **App Password**:

1. Go to your [Google Account settings](https://myaccount.google.com/).
2. Navigate to **Security**.
3. Under *"How you sign in to Google"*, make sure **2-Step Verification** is turned **ON**.
4. Search for **App passwords** in the search bar or go directly to the App Passwords section.
5. Create a new App Password (e.g., Name it *"Cold Email Outreach"*).
6. Copy the generated **16-character password** (it looks like `xxxx xxxx xxxx xxxx`). Use this in the application instead of your real Gmail password.

---

### 📦 2. Installation
Clone or navigate to the repository directory and run the following orchestration command to install all root, backend, and frontend dependencies:

```bash
npm run install:all
```

---

### 🏃‍♂️ 3. Run Development Server
Start both the React Vite frontend and the Express backend concurrently in a single terminal session:

```bash
npm run dev
```

- **Frontend Interface**: [http://localhost:5173](http://localhost:5173)
- **Backend Server**: [http://localhost:5001](http://localhost:5001)

---

## 📂 Project Structure

```text
cold_email_agent/
├── backend/               # Node.js Express server
│   ├── server.js          # SMTP validation and Nodemailer handler
│   └── package.json
├── frontend/              # React single-page application
│   ├── src/
│   │   ├── App.jsx        # App state engine, csv parsing & sending loop
│   │   ├── index.css      # Core styles & Cream Design System
│   │   └── main.jsx
│   ├── vite.config.js     # Dev proxy configuration
│   └── package.json
├── package.json           # Root orchestration package
└── README.md
```

---

## 📑 How to Run an Outreach Campaign

1. **Configure Account**: Enter your Gmail address and paste the 16-character **App Password**. Click **Verify** to validate the connection with Google's servers.
2. **Load Contacts**: Drop your `.xlsx`, `.xls`, or `.csv` contact spreadsheet. 
3. **Map Fields**: Select which sheet columns correspond to **Email**, **Name**, **Company**, and **Role**.
4. **Attach Resume (Optional)**: Drop your PDF or Word document in the resume section.
5. **Craft Your Template**: Type your subject line and write your email using the formatting toolbar. Use the clickable tag chips (`<name>`, `<company>`, `<role>`) to insert dynamic variables.
6. **Preview & Adjust**: Review the dynamic rendering in the live **Preview** section.
7. **Set Delay & Dispatch**: Choose a healthy dispatch delay (recommended: `15s` or higher) and hit **▶ Send Emails**. Keep the tab open while the campaign progresses!
