# SmartSpend — Modern Expense Tracker & Budget Manager

**SmartSpend** is a modern, responsive personal finance and expense management web application designed for students, freelancers, and individuals. It empowers users to track income and expenses, set monthly spending caps, visualize financial trends with dynamic charts, and manage their personal budget.

Built with clean semantic HTML5, modern CSS3, and vanilla ES6+ JavaScript, SmartSpend features an emerald-accented fintech dashboard inspired by contemporary personal finance platforms such as Monarch, Copilot, and Splitwise.

---

## 🌟 Key Features

### 1. Fintech Executive Dashboard
- **Four Core KPI Cards**:
  - **Total Income**: Sum of all earnings recorded in the selected calendar month.
  - **Total Expenses**: Sum of all expenses incurred in the selected calendar month.
  - **Current Balance**: Cumulative balance accounting for opening balance + total lifetime income − total lifetime expenses.
  - **Net Savings**: Net savings for the active period (Income − Expenses) with an automated Savings Rate percentage metric.
- **Dynamic Month Selector**: Jump between any calendar month or return to the current month in one click. All summaries, charts, and budget limits update in real-time.
- **Monthly Budget Indicator**: Visual progress bar tracking spending utilization against your custom budget limit:
  - 🟢 **Safe (< 80%)**: Clean green progress meter.
  - 🟡 **Warning (≥ 80%)**: Amber alert banner warning the user of impending budget exhaustion.
  - 🔴 **Over-Budget (> 100%)**: Crimson priority alert with calculated overage amount and advice to pause discretionary spend.
- **Daily Spending Limit Calculator**: Automatically calculates how much you can safely spend per day based on remaining days in the month and unspent budget.

### 2. Full Transaction Management (CRUD)
- **Add Transactions**: Modal-based form with real-time field validation.
- **Dynamic Category Selection**: Category options automatically switch based on whether "Income" or "Expense" is selected:
  - *Income Categories*: Salary, Part-time Work, Scholarship, Allowance, Freelance, Other Income.
  - *Expense Categories*: Food, Transport, Education, Shopping, Bills, Health, Entertainment, Subscriptions, Other.
- **Edit Records**: Update amounts, dates, categories, descriptions, or notes at any time.
- **Confirmation-Protected Deletion**: Safe deletion modal preventing accidental data loss.
- **Strict Input Validation**: Rejects zero, negative, empty, or non-numeric amounts, missing descriptions, and missing dates.

### 3. Interactive Visualizations (Chart.js)
- **Income vs. Expenses**: Comparison bar chart comparing cash inflows and outflows for the selected month.
- **Category-wise Expense Breakdown**: Interactive doughnut chart displaying category distributions with percentage tooltips.
- **6-Month Cashflow Trend (Analytics View)**: Historical bar chart illustrating monthly earnings versus burn rates over the previous six months.
- **Safe Chart Lifecycle Management**: Prevents canvas duplication and memory leaks by destroying previous chart instances prior to rendering new datasets.

### 4. Advanced Search, Filter & Sort
- **Multi-criteria Filtering**:
  - Instant text search across descriptions, merchant names, categories, and notes.
  - Filter by transaction type (`All`, `Income Only`, `Expenses Only`).
  - Filter by category (dynamically populated based on active type).
  - Sort by `Newest First`, `Oldest First`, `Amount: High to Low`, and `Amount: Low to High`.
- **Non-Destructive Processing**: Search and filters operate on filtered views without altering original storage arrays.
- **Clear Filters Button**: Quick action to restore default list view.

### 5. Dedicated Views & Navigation
- 📊 **Dashboard**: Real-time snapshot of current month cashflow, budget health, charts, and recent activity.
- 💳 **Transactions**: Complete transaction directory with filter toolbar, export capabilities, and tabular overview.
- 📈 **Analytics**: In-depth breakdown including savings rate discipline, highest spending categories, and historical trends.
- 🎯 **Budget & Goals**: Dedicated budget management tool with custom spending caps and health pace meters.
- ⚙️ **Settings & Preferences**: Currency customization (₹ INR, $ USD, € EUR, £ GBP), profile management, theme toggle, and JSON/CSV backup utilities.

### 6. Authentication & User Isolation
- **Dedicated Auth Pages**: Clean, responsive `login.html`, `register.html`, and `reset-password.html` pages.
- **Supabase Cloud Authentication**: Secure email and password sign-in backed by Supabase Auth v2.
- **Strict Tenant Isolation**: All transactions, budgets, and settings are scoped to each authenticated user ID (`user_id = auth.uid()`).
- **One-Click Demo Sandbox**: Evaluate the application instantly in local sandbox mode without requiring cloud sign-up.

### 7. Data Import, Export & Seeding
- **One-Click Sample Data**: Pre-loaded with realistic student, freelance, and utility transactions for demo and evaluation purposes.
- **Export to CSV**: Download spreadsheet files formatted with `ID, Type, Description, Amount, Category, Date, Notes`.
- **JSON Backup & Restore**: Export full database state or restore backups from local files.
- **Wipe All Data**: Confirmation-guarded option to reset user storage.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Structure** | HTML5 | Accessible, semantic document outline with native `<dialog>` modals |
| **Styling** | Vanilla CSS3 | Custom fintech design system, responsive flexbox/grid, CSS custom properties |
| **Logic** | Vanilla JavaScript (ES6+) | Single-source-of-truth state, modular `StorageService`, DOM manipulation |
| **Database & Auth** | Supabase (PostgreSQL + Auth v2) | Cloud database persistence, Row Level Security (RLS), JWT user sessions |
| **Charts** | Chart.js 4.4.2 (CDN) | Responsive, high-performance canvas financial visualizations |
| **Icons** | Font Awesome 6.5.1 (CDN) | Clean fintech iconography |
| **Typography** | Google Fonts (Plus Jakarta Sans) | Modern, legible fintech typography |

---

## 📂 Project Structure

```text
Smartspend/
├── index.html                  # Core application dashboard, views, settings, and native dialogs
├── login.html                  # Dedicated authentication page (Supabase Auth sign-in)
├── register.html               # Dedicated registration page (Supabase Auth sign-up)
├── reset-password.html         # Dedicated password recovery & update page
├── auth-helper.js              # Shared authentication controller & session management
├── style.css                   # Design system tokens, auth page styles, animations
├── script.js                   # Application state, SupabaseManager, SupabaseDataService, CRUD & Charts
├── supabase-schema.sql         # Base PostgreSQL schema with RLS policies and triggers
├── supabase-migration-fix.sql  # Safe idempotent migration fix & user backfill script
├── .gitignore                  # Git exclusion rules for secrets, OS, and editor files
├── .env.example                # Template showing required public configuration
├── README.md                   # Documentation, setup guide, and evaluation report
└── tests/
    └── test-smartspend.js      # Automated 22-scenario unit test suite
```

---

## 🚀 Getting Started & Local Setup

### Prerequisites
- Any modern web browser (Google Chrome, Mozilla Firefox, Microsoft Edge, Safari).
- Python 3.x, Node.js, or VS Code Live Server (to serve files over HTTP).

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/smartspend.git
cd smartspend
```

### 2. Start a Local Web Server
Because the app uses browser ES6 features, Font Awesome CDN, and Supabase client SDKs, serve it via a local HTTP server:

**Using Python:**
```bash
python -m http.server 8080
```

**Using Node.js (`npx`):**
```bash
npx serve -l 8080
```

**Using VS Code:**
Right-click `login.html` or `index.html` and select **"Open with Live Server"**.

### 3. Open in Browser
Visit `http://localhost:8080/login.html` in your browser.

---

## ☁️ Supabase Cloud Database Configuration

SmartSpend connects directly to Supabase with zero backend server code required. Security is enforced directly at the database level via PostgreSQL **Row Level Security (RLS)**.

### Step 1: Create a Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and create a free account.
2. Click **New Project** and name it (e.g., `smartspend`).
3. Choose a strong database password and select your region.

### Step 2: Run Database Migration Script
1. In the Supabase Dashboard, click **SQL Editor** on the left menu (the `>_` icon).
2. Click **New query**.
3. Copy and paste the entire contents of [`supabase-migration-fix.sql`](supabase-migration-fix.sql).
4. Click **Run**.
   - This sets up `profiles`, `transactions`, and `budgets` tables.
   - It enables **Row Level Security (RLS)** so each user can only read and write their own data (`auth.uid() = user_id`).
   - It adds automated triggers to create user profiles upon signup.

### Step 3: Configure Authentication Settings (Recommended for Dev & Demos)
To allow instant account registration without waiting for external email verification:
1. In the Supabase Dashboard, click **Authentication** ➔ **Providers**.
2. Click on the **Email** provider row.
3. Toggle **"Confirm email"** to **OFF**.
4. Click **Save**.

### Step 4: Connect SmartSpend to Your Project
1. Open SmartSpend at `http://localhost:8080/login.html`.
2. Expand the **Supabase Project Settings** drawer at the bottom of the card.
3. Enter:
   - **Project URL:** e.g., `https://xyzcompany.supabase.co`
   - **Public Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI...` (from Supabase Dashboard ➔ Project Settings ➔ API).
4. Click **Save & Connect**.
5. Register a new user on `register.html` or log in on `login.html`.

---

## 🔐 Security & Private Credentials Guide

| Credential Type | Where It Belongs | Included in GitHub? |
|---|---|:---:|
| **Supabase Project URL** | In-app settings drawer or `.env` | ✅ Safe to share |
| **Supabase Anon / Public Key** | In-app settings drawer or `.env` | ✅ Safe for frontend (Protected by RLS) |
| **Supabase Service-Role Key** | **NEVER USE IN FRONTEND** | ❌ **PROHIBITED on GitHub** |
| **PostgreSQL Database Password** | Only in your private Supabase Dashboard | ❌ **PROHIBITED on GitHub** |
| **Personal `.env` file** | Local environment only | ❌ Excluded by `.gitignore` |

> ⚠️ **IMPORTANT NOTE ON ROW LEVEL SECURITY:**
> The Supabase `anon` key is designed to be public. It grants only the permissions explicitly permitted by your PostgreSQL Row Level Security policies. As long as RLS is enabled on all tables (as configured in `supabase-migration-fix.sql`), users cannot read or write data belonging to anyone else.

---

## 🧪 Automated Testing

SmartSpend includes an automated Node.js test suite validating all core accounting, validation, and storage logic:

```bash
node tests/test-smartspend.js
```

### Verified Test Cases (22/22 Passing):
- Initial app state and sample transaction seeding.
- Income, expense, net savings, and balance calculation formulas.
- Transaction creation, update, and confirmation-guarded deletion.
- Month-scoped aggregation (excluding out-of-month records).
- Non-destructive searching, category filtering, and type filtering.
- Budget threshold calculations (Safe, Warning ≥80%, Over-Budget >100%).
- Currency formatting according to Indian Rupee (`₹`) conventions.
- Namespace isolation between separate user IDs in storage.
- Schema compliance with Supabase PostgreSQL tables.

---

## ⚠️ Known Limitations

1. **Client-Side SPA Architecture**: SmartSpend is a client-side Single Page Application (SPA). Credentials and active session tokens are stored in browser `localStorage`. Logging in from a shared public computer requires clicking "Sign Out" to clear active sessions.
2. **Supabase Inactivity Pauses (Free Tier)**: Free-tier Supabase projects automatically pause after 7 consecutive days of inactivity. If paused, re-activate the project in the Supabase Dashboard.
3. **Email Rate Limits**: When using Supabase's default email service (without a custom SMTP provider like SendGrid or Resend), email confirmations are rate-limited to 3-4 emails per hour. Disabling "Confirm email" in the Supabase Dashboard avoids this limitation during evaluation.
4. **Offline Sync Queue**: Transactions added while entirely offline are held in local sandbox storage; automatic background bi-directional sync triggers upon reconnecting to Supabase Cloud mode.

---

## 📄 License & Attribution

- **Project:** SmartSpend — Modern Personal Finance Manager
- **License:** MIT License — free for educational, evaluation, and personal use.
