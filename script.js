/**
 * ===================================================================
 * SMARTSPEND — MODERN EXPENSE TRACKER & BUDGET MANAGER
 * Complete Client-side Application Logic & Fintech Core
 * ===================================================================
 */

'use strict';

// -------------------------------------------------------------------
// 1. CONSTANTS & CATEGORY CONFIGURATIONS
// -------------------------------------------------------------------

const INCOME_CATEGORIES = [
  'Salary',
  'Part-time Work',
  'Scholarship',
  'Allowance',
  'Freelance',
  'Other Income'
];

const EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Education',
  'Shopping',
  'Bills',
  'Health',
  'Entertainment',
  'Subscriptions',
  'Other'
];

const CATEGORY_ICONS = {
  // Income
  'Salary': 'fa-building-columns',
  'Part-time Work': 'fa-briefcase',
  'Scholarship': 'fa-graduation-cap',
  'Allowance': 'fa-hand-holding-dollar',
  'Freelance': 'fa-laptop-code',
  'Other Income': 'fa-money-bill-wave',
  // Expense
  'Food': 'fa-utensils',
  'Transport': 'fa-bus',
  'Education': 'fa-book-open',
  'Shopping': 'fa-bag-shopping',
  'Bills': 'fa-file-invoice-dollar',
  'Health': 'fa-notes-medical',
  'Entertainment': 'fa-gamepad',
  'Subscriptions': 'fa-tv',
  'Other': 'fa-tag'
};

const CATEGORY_COLORS = {
  'Food': '#f97316',
  'Transport': '#10b981',
  'Education': '#3b82f6',
  'Shopping': '#ec4899',
  'Bills': '#eab308',
  'Health': '#06b6d4',
  'Entertainment': '#8b5cf6',
  'Subscriptions': '#6366f1',
  'Other': '#64748b',
  // Income
  'Salary': '#059669',
  'Part-time Work': '#10b981',
  'Scholarship': '#34d399',
  'Allowance': '#6ee7b7',
  'Freelance': '#047857',
  'Other Income': '#2dd4bf'
};

// -------------------------------------------------------------------
// 2. SUPABASE CLIENT MANAGER & CLOUD DATA SERVICE
// -------------------------------------------------------------------

const SupabaseManager = {
  client: null,
  config: {
    url: '',
    anonKey: '',
    enabled: false
  },

  loadConfig() {
    try {
      const stored = localStorage.getItem('smartspend_supabase_config');
      if (stored) {
        this.config = { ...this.config, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Failed reading Supabase config', e);
    }
    return this.config;
  },

  saveConfig(url, anonKey, enabled) {
    this.config = {
      url: (url || '').trim(),
      anonKey: (anonKey || '').trim(),
      enabled: Boolean(enabled)
    };
    try {
      localStorage.setItem('smartspend_supabase_config', JSON.stringify(this.config));
    } catch (e) {}
    this.initClient();
    return this.config;
  },

  initClient() {
    this.loadConfig();
    if (this.config.enabled && this.config.url && this.config.anonKey) {
      if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
        try {
          this.client = window.supabase.createClient(this.config.url, this.config.anonKey);
          console.log('Supabase client initialized successfully.');
          return this.client;
        } catch (e) {
          console.error('Error creating Supabase client:', e);
          this.client = null;
        }
      }
    } else {
      this.client = null;
    }
    return null;
  },

  isCloudActive() {
    return Boolean(this.client && this.config.enabled);
  },

  async testConnection(url, anonKey) {
    if (!url || !anonKey) {
      return { success: false, message: 'Please provide both Project URL and public anon key.' };
    }
    if (typeof window === 'undefined' || !window.supabase) {
      return { success: false, message: 'Supabase JS library is not loaded in this environment.' };
    }
    try {
      const tempClient = window.supabase.createClient(url.trim(), anonKey.trim());
      const { error } = await tempClient
        .from('profiles')
        .select('id', { count: 'exact', head: true });
      if (error && error.code !== 'PGRST116') {
        if (error.message && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Invalid API key') || error.message.includes('apikey'))) {
          return { success: false, message: `Connection failed: ${error.message}` };
        }
      }
      return { success: true, message: 'Supabase connection verified successfully!' };
    } catch (err) {
      return { success: false, message: `Connection error: ${err.message || 'Unable to reach Supabase project'}` };
    }
  }
};

const SupabaseDataService = {
  getClient() {
    return SupabaseManager.client;
  },

  async ensureProfile(userId) {
    const client = this.getClient();
    if (!client || !userId) return null;
    try {
      const { data: profile } = await client.from('profiles').select('id').eq('id', userId).maybeSingle();
      if (!profile) {
        let fullName = 'SmartSpend User';
        let email = null;
        try {
          const { data } = await client.auth.getUser();
          if (data && data.user) {
            fullName = data.user.user_metadata?.full_name || (data.user.email ? data.user.email.split('@')[0] : 'SmartSpend User');
            email = data.user.email || null;
          }
        } catch (e) {}

        await client.from('profiles').upsert({
          id: userId,
          full_name: fullName,
          email: email,
          currency: 'INR',
          theme: 'light',
          opening_balance: 0
        }, { onConflict: 'id' });
      }
    } catch (e) {
      console.warn('ensureProfile exception:', e);
    }
  },

  async fetchTransactions(userId) {
    const client = this.getClient();
    if (!client || !userId) return [];
    try {
      const { data, error } = await client
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });
      if (error) {
        console.error('Error fetching transactions from Supabase:', error);
        return null;
      }
      return data || [];
    } catch (e) {
      console.error('Exception fetching transactions:', e);
      return null;
    }
  },

  async insertTransaction(tx, userId) {
    const client = this.getClient();
    if (!client) {
      return { success: false, error: new Error('Supabase client is not initialized') };
    }

    let effectiveUserId = userId;
    try {
      const { data: { user } } = await client.auth.getUser();
      if (user && user.id) {
        effectiveUserId = user.id;
      }
    } catch (e) {}

    if (!effectiveUserId) {
      return { success: false, error: new Error('No authenticated user session found') };
    }

    // Ensure the profiles record exists so foreign keys are always satisfied
    await this.ensureProfile(effectiveUserId);

    try {
      const payload = {
        user_id: effectiveUserId,
        type: tx.type,
        amount: Number(tx.amount),
        description: (tx.description || '').trim(),
        category: tx.category,
        date: tx.date,
        notes: tx.notes ? tx.notes.trim() : null
      };

      const { data, error } = await client
        .from('transactions')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error('Error inserting transaction in Supabase:', error);
        return { success: false, error };
      }
      return { success: true, data };
    } catch (e) {
      console.error('Exception inserting transaction:', e);
      return { success: false, error: e };
    }
  },

  async updateTransaction(tx, userId) {
    const client = this.getClient();
    if (!client) {
      return { success: false, error: new Error('Supabase client is not initialized') };
    }

    let effectiveUserId = userId;
    try {
      const { data: { user } } = await client.auth.getUser();
      if (user && user.id) effectiveUserId = user.id;
    } catch (e) {}

    try {
      const payload = {
        type: tx.type,
        amount: Number(tx.amount),
        description: (tx.description || '').trim(),
        category: tx.category,
        date: tx.date,
        notes: tx.notes ? tx.notes.trim() : null
      };

      const { data, error } = await client
        .from('transactions')
        .update(payload)
        .eq('id', tx.id)
        .eq('user_id', effectiveUserId)
        .select()
        .single();

      if (error) {
        console.error('Error updating transaction in Supabase:', error);
        return { success: false, error };
      }
      return { success: true, data };
    } catch (e) {
      console.error('Exception updating transaction:', e);
      return { success: false, error: e };
    }
  },

  async deleteTransaction(txId, userId) {
    const client = this.getClient();
    if (!client || !txId) {
      return { success: false, error: new Error('Missing transaction identifier') };
    }

    let effectiveUserId = userId;
    try {
      const { data: { user } } = await client.auth.getUser();
      if (user && user.id) effectiveUserId = user.id;
    } catch (e) {}

    try {
      let query = client.from('transactions').delete().eq('id', txId);
      if (effectiveUserId) {
        query = query.eq('user_id', effectiveUserId);
      }
      const { error } = await query;
      if (error) {
        console.error('Error deleting transaction in Supabase:', error);
        return { success: false, error };
      }
      return { success: true };
    } catch (e) {
      console.error('Exception deleting transaction:', e);
      return { success: false, error: e };
    }
  },

  async fetchBudgets(userId) {
    const client = this.getClient();
    if (!client || !userId) return {};
    try {
      const { data, error } = await client
        .from('budgets')
        .select('month, amount')
        .eq('user_id', userId);
      if (error) {
        console.error('Error fetching budgets from Supabase:', error);
        return {};
      }
      const map = {};
      (data || []).forEach(b => {
        map[b.month] = Number(b.amount);
      });
      return map;
    } catch (e) {
      return {};
    }
  },

  async saveBudget(userId, month, amount) {
    const client = this.getClient();
    if (!client || !userId) return false;
    try {
      await this.ensureProfile(userId);
      const { error } = await client.from('budgets').upsert({
        user_id: userId,
        month: month,
        amount: Number(amount)
      }, { onConflict: 'user_id,month' });
      if (error) {
        console.error('Error saving budget to Supabase:', error);
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  async fetchProfile(userId) {
    const client = this.getClient();
    if (!client || !userId) return null;
    try {
      const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) {
        console.error('Error fetching profile from Supabase:', error);
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  },

  async updateProfile(userId, profileData) {
    const client = this.getClient();
    if (!client || !userId) return false;
    try {
      const { error } = await client.from('profiles').upsert({
        id: userId,
        ...profileData
      }, { onConflict: 'id' });
      if (error) {
        console.error('Error updating profile in Supabase:', error);
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  async resetUserData(userId) {
    const client = this.getClient();
    if (!client || !userId) return false;
    try {
      const { error: txErr } = await client.from('transactions').delete().eq('user_id', userId);
      const { error: bgtErr } = await client.from('budgets').delete().eq('user_id', userId);
      if (txErr || bgtErr) {
        console.error('Error resetting user data:', txErr || bgtErr);
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  async uploadLocalData(userId, transactions, budgets) {
    const client = this.getClient();
    if (!client || !userId) return { count: 0, failed: 0 };
    await this.ensureProfile(userId);
    let txCount = 0;
    let failedCount = 0;
    if (transactions && transactions.length > 0) {
      const payloads = transactions.map(t => ({
        user_id: userId,
        type: t.type,
        amount: Number(t.amount),
        description: (t.description || '').trim(),
        category: t.category,
        date: t.date,
        notes: t.notes ? t.notes.trim() : null
      }));
      const { data, error } = await client.from('transactions').insert(payloads).select();
      if (!error && data) {
        txCount = data.length;
      } else {
        console.error('Bulk upload error:', error);
        failedCount = payloads.length;
      }
    }
    if (budgets && Object.keys(budgets).length > 0) {
      const budgetRows = Object.entries(budgets).map(([m, amt]) => ({
        user_id: userId,
        month: m,
        amount: Number(amt)
      }));
      await client.from('budgets').upsert(budgetRows, { onConflict: 'user_id,month' });
    }
    return { count: txCount, failed: failedCount };
  }
};

// -------------------------------------------------------------------
// 3. STORAGE SERVICE (MODULAR ADAPTER PATTERN)
// -------------------------------------------------------------------

const StorageService = {
  getStorageKey(key) {
    const userId = AppState.currentUser ? AppState.currentUser.id : 'demo_user';
    return `smartspend_${userId}_${key}`;
  },

  getTransactions() {
    try {
      const data = localStorage.getItem(this.getStorageKey('transactions'));
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Failed to parse transactions from localStorage', e);
      return null;
    }
  },

  saveTransactions(transactions) {
    try {
      localStorage.setItem(this.getStorageKey('transactions'), JSON.stringify(transactions));
      return true;
    } catch (e) {
      console.error('Failed to save transactions to localStorage', e);
      return false;
    }
  },

  getMonthlyBudgets() {
    try {
      const data = localStorage.getItem(this.getStorageKey('budgets'));
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  saveMonthlyBudgets(budgets) {
    try {
      localStorage.setItem(this.getStorageKey('budgets'), JSON.stringify(budgets));
      return true;
    } catch (e) {
      return false;
    }
  },

  getOpeningBalance() {
    try {
      const val = localStorage.getItem(this.getStorageKey('opening_balance'));
      return val !== null ? parseFloat(val) : 0;
    } catch (e) {
      return 0;
    }
  },

  saveOpeningBalance(balance) {
    try {
      localStorage.setItem(this.getStorageKey('opening_balance'), balance.toString());
      return true;
    } catch (e) {
      return false;
    }
  },

  getPreferences() {
    try {
      const data = localStorage.getItem(this.getStorageKey('preferences'));
      return data ? JSON.parse(data) : { currency: 'INR', theme: 'light' };
    } catch (e) {
      return { currency: 'INR', theme: 'light' };
    }
  },

  savePreferences(prefs) {
    try {
      localStorage.setItem(this.getStorageKey('preferences'), JSON.stringify(prefs));
      return true;
    } catch (e) {
      return false;
    }
  },

  clearUserData() {
    try {
      const userId = AppState.currentUser ? AppState.currentUser.id : 'demo_user';
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(`smartspend_${userId}_`)) {
          localStorage.removeItem(key);
        }
      });
      return true;
    } catch (e) {
      console.error('Failed to clear user data', e);
      return false;
    }
  }
};

// -------------------------------------------------------------------
// 3. AUTH SERVICE (DEMO SANDBOX & SESSION MANAGEMENT)
// -------------------------------------------------------------------

const AuthService = {
  CURRENT_USER_KEY: 'smartspend_session_user',
  USERS_STORE_KEY: 'smartspend_registered_users',

  getCurrentUser() {
    try {
      const stored = localStorage.getItem(this.CURRENT_USER_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Error reading session user', e);
    }
    // Default Demo User
    return {
      id: 'demo_user',
      name: 'Demo Student',
      email: 'student@smartspend.app',
      isDemo: true
    };
  },

  setCurrentUser(user) {
    try {
      localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.warn('Error storing session user', e);
    }
  },

  getRegisteredUsers() {
    try {
      const data = localStorage.getItem(this.USERS_STORE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  async login(email, password) {
    // If Supabase Cloud mode is active, use live Supabase Auth
    if (SupabaseManager.isCloudActive()) {
      try {
        const { data, error } = await SupabaseManager.client.auth.signInWithPassword({
          email: email.trim(),
          password: password
        });
        if (error) {
          return { success: false, message: error.message };
        }
        if (data && data.user) {
          const profile = await SupabaseDataService.fetchProfile(data.user.id);
          const fullName = (profile && profile.full_name) || data.user.user_metadata?.full_name || email.split('@')[0];
          const userObj = {
            id: data.user.id,
            name: fullName,
            email: data.user.email,
            isDemo: false,
            isCloud: true
          };
          this.setCurrentUser(userObj);
          return { success: true, user: userObj };
        }
      } catch (err) {
        return { success: false, message: err.message || 'Supabase authentication failed' };
      }
    }

    // Check Demo credentials (Local Sandbox)
    if (email.toLowerCase() === 'student@smartspend.app' || email.toLowerCase() === 'demo@smartspend.app') {
      const demoUser = {
        id: 'demo_user',
        name: 'Demo Student',
        email: email,
        isDemo: true,
        isCloud: false
      };
      this.setCurrentUser(demoUser);
      return { success: true, user: demoUser };
    }

    // Check registered profiles in local sandbox
    const users = this.getRegisteredUsers();
    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (found) {
      if (found.password === password) {
        const userObj = { id: found.id, name: found.name, email: found.email, isDemo: false, isCloud: false };
        this.setCurrentUser(userObj);
        return { success: true, user: userObj };
      }
      return { success: false, message: 'Invalid password. Please try again.' };
    }

    // Auto-create local sandbox profile for any new user
    const newUser = {
      id: 'user_' + Date.now(),
      name: email.split('@')[0],
      email: email,
      password: password,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    localStorage.setItem(this.USERS_STORE_KEY, JSON.stringify(users));
    const sessionUser = { id: newUser.id, name: newUser.name, email: newUser.email, isDemo: false, isCloud: false };
    this.setCurrentUser(sessionUser);
    return { success: true, user: sessionUser };
  },

  async register(name, email, password) {
    // If Supabase Cloud mode is active, use live Supabase Auth
    if (SupabaseManager.isCloudActive()) {
      try {
        const { data, error } = await SupabaseManager.client.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: { full_name: name.trim() }
          }
        });
        if (error) {
          return { success: false, message: error.message };
        }
        if (data && data.user) {
          const userObj = {
            id: data.user.id,
            name: name.trim(),
            email: data.user.email,
            isDemo: false,
            isCloud: true
          };
          this.setCurrentUser(userObj);
          return { success: true, user: userObj, session: data.session };
        }
      } catch (err) {
        return { success: false, message: err.message || 'Supabase registration failed' };
      }
    }

    // Local Sandbox Registration
    const users = this.getRegisteredUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, message: 'An account with this email already exists locally.' };
    }
    const newUser = {
      id: 'user_' + Date.now(),
      name: name.trim(),
      email: email.trim(),
      password: password,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    localStorage.setItem(this.USERS_STORE_KEY, JSON.stringify(users));
    const sessionUser = { id: newUser.id, name: newUser.name, email: newUser.email, isDemo: false, isCloud: false };
    this.setCurrentUser(sessionUser);
    return { success: true, user: sessionUser };
  },

  async logout() {
    if (SupabaseManager.isCloudActive()) {
      try {
        await SupabaseManager.client.auth.signOut();
      } catch (e) {}
    }
    const demoUser = {
      id: 'demo_user',
      name: 'Demo Student',
      email: 'student@smartspend.app',
      isDemo: true,
      isCloud: false
    };
    this.setCurrentUser(demoUser);
    return demoUser;
  }
};

// -------------------------------------------------------------------
// 4. APPLICATION STATE (SINGLE SOURCE OF TRUTH)
// -------------------------------------------------------------------

const AppState = {
  currentUser: null,
  transactions: [],
  selectedMonth: '', // Format: 'YYYY-MM'
  budgets: {},       // Format: { 'YYYY-MM': number }
  defaultBudget: 25000,
  openingBalance: 0,
  preferences: {
    currency: 'INR',
    theme: 'light'
  },
  currentView: 'dashboard',
  filters: {
    search: '',
    type: 'all',
    category: 'all',
    sort: 'date-desc'
  },
  editingTransactionId: null,
  pendingDeleteId: null
};

// Chart instances tracker (prevents canvas memory leaks and duplicate overlays)
const ChartManager = {
  cashflowChart: null,
  categoryChart: null,
  trendChart: null,

  destroyAll() {
    if (this.cashflowChart) {
      this.cashflowChart.destroy();
      this.cashflowChart = null;
    }
    if (this.categoryChart) {
      this.categoryChart.destroy();
      this.categoryChart = null;
    }
    if (this.trendChart) {
      this.trendChart.destroy();
      this.trendChart = null;
    }
  }
};

// -------------------------------------------------------------------
// 5. SAMPLE DATASET GENERATOR (REALISTIC FINTECH DATA)
// -------------------------------------------------------------------

function generateSampleTransactions() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12
  
  const pad = (n) => (n < 10 ? '0' + n : n);
  const currYm = `${currentYear}-${pad(currentMonth)}`;
  
  // Previous month string
  const prevDate = new Date(today);
  prevDate.setMonth(today.getMonth() - 1);
  const prevYm = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`;

  // Month before previous
  const prev2Date = new Date(today);
  prev2Date.setMonth(today.getMonth() - 2);
  const prev2Ym = `${prev2Date.getFullYear()}-${pad(prev2Date.getMonth() + 1)}`;

  return [
    // Current Month Income
    {
      id: 'tx_s_01',
      type: 'income',
      description: 'Monthly Part-time Stipend',
      amount: 22000,
      category: 'Part-time Work',
      date: `${currYm}-01`,
      notes: 'Research Assistant Fellowship stipend'
    },
    {
      id: 'tx_s_02',
      type: 'income',
      description: 'Web Design Freelance Project',
      amount: 14500,
      category: 'Freelance',
      date: `${currYm}-05`,
      notes: 'Landing page development for local bookstore'
    },
    {
      id: 'tx_s_03',
      type: 'income',
      description: 'Monthly Family Allowance',
      amount: 6000,
      category: 'Allowance',
      date: `${currYm}-08`,
      notes: 'Monthly living allowance'
    },

    // Current Month Expenses
    {
      id: 'tx_s_04',
      type: 'expense',
      description: 'Campus Hostel & Electricity Bill',
      amount: 6500,
      category: 'Bills',
      date: `${currYm}-02`,
      notes: 'Electricity bill & hostel utility charges'
    },
    {
      id: 'tx_s_05',
      type: 'expense',
      description: 'Semester Textbooks & Stationery',
      amount: 2450,
      category: 'Education',
      date: `${currYm}-03`,
      notes: 'Algorithms & Database textbook bundle'
    },
    {
      id: 'tx_s_06',
      type: 'expense',
      description: 'Grocery & Canteen Essentials',
      amount: 3800,
      category: 'Food',
      date: `${currYm}-04`,
      notes: 'Weekly grocery basket from DMart'
    },
    {
      id: 'tx_s_07',
      type: 'expense',
      description: 'Monthly Metro Pass & Auto Rides',
      amount: 1400,
      category: 'Transport',
      date: `${currYm}-06`,
      notes: 'Metro smart card recharge'
    },
    {
      id: 'tx_s_08',
      type: 'expense',
      description: 'Weekend Dining with Project Team',
      amount: 1850,
      category: 'Food',
      date: `${currYm}-07`,
      notes: 'Dinner at Punjabi Rasoi'
    },
    {
      id: 'tx_s_09',
      type: 'expense',
      description: 'Cloud Server & GitHub Copilot',
      amount: 1250,
      category: 'Subscriptions',
      date: `${currYm}-08`,
      notes: 'Developer tools subscription'
    },
    {
      id: 'tx_s_10',
      type: 'expense',
      description: 'Prescription Eyewear & Vitamins',
      amount: 1600,
      category: 'Health',
      date: `${currYm}-09`,
      notes: 'Eye drop prescription & multivitamin'
    },
    {
      id: 'tx_s_11',
      type: 'expense',
      description: 'New Noise-Canceling Earbuds',
      amount: 2999,
      category: 'Shopping',
      date: `${currYm}-09`,
      notes: 'Amazon Great Indian Sale offer'
    },

    // Previous Month (for trend charts)
    {
      id: 'tx_s_12',
      type: 'income',
      description: 'Monthly Part-time Stipend',
      amount: 22000,
      category: 'Part-time Work',
      date: `${prevYm}-01`,
      notes: 'Prior month stipend'
    },
    {
      id: 'tx_s_13',
      type: 'income',
      description: 'Merit Scholarship Prize',
      amount: 10000,
      category: 'Scholarship',
      date: `${prevYm}-15`,
      notes: 'College technical symposium merit prize'
    },
    {
      id: 'tx_s_14',
      type: 'expense',
      description: 'Laptop Repair & Service',
      amount: 4200,
      category: 'Education',
      date: `${prevYm}-05`,
      notes: 'SSD upgrade & servicing'
    },
    {
      id: 'tx_s_15',
      type: 'expense',
      description: 'Monthly Groceries',
      amount: 4500,
      category: 'Food',
      date: `${prevYm}-10`,
      notes: 'Provisions'
    },
    {
      id: 'tx_s_16',
      type: 'expense',
      description: 'Cinema & Concert Outing',
      amount: 1800,
      category: 'Entertainment',
      date: `${prevYm}-20`,
      notes: 'College fest movie night'
    },

    // Month -2
    {
      id: 'tx_s_17',
      type: 'income',
      description: 'Monthly Part-time Stipend',
      amount: 20000,
      category: 'Part-time Work',
      date: `${prev2Ym}-01`,
      notes: 'Previous stipend'
    },
    {
      id: 'tx_s_18',
      type: 'expense',
      description: 'Hostel Maintenance & Mess',
      amount: 8500,
      category: 'Bills',
      date: `${prev2Ym}-08`,
      notes: 'Mess bill'
    },
    {
      id: 'tx_s_19',
      type: 'expense',
      description: 'Study Table & Desk Lamp',
      amount: 2100,
      category: 'Shopping',
      date: `${prev2Ym}-18`,
      notes: 'Furniture purchase'
    }
  ];
}

// -------------------------------------------------------------------
// 6. FORMATTING HELPERS
// -------------------------------------------------------------------

function formatCurrency(amount) {
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  const currency = AppState.preferences.currency || 'INR';

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  } catch (e) {
    // Fallback if specific currency is not supported by locale
    const symbol = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : (currency === 'EUR' ? '€' : '£'));
    return `${symbol}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '-';
  try {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return dateStr;
  }
}

function formatMonthLabel(yearMonthStr) {
  if (!yearMonthStr) return '';
  const [year, month] = yearMonthStr.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function getCurrentYearMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// -------------------------------------------------------------------
// 7. TOAST NOTIFICATION SYSTEM
// -------------------------------------------------------------------

function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconClass = 'fa-solid fa-circle-check';
  if (type === 'error') iconClass = 'fa-solid fa-circle-exclamation';
  if (type === 'info') iconClass = 'fa-solid fa-circle-info';

  toast.innerHTML = `
    <i class="${iconClass} toast-icon"></i>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 200ms ease';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 220);
  }, duration);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -------------------------------------------------------------------
// 8. DATA INITIALIZATION & LIFECYCLE
// -------------------------------------------------------------------

const SmartSpendApp = {
  async init() {
    console.log('Initializing SmartSpend App...');

    // 1. Initialize Supabase manager
    SupabaseManager.initClient();

    // 2. Load preferences
    AppState.preferences = StorageService.getPreferences();
    this.applyPreferences();

    // 3. Set default active month to current calendar month
    AppState.selectedMonth = getCurrentYearMonth();
    const monthPicker = document.getElementById('monthPicker');
    if (monthPicker) {
      monthPicker.value = AppState.selectedMonth;
    }

    // 4. Setup event listeners
    this.bindEvents();

    // 5. Populate Supabase config form inputs
    const supabaseUrlInput = document.getElementById('supabaseUrlInput');
    const supabaseAnonKeyInput = document.getElementById('supabaseAnonKeyInput');
    if (supabaseUrlInput) supabaseUrlInput.value = SupabaseManager.config.url || '';
    if (supabaseAnonKeyInput) supabaseAnonKeyInput.value = SupabaseManager.config.anonKey || '';

    // 6. Check if cloud mode is active with an existing Supabase session
    if (SupabaseManager.isCloudActive()) {
      await this.initCloudSession();
    } else {
      // Local Sandbox mode
      AppState.currentUser = AuthService.getCurrentUser();
      let storedTx = StorageService.getTransactions();
      if (!storedTx) {
        console.log('No existing transactions found. Seeding realistic sample demo data...');
        storedTx = generateSampleTransactions();
        StorageService.saveTransactions(storedTx);
      }
      AppState.transactions = storedTx;
      AppState.budgets = StorageService.getMonthlyBudgets();
      AppState.openingBalance = StorageService.getOpeningBalance();
      if (!AppState.budgets[AppState.selectedMonth]) {
        AppState.budgets[AppState.selectedMonth] = AppState.defaultBudget;
        StorageService.saveMonthlyBudgets(AppState.budgets);
      }
      this.updateStorageModeUI();
      this.updateUserSessionUI();
    }

    // 7. Initial Render
    this.populateCategoryDropdowns();
    this.renderAll();
  },

  async initCloudSession() {
    this.updateStorageModeUI();
    if (SupabaseManager.isCloudActive()) {
      try {
        const { data: { session } } = await SupabaseManager.client.auth.getSession();
        if (session && session.user) {
          const profile = await SupabaseDataService.fetchProfile(session.user.id);
          const fullName = (profile && profile.full_name) || session.user.user_metadata?.full_name || session.user.email.split('@')[0];
          AppState.currentUser = {
            id: session.user.id,
            name: fullName,
            email: session.user.email,
            isDemo: false,
            isCloud: true
          };

          // Restore preferences persisted in Supabase profiles
          if (profile) {
            if (profile.currency) {
              AppState.preferences.currency = profile.currency;
            }
            if (profile.theme) {
              AppState.preferences.theme = profile.theme;
            }
            this.applyPreferences();
            StorageService.savePreferences(AppState.preferences);
          }

          // Fetch live transactions and budgets from Supabase strictly for this user
          const cloudTxs = await SupabaseDataService.fetchTransactions(session.user.id);
          AppState.transactions = cloudTxs || [];
          StorageService.saveTransactions(AppState.transactions);

          const cloudBudgets = await SupabaseDataService.fetchBudgets(session.user.id);
          AppState.budgets = cloudBudgets || {};
          StorageService.saveMonthlyBudgets(AppState.budgets);

          if (profile && profile.opening_balance !== undefined) {
            AppState.openingBalance = Number(profile.opening_balance);
            StorageService.saveOpeningBalance(AppState.openingBalance);
          }

          this.updateUserSessionUI();
          this.renderAll();
        } else {
          // Cloud mode is active but no active user session
          if (!AppState.currentUser || !AppState.currentUser.isDemo) {
            window.location.replace('login.html');
          }
        }
      } catch (e) {
        console.error('Error initializing cloud session:', e);
      }
    }
  },

  async switchToLocalMode() {
    SupabaseManager.saveConfig(SupabaseManager.config.url, SupabaseManager.config.anonKey, false);
    AppState.currentUser = AuthService.getCurrentUser();
    let stored = StorageService.getTransactions();
    if (!stored) {
      stored = generateSampleTransactions();
      StorageService.saveTransactions(stored);
    }
    AppState.transactions = stored;
    AppState.budgets = StorageService.getMonthlyBudgets();
    AppState.openingBalance = StorageService.getOpeningBalance();
    this.updateStorageModeUI();
    this.updateUserSessionUI();
    this.renderAll();
  },

  updateStorageModeUI() {
    const isCloud = SupabaseManager.isCloudActive();
    const syncBadge = document.getElementById('syncStatusBadge');
    const syncBadgeText = document.getElementById('syncBadgeText');
    const statusPill = document.getElementById('supabaseStatusPill');
    const disconnectBtn = document.getElementById('disconnectSupabaseBtn');
    const migrateBtn = document.getElementById('migrateLocalToCloudBtn');
    const modeLocalRadio = document.getElementById('modeLocalRadio');
    const modeSupabaseRadio = document.getElementById('modeSupabaseRadio');
    const authNoticeBox = document.getElementById('authNoticeBox');
    const authNoticeText = document.getElementById('authNoticeText');
    const loginSubmitText = document.getElementById('loginSubmitText');
    const regSubmitText = document.getElementById('regSubmitText');

    if (isCloud) {
      if (syncBadge) syncBadge.className = 'sync-badge cloud';
      if (syncBadgeText) syncBadgeText.textContent = 'Supabase Live';
      if (statusPill) {
        statusPill.className = 'status-badge-pill cloud';
        statusPill.innerHTML = '<i class="fa-solid fa-circle-check"></i> Connected to Supabase';
      }
      if (disconnectBtn) disconnectBtn.classList.remove('hidden');
      if (migrateBtn) migrateBtn.classList.remove('hidden');
      if (modeSupabaseRadio) modeSupabaseRadio.checked = true;

      if (authNoticeBox) authNoticeBox.className = 'auth-notice cloud';
      if (authNoticeText) {
        authNoticeText.innerHTML = '<strong>Supabase Live Cloud:</strong> Authenticating directly with your <code>smartspend</code> project via PostgreSQL Row Level Security (RLS).';
      }
      if (loginSubmitText) loginSubmitText.textContent = 'Sign In with Supabase';
      if (regSubmitText) regSubmitText.textContent = 'Create Supabase Account';
    } else {
      if (syncBadge) syncBadge.className = 'sync-badge local';
      if (syncBadgeText) syncBadgeText.textContent = 'Local Sandbox';
      if (statusPill) {
        statusPill.className = 'status-badge-pill local';
        statusPill.innerHTML = '<i class="fa-solid fa-hard-drive"></i> Local Sandbox Mode';
      }
      if (disconnectBtn) disconnectBtn.classList.add('hidden');
      if (migrateBtn) migrateBtn.classList.add('hidden');
      if (modeLocalRadio) modeLocalRadio.checked = true;

      if (authNoticeBox) authNoticeBox.className = 'auth-notice';
      if (authNoticeText) {
        authNoticeText.innerHTML = '<strong>Storage Engine:</strong> You are currently in <strong>Local Sandbox Mode</strong>. Connect Supabase in Settings to enable real cloud multi-device authentication and database persistence.';
      }
      if (loginSubmitText) loginSubmitText.textContent = 'Sign In to Account';
      if (regSubmitText) regSubmitText.textContent = 'Create Local Profile';
    }
  },

  updateUserSessionUI() {
    const user = AppState.currentUser;
    const nameEl = document.getElementById('sidebarUserName');
    const roleEl = document.getElementById('sidebarUserRole');
    const avatarEl = document.getElementById('sidebarUserAvatar');
    const authCurrentUserName = document.getElementById('authCurrentUserName');

    if (nameEl) nameEl.textContent = user.name || 'Demo User';
    if (roleEl) roleEl.textContent = user.isDemo ? 'Demo Mode (Local)' : 'Registered User';
    if (authCurrentUserName) authCurrentUserName.textContent = `${user.name} (${user.email})`;

    if (avatarEl) {
      const initials = (user.name || 'DS')
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      avatarEl.textContent = initials || 'SS';
    }

    // Sync settings form
    const profName = document.getElementById('profileNameInput');
    const profEmail = document.getElementById('profileEmailInput');
    if (profName) profName.value = user.name || '';
    if (profEmail) profEmail.value = user.email || '';
  },

  applyPreferences() {
    const { theme, currency } = AppState.preferences;
    
    // Theme toggle
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }

    // Currency selector
    const currSelect = document.getElementById('currencySelect');
    if (currSelect) currSelect.value = currency || 'INR';

    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = theme || 'light';

    const formCurrencyPrefix = document.getElementById('formCurrencyPrefix');
    if (formCurrencyPrefix) {
      formCurrencyPrefix.textContent = currency === 'USD' ? '$' : (currency === 'EUR' ? '€' : (currency === 'GBP' ? '£' : '₹'));
    }
  },

  bindEvents() {
    // Navigation items
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.getAttribute('data-view');
        if (view) this.switchView(view);
      });
    });

    // Mobile menu toggles
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebar = document.getElementById('sidebar');

    const toggleSidebar = (open) => {
      if (sidebar) sidebar.classList.toggle('open', open);
      if (sidebarOverlay) sidebarOverlay.classList.toggle('active', open);
    };

    if (mobileMenuToggle) {
      mobileMenuToggle.addEventListener('click', () => toggleSidebar(true));
    }
    if (sidebarCloseBtn) {
      sidebarCloseBtn.addEventListener('click', () => toggleSidebar(false));
    }
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
    }

    // Month Selector change
    const monthPicker = document.getElementById('monthPicker');
    if (monthPicker) {
      monthPicker.addEventListener('change', (e) => {
        if (e.target.value) {
          AppState.selectedMonth = e.target.value;
          this.renderAll();
        }
      });
    }

    const currentMonthBtn = document.getElementById('currentMonthBtn');
    if (currentMonthBtn) {
      currentMonthBtn.addEventListener('click', () => {
        const curr = getCurrentYearMonth();
        AppState.selectedMonth = curr;
        if (monthPicker) monthPicker.value = curr;
        this.renderAll();
      });
    }

    // Add buttons
    const sidebarAddBtn = document.getElementById('sidebarAddBtn');
    const topAddBtn = document.getElementById('topAddBtn');
    const mobileAddBtn = document.getElementById('mobileAddBtn');
    const mobileCenterAddBtn = document.getElementById('mobileCenterAddBtn');

    [sidebarAddBtn, topAddBtn, mobileAddBtn, mobileCenterAddBtn].forEach(btn => {
      if (btn) btn.addEventListener('click', () => this.openAddModal());
    });

    // View All transactions button from Dashboard
    const viewAllTxBtn = document.getElementById('viewAllTxBtn');
    if (viewAllTxBtn) {
      viewAllTxBtn.addEventListener('click', () => this.switchView('transactions'));
    }

    // Add/Edit Transaction Form Submission & Radio Switch
    const transactionForm = document.getElementById('transactionForm');
    if (transactionForm) {
      transactionForm.addEventListener('submit', (e) => this.handleTransactionFormSubmit(e));
    }

    const typeRadios = document.querySelectorAll('input[name="txType"]');
    typeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.populateCategorySelect(e.target.value);
      });
    });

    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const transactionModal = document.getElementById('transactionModal');
    [modalCloseBtn, modalCancelBtn].forEach(btn => {
      if (btn) btn.addEventListener('click', () => transactionModal.close());
    });

    // Delete Confirmation Modal
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const deleteConfirmModal = document.getElementById('deleteConfirmModal');
    if (cancelDeleteBtn) {
      cancelDeleteBtn.addEventListener('click', () => deleteConfirmModal.close());
    }
    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener('click', () => this.executeDeleteTransaction());
    }

    // Budget Quick Edit Button & Modal
    const quickEditBudgetBtn = document.getElementById('quickEditBudgetBtn');
    const budgetModal = document.getElementById('budgetModal');
    const budgetModalCloseBtn = document.getElementById('budgetModalCloseBtn');
    const budgetModalCancelBtn = document.getElementById('budgetModalCancelBtn');
    const quickBudgetForm = document.getElementById('quickBudgetForm');

    if (quickEditBudgetBtn) {
      quickEditBudgetBtn.addEventListener('click', () => {
        const currentLimit = this.getCurrentMonthBudget();
        const input = document.getElementById('quickBudgetInput');
        const monthLabel = document.getElementById('budgetModalMonthLabel');
        if (input) input.value = currentLimit;
        if (monthLabel) monthLabel.textContent = formatMonthLabel(AppState.selectedMonth);
        if (budgetModal) budgetModal.showModal();
      });
    }
    [budgetModalCloseBtn, budgetModalCancelBtn].forEach(btn => {
      if (btn) btn.addEventListener('click', () => budgetModal.close());
    });
    if (quickBudgetForm) {
      quickBudgetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('quickBudgetInput');
        const amount = parseFloat(input.value);
        if (isNaN(amount) || amount < 0) {
          showToast('Please enter a valid budget amount', 'error');
          return;
        }
        AppState.budgets[AppState.selectedMonth] = amount;
        StorageService.saveMonthlyBudgets(AppState.budgets);

        if (SupabaseManager.isCloudActive() && !AppState.currentUser?.isDemo) {
          await SupabaseDataService.saveBudget(AppState.currentUser.id, AppState.selectedMonth, amount);
        }

        budgetModal.close();
        this.renderAll();
        showToast(`Budget for ${formatMonthLabel(AppState.selectedMonth)} updated to ${formatCurrency(amount)}`);
      });
    }

    // Dedicated Budget Form in Budget View
    const budgetSettingForm = document.getElementById('budgetSettingForm');
    if (budgetSettingForm) {
      budgetSettingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const budgetInput = document.getElementById('monthlyBudgetInput');
        const openBalInput = document.getElementById('openingBalanceInput');
        const budgetVal = parseFloat(budgetInput.value);
        const openBalVal = parseFloat(openBalInput.value);

        if (isNaN(budgetVal) || budgetVal < 0) {
          showToast('Please enter a valid monthly budget limit', 'error');
          return;
        }

        AppState.budgets[AppState.selectedMonth] = budgetVal;
        StorageService.saveMonthlyBudgets(AppState.budgets);

        if (SupabaseManager.isCloudActive() && !AppState.currentUser?.isDemo) {
          await SupabaseDataService.saveBudget(AppState.currentUser.id, AppState.selectedMonth, budgetVal);
        }

        if (!isNaN(openBalVal)) {
          AppState.openingBalance = openBalVal;
          StorageService.saveOpeningBalance(openBalVal);
        }

        this.renderAll();
        showToast('Monthly budget & opening balance saved successfully!');
      });
    }

    // Filter Toolbar Interactions
    const txSearchInput = document.getElementById('txSearchInput');
    const txTypeFilter = document.getElementById('txTypeFilter');
    const txCategoryFilter = document.getElementById('txCategoryFilter');
    const txSortSelect = document.getElementById('txSortSelect');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    if (txSearchInput) {
      txSearchInput.addEventListener('input', (e) => {
        AppState.filters.search = e.target.value.toLowerCase().trim();
        this.renderTransactionsView();
      });
    }
    if (txTypeFilter) {
      txTypeFilter.addEventListener('change', (e) => {
        AppState.filters.type = e.target.value;
        this.populateFilterCategoryDropdown();
        this.renderTransactionsView();
      });
    }
    if (txCategoryFilter) {
      txCategoryFilter.addEventListener('change', (e) => {
        AppState.filters.category = e.target.value;
        this.renderTransactionsView();
      });
    }
    if (txSortSelect) {
      txSortSelect.addEventListener('change', (e) => {
        AppState.filters.sort = e.target.value;
        this.renderTransactionsView();
      });
    }
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => this.clearFilters());
    }

    // Settings Profile Form
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('profileNameInput').value.trim();
        const email = document.getElementById('profileEmailInput').value.trim();
        const currency = document.getElementById('currencySelect').value;
        const theme = document.getElementById('themeSelect').value;

        AppState.currentUser.name = name;
        AppState.currentUser.email = email;
        AuthService.setCurrentUser(AppState.currentUser);

        AppState.preferences.currency = currency;
        AppState.preferences.theme = theme;
        StorageService.savePreferences(AppState.preferences);

        if (SupabaseManager.isCloudActive() && !AppState.currentUser?.isDemo) {
          await SupabaseDataService.updateProfile(AppState.currentUser.id, {
            full_name: name,
            currency: currency
          });
        }

        this.applyPreferences();
        this.updateUserSessionUI();
        this.renderAll();
        showToast('Settings & preferences updated successfully');
      });
    }

    // CSV & JSON Data Management
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportCsvBtnSettings = document.getElementById('exportCsvBtnSettings');
    [exportCsvBtn, exportCsvBtnSettings].forEach(btn => {
      if (btn) btn.addEventListener('click', () => this.exportCsv());
    });

    const exportJsonBtn = document.getElementById('exportJsonBtn');
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', () => this.exportJson());
    }

    const importJsonInput = document.getElementById('importJsonInput');
    if (importJsonInput) {
      importJsonInput.addEventListener('change', (e) => this.importJson(e));
    }

    const loadSampleDataBtn = document.getElementById('loadSampleDataBtn');
    if (loadSampleDataBtn) {
      loadSampleDataBtn.addEventListener('click', () => this.loadSampleData());
    }

    const clearAllDataBtn = document.getElementById('clearAllDataBtn');
    const clearAllModal = document.getElementById('clearAllModal');
    const cancelClearAllBtn = document.getElementById('cancelClearAllBtn');
    const confirmClearAllBtn = document.getElementById('confirmClearAllBtn');

    if (clearAllDataBtn) {
      clearAllDataBtn.addEventListener('click', () => clearAllModal.showModal());
    }
    if (cancelClearAllBtn) {
      cancelClearAllBtn.addEventListener('click', () => clearAllModal.close());
    }
    if (confirmClearAllBtn) {
      confirmClearAllBtn.addEventListener('click', () => {
        this.resetAllData();
        clearAllModal.close();
      });
    }

    // Auth Modal & Session Controls
    const authBtn = document.getElementById('authBtn');
    const authModal = document.getElementById('authModal');
    const authModalCloseBtn = document.getElementById('authModalCloseBtn');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const oneClickDemoBtn = document.getElementById('oneClickDemoBtn');

    if (authBtn) {
      authBtn.addEventListener('click', () => {
        this.updateUserSessionUI();
        authModal.showModal();
      });
    }
    if (authModalCloseBtn) {
      authModalCloseBtn.addEventListener('click', () => authModal.close());
    }

    // Toggle login/register tabs
    if (tabLogin && tabRegister) {
      tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
      });
      tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
      });
    }

    // Password visibility toggles
    const toggleLoginPass = document.getElementById('toggleLoginPassword');
    if (toggleLoginPass) {
      toggleLoginPass.addEventListener('click', () => {
        const inp = document.getElementById('loginPassword');
        const isPass = inp.type === 'password';
        inp.type = isPass ? 'text' : 'password';
        toggleLoginPass.innerHTML = isPass ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
      });
    }

    const toggleRegPass = document.getElementById('toggleRegPassword');
    if (toggleRegPass) {
      toggleRegPass.addEventListener('click', () => {
        const inp = document.getElementById('regPassword');
        const isPass = inp.type === 'password';
        inp.type = isPass ? 'text' : 'password';
        toggleRegPass.innerHTML = isPass ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
      });
    }

    // Auth form submissions
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const submitBtn = document.getElementById('loginSubmitBtn');
        if (submitBtn) submitBtn.disabled = true;

        try {
          const res = await AuthService.login(email, password);
          if (res.success) {
            AppState.currentUser = res.user;
            if (res.user.isCloud) {
              await SmartSpendApp.initCloudSession();
            } else {
              this.onUserSwitched();
            }
            authModal.close();
            showToast(`Welcome back, ${res.user.name}!`);
          } else {
            showToast(res.message, 'error');
          }
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    if (oneClickDemoBtn) {
      oneClickDemoBtn.addEventListener('click', async () => {
        if (SupabaseManager.isCloudActive()) {
          // Switch to local mode for demo login
          await SmartSpendApp.switchToLocalMode();
        }
        const res = await AuthService.login('student@smartspend.app', 'demo1234');
        AppState.currentUser = res.user;
        this.onUserSwitched();
        authModal.close();
        showToast('Switched to Demo Student Profile');
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;
        const regBtn = document.getElementById('regSubmitBtn');

        if (password.length < 6) {
          showToast('Password must be at least 6 characters long', 'error');
          return;
        }

        if (regBtn) regBtn.disabled = true;
        try {
          const res = await AuthService.register(name, email, password);
          if (res.success) {
            AppState.currentUser = res.user;
            if (res.user.isCloud) {
              await SmartSpendApp.initCloudSession();
            } else {
              this.onUserSwitched();
            }
            authModal.close();
            showToast(`Account created for ${name}!`);
          } else {
            showToast(res.message, 'error');
          }
        } finally {
          if (regBtn) regBtn.disabled = false;
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (SupabaseManager.isCloudActive()) {
          try {
            await SupabaseManager.client.auth.signOut();
          } catch (e) {
            console.warn('Sign out exception:', e);
          }
        }
        await AuthService.logout();
        AppState.currentUser = null;
        AppState.transactions = [];
        AppState.budgets = {};
        window.location.replace('login.html');
      });
    }

    // Supabase Cloud Sync form and controls
    const supabaseConfigForm = document.getElementById('supabaseConfigForm');
    if (supabaseConfigForm) {
      supabaseConfigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = (document.getElementById('supabaseUrlInput').value || '').trim();
        const key = (document.getElementById('supabaseAnonKeyInput').value || '').trim();
        if (!url || !key) {
          showToast('Please provide both Project URL and Public Anon Key', 'error');
          return;
        }
        showToast('Verifying Supabase connection...', 'info');
        const test = await SupabaseManager.testConnection(url, key);
        if (!test.success) {
          showToast(test.message, 'error');
          return;
        }
        SupabaseManager.saveConfig(url, key, true);
        await SmartSpendApp.initCloudSession();
        showToast('Connected to Supabase! Live database sync active.', 'success');
      });
    }

    const testSupabaseBtn = document.getElementById('testSupabaseBtn');
    if (testSupabaseBtn) {
      testSupabaseBtn.addEventListener('click', async () => {
        const url = (document.getElementById('supabaseUrlInput').value || '').trim();
        const key = (document.getElementById('supabaseAnonKeyInput').value || '').trim();
        showToast('Testing connection...', 'info');
        const res = await SupabaseManager.testConnection(url, key);
        if (res.success) {
          showToast(res.message, 'success');
        } else {
          showToast(res.message, 'error');
        }
      });
    }

    const disconnectSupabaseBtn = document.getElementById('disconnectSupabaseBtn');
    if (disconnectSupabaseBtn) {
      disconnectSupabaseBtn.addEventListener('click', async () => {
        await SmartSpendApp.switchToLocalMode();
        showToast('Disconnected from Supabase. Switched to Local Sandbox Mode.', 'info');
      });
    }

    const migrateLocalToCloudBtn = document.getElementById('migrateLocalToCloudBtn');
    if (migrateLocalToCloudBtn) {
      migrateLocalToCloudBtn.addEventListener('click', async () => {
        if (!SupabaseManager.isCloudActive() || AppState.currentUser.isDemo) {
          showToast('Please sign in with a Supabase account to upload records', 'error');
          return;
        }
        showToast('Uploading local transactions to Supabase...', 'info');
        const res = await SupabaseDataService.uploadLocalData(AppState.currentUser.id, AppState.transactions, AppState.budgets);
        showToast(`Uploaded ${res.count} transactions to your Supabase project!`, 'success');
      });
    }

    const syncStatusBadge = document.getElementById('syncStatusBadge');
    if (syncStatusBadge) {
      syncStatusBadge.addEventListener('click', () => {
        SmartSpendApp.switchView('settings');
        const card = document.getElementById('supabaseConfigCard');
        if (card) card.scrollIntoView({ behavior: 'smooth' });
      });
    }

    const modeRadios = document.querySelectorAll('input[name="storageEngineMode"]');
    modeRadios.forEach(radio => {
      radio.addEventListener('change', async (e) => {
        if (e.target.value === 'supabase') {
          const cfg = SupabaseManager.loadConfig();
          if (!cfg.url || !cfg.anonKey) {
            showToast('Enter your Supabase URL and Anon key below', 'info');
            return;
          }
          SupabaseManager.saveConfig(cfg.url, cfg.anonKey, true);
          await SmartSpendApp.initCloudSession();
        } else {
          await SmartSpendApp.switchToLocalMode();
        }
      });
    });

    // Dismiss system banner
    const bannerCloseBtn = document.getElementById('bannerCloseBtn');
    if (bannerCloseBtn) {
      bannerCloseBtn.addEventListener('click', () => {
        const banner = document.getElementById('systemBanner');
        if (banner) banner.classList.add('hidden');
      });
    }
  },

  onUserSwitched() {
    this.updateUserSessionUI();
    // Reload transactions and budgets scoped to new user
    let stored = StorageService.getTransactions();
    if (!stored) {
      stored = generateSampleTransactions();
      StorageService.saveTransactions(stored);
    }
    AppState.transactions = stored;
    AppState.budgets = StorageService.getMonthlyBudgets();
    AppState.openingBalance = StorageService.getOpeningBalance();
    this.renderAll();
  },

  switchView(viewName) {
    AppState.currentView = viewName;

    // Update active nav links (sidebar & mobile bottom bar)
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-view') === viewName);
    });

    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-view') === viewName);
    });

    // Update view sections visibility
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });

    const activeViewEl = document.getElementById(`view${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`);
    if (activeViewEl) {
      activeViewEl.classList.add('active');
    }

    // Update page header titles
    const titleEl = document.getElementById('pageTitle');
    const subtitleEl = document.getElementById('pageSubtitle');
    const titles = {
      dashboard: { title: 'Dashboard Overview', sub: 'Track your financial health and cashflow' },
      transactions: { title: 'Transactions Directory', sub: 'Search, filter, edit, and organize all your financial records' },
      analytics: { title: 'Financial Analytics & Insights', sub: 'In-depth breakdown of spending habits, income sources, and savings capacity' },
      budget: { title: 'Budget & Financial Goals', sub: 'Plan spending ceilings, monitor burn rates, and receive early alerts' },
      settings: { title: 'Settings & Preferences', sub: 'Configure display currencies, local profile, and data management' }
    };

    if (titles[viewName]) {
      if (titleEl) titleEl.textContent = titles[viewName].title;
      if (subtitleEl) subtitleEl.textContent = titles[viewName].sub;
    }

    // Close mobile sidebar if open
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');

    // Re-render relevant view
    this.renderAll();
  },

  getCurrentMonthBudget() {
    return AppState.budgets[AppState.selectedMonth] !== undefined
      ? AppState.budgets[AppState.selectedMonth]
      : AppState.defaultBudget;
  },

  // -------------------------------------------------------------------
  // 9. CALCULATIONS & AGGREGATIONS
  // -------------------------------------------------------------------

  getTransactionsForSelectedMonth() {
    const ym = AppState.selectedMonth;
    return AppState.transactions.filter(t => t.date && t.date.startsWith(ym));
  },

  calculateMonthlyMetrics() {
    const monthlyTxs = this.getTransactionsForSelectedMonth();

    let totalIncome = 0;
    let totalExpenses = 0;
    let incomeCount = 0;
    let expenseCount = 0;

    monthlyTxs.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income') {
        totalIncome += amt;
        incomeCount++;
      } else if (tx.type === 'expense') {
        totalExpenses += amt;
        expenseCount++;
      }
    });

    // Net Savings for the selected period
    const netSavings = totalIncome - totalExpenses;

    // Cumulative Balance: Opening balance + all cumulative income - all cumulative expenses
    let cumulativeIncome = 0;
    let cumulativeExpenses = 0;

    AppState.transactions.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income') cumulativeIncome += amt;
      else if (tx.type === 'expense') cumulativeExpenses += amt;
    });

    const currentBalance = AppState.openingBalance + cumulativeIncome - cumulativeExpenses;

    // Savings Rate percentage
    const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

    // Budget utilization
    const monthlyBudget = this.getCurrentMonthBudget();
    const budgetUtilizationPct = monthlyBudget > 0 ? Math.round((totalExpenses / monthlyBudget) * 100) : 0;
    const remainingBudget = monthlyBudget - totalExpenses;

    return {
      totalIncome,
      totalExpenses,
      incomeCount,
      expenseCount,
      netSavings,
      currentBalance,
      savingsRate,
      monthlyBudget,
      budgetUtilizationPct,
      remainingBudget,
      monthlyTransactions: monthlyTxs
    };
  },

  // -------------------------------------------------------------------
  // 10. RENDERING & UI UPDATES
  // -------------------------------------------------------------------

  renderAll() {
    const metrics = this.calculateMonthlyMetrics();

    // Render KPI Cards
    this.renderKpiCards(metrics);

    // Render Budget Progress on Dashboard & Sidebar
    this.renderBudgetProgress(metrics);

    // Render Recent Transactions
    this.renderRecentTransactions(metrics.monthlyTransactions);

    // Render Active View Specific Components
    if (AppState.currentView === 'dashboard') {
      this.renderCharts(metrics);
    } else if (AppState.currentView === 'transactions') {
      this.renderTransactionsView();
    } else if (AppState.currentView === 'analytics') {
      this.renderAnalyticsView(metrics);
    } else if (AppState.currentView === 'budget') {
      this.renderBudgetView(metrics);
    }

    // Update Sidebar Badges
    const sidebarTxCount = document.getElementById('sidebarTxCount');
    if (sidebarTxCount) {
      sidebarTxCount.textContent = AppState.transactions.length;
    }
  },

  renderKpiCards(metrics) {
    const kpiTotalIncome = document.getElementById('kpiTotalIncome');
    const kpiIncomeCount = document.getElementById('kpiIncomeCount');
    const kpiTotalExpenses = document.getElementById('kpiTotalExpenses');
    const kpiExpenseCount = document.getElementById('kpiExpenseCount');
    const kpiCurrentBalance = document.getElementById('kpiCurrentBalance');
    const kpiNetSavings = document.getElementById('kpiNetSavings');
    const kpiSavingsRate = document.getElementById('kpiSavingsRate');
    const kpiOpeningBalanceNote = document.getElementById('kpiOpeningBalanceNote');

    if (kpiTotalIncome) kpiTotalIncome.textContent = formatCurrency(metrics.totalIncome);
    if (kpiIncomeCount) kpiIncomeCount.textContent = `${metrics.incomeCount} transaction${metrics.incomeCount === 1 ? '' : 's'}`;

    if (kpiTotalExpenses) kpiTotalExpenses.textContent = formatCurrency(metrics.totalExpenses);
    if (kpiExpenseCount) kpiExpenseCount.textContent = `${metrics.expenseCount} transaction${metrics.expenseCount === 1 ? '' : 's'}`;

    if (kpiCurrentBalance) {
      kpiCurrentBalance.textContent = formatCurrency(metrics.currentBalance);
      kpiCurrentBalance.style.color = metrics.currentBalance < 0 ? 'var(--color-expense)' : 'var(--color-text-main)';
    }
    if (kpiOpeningBalanceNote) {
      kpiOpeningBalanceNote.textContent = `Opening: ${formatCurrency(AppState.openingBalance)}`;
    }

    if (kpiNetSavings) {
      kpiNetSavings.textContent = formatCurrency(metrics.netSavings);
      kpiNetSavings.style.color = metrics.netSavings >= 0 ? 'var(--color-primary-dark)' : 'var(--color-expense)';
    }
    if (kpiSavingsRate) {
      kpiSavingsRate.textContent = `Savings Rate: ${metrics.savingsRate}%`;
    }
  },

  renderBudgetProgress(metrics) {
    const { totalExpenses, monthlyBudget, budgetUtilizationPct, remainingBudget } = metrics;
    const monthLabelStr = formatMonthLabel(AppState.selectedMonth);

    // Dashboard card elements
    const budgetMonthLabel = document.getElementById('budgetMonthLabel');
    const budgetSpentVal = document.getElementById('budgetSpentVal');
    const budgetPercentVal = document.getElementById('budgetPercentVal');
    const budgetLimitVal = document.getElementById('budgetLimitVal');
    const budgetRemainingText = document.getElementById('budgetRemainingText');
    const budgetAdviceText = document.getElementById('budgetAdviceText');
    const dashboardProgressBar = document.getElementById('dashboardProgressBar');
    const budgetStatusPill = document.getElementById('budgetStatusPill');

    // Sidebar mini widget elements
    const sidebarBudgetPct = document.getElementById('sidebarBudgetPct');
    const sidebarProgressBar = document.getElementById('sidebarProgressBar');
    const sidebarBudgetRemaining = document.getElementById('sidebarBudgetRemaining');

    if (budgetMonthLabel) budgetMonthLabel.textContent = monthLabelStr;
    if (budgetSpentVal) budgetSpentVal.textContent = formatCurrency(totalExpenses);
    if (budgetPercentVal) budgetPercentVal.textContent = `${budgetUtilizationPct}%`;
    if (budgetLimitVal) budgetLimitVal.textContent = formatCurrency(monthlyBudget);

    // Calculate days remaining in selected month for recommended daily spend
    const today = new Date();
    const [year, month] = AppState.selectedMonth.split('-').map(Number);
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const isCurrentCalendarMonth = (year === today.getFullYear() && (month - 1) === today.getMonth());
    const daysRemaining = isCurrentCalendarMonth ? Math.max(1, lastDayOfMonth - today.getDate() + 1) : lastDayOfMonth;
    const dailyLimit = remainingBudget > 0 ? (remainingBudget / daysRemaining) : 0;

    if (budgetRemainingText) {
      if (remainingBudget >= 0) {
        budgetRemainingText.textContent = `Remaining: ${formatCurrency(remainingBudget)}`;
        budgetRemainingText.style.color = 'var(--color-text-main)';
      } else {
        budgetRemainingText.textContent = `Over-budget by: ${formatCurrency(Math.abs(remainingBudget))}`;
        budgetRemainingText.style.color = 'var(--color-expense)';
      }
    }

    if (budgetAdviceText) {
      if (remainingBudget > 0) {
        budgetAdviceText.textContent = `Daily limit: ${formatCurrency(dailyLimit)} / day (${daysRemaining} days remaining)`;
      } else {
        budgetAdviceText.textContent = 'Limit reached. Pause discretionary spending.';
      }
    }

    // Clamped progress bar width (max 100% for visual width)
    const progressWidth = Math.min(100, Math.max(0, budgetUtilizationPct));
    if (dashboardProgressBar) {
      dashboardProgressBar.style.width = `${progressWidth}%`;
      dashboardProgressBar.classList.remove('warning', 'danger');
      if (budgetUtilizationPct >= 100) {
        dashboardProgressBar.classList.add('danger');
      } else if (budgetUtilizationPct >= 80) {
        dashboardProgressBar.classList.add('warning');
      }
    }

    if (sidebarProgressBar) {
      sidebarProgressBar.style.width = `${progressWidth}%`;
      sidebarProgressBar.classList.remove('warning', 'danger');
      if (budgetUtilizationPct >= 100) {
        sidebarProgressBar.classList.add('danger');
      } else if (budgetUtilizationPct >= 80) {
        sidebarProgressBar.classList.add('warning');
      }
    }

    if (sidebarBudgetPct) sidebarBudgetPct.textContent = `${budgetUtilizationPct}%`;
    if (sidebarBudgetRemaining) {
      sidebarBudgetRemaining.textContent = remainingBudget >= 0
        ? `${formatCurrency(remainingBudget)} left`
        : `${formatCurrency(Math.abs(remainingBudget))} over-budget`;
    }

    // Status pill & System Alert Banner
    const systemBanner = document.getElementById('systemBanner');
    const bannerText = document.getElementById('bannerText');
    const bannerIcon = document.getElementById('bannerIcon');

    if (budgetStatusPill) {
      budgetStatusPill.className = 'budget-status-pill';
      if (budgetUtilizationPct >= 100) {
        budgetStatusPill.classList.add('danger');
        budgetStatusPill.textContent = '🚨 Over-Budget';
      } else if (budgetUtilizationPct >= 80) {
        budgetStatusPill.classList.add('warning');
        budgetStatusPill.textContent = '⚠️ 80% Threshold Reached';
      } else {
        budgetStatusPill.textContent = 'Within Budget';
      }
    }

    if (systemBanner && bannerText) {
      if (budgetUtilizationPct >= 100) {
        systemBanner.className = 'system-banner danger';
        bannerIcon.className = 'fa-solid fa-circle-exclamation banner-icon';
        bannerText.innerHTML = `<strong>Attention:</strong> You have exceeded your monthly budget for ${monthLabelStr} by <strong>${formatCurrency(Math.abs(remainingBudget))}</strong>!`;
        systemBanner.classList.remove('hidden');
      } else if (budgetUtilizationPct >= 80) {
        systemBanner.className = 'system-banner warning';
        bannerIcon.className = 'fa-solid fa-triangle-exclamation banner-icon';
        bannerText.innerHTML = `<strong>Budget Warning:</strong> You have utilized <strong>${budgetUtilizationPct}%</strong> of your monthly budget for ${monthLabelStr}. (${formatCurrency(remainingBudget)} remaining).`;
        systemBanner.classList.remove('hidden');
      } else {
        systemBanner.classList.add('hidden');
      }
    }
  },

  renderRecentTransactions(monthlyTxs) {
    const tbody = document.getElementById('recentTransactionsBody');
    const table = document.getElementById('recentTransactionsTable');
    const emptyState = document.getElementById('recentEmptyState');

    if (!tbody) return;
    tbody.innerHTML = '';

    if (!monthlyTxs || monthlyTxs.length === 0) {
      if (table) table.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (table) table.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    // Sort descending by date, take top 5
    const recent = [...monthlyTxs]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    recent.forEach(tx => {
      const tr = document.createElement('tr');
      const isIncome = tx.type === 'income';
      const typeIcon = isIncome ? 'fa-arrow-down-left' : 'fa-arrow-up-right';
      const catClass = this.getCategoryBadgeClass(tx.category);
      const catIcon = CATEGORY_ICONS[tx.category] || 'fa-tag';

      tr.innerHTML = `
        <td>
          <div class="type-indicator ${tx.type}" title="${isIncome ? 'Income' : 'Expense'}">
            <i class="fa-solid ${typeIcon}"></i>
          </div>
        </td>
        <td>
          <strong>${escapeHtml(tx.description)}</strong>
          ${tx.notes ? `<div style="font-size: 0.78rem; color: var(--color-text-muted);">${escapeHtml(tx.notes)}</div>` : ''}
        </td>
        <td>
          <span class="category-badge ${catClass}">
            <i class="fa-solid ${catIcon}"></i> ${escapeHtml(tx.category)}
          </span>
        </td>
        <td>${formatDateDisplay(tx.date)}</td>
        <td class="text-right">
          <span class="${isIncome ? 'font-income' : 'font-expense'}">
            ${isIncome ? '+' : '-'}${formatCurrency(tx.amount)}
          </span>
        </td>
        <td class="text-center">
          <div class="table-actions">
            <button type="button" class="action-btn" title="Edit Transaction" onclick="SmartSpendApp.openEditModal('${tx.id}')">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button type="button" class="action-btn btn-delete" title="Delete Transaction" onclick="SmartSpendApp.confirmDeleteTransaction('${tx.id}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  getCategoryBadgeClass(category) {
    if (!category) return 'cat-other';
    const c = category.toLowerCase().replace(/[^a-z]/g, '');
    if (c.includes('salary') || c.includes('freelance') || c.includes('scholarship') || c.includes('allowance')) return 'cat-salary';
    if (c.includes('food')) return 'cat-food';
    if (c.includes('transport')) return 'cat-transport';
    if (c.includes('education')) return 'cat-education';
    if (c.includes('shopping')) return 'cat-shopping';
    if (c.includes('bill')) return 'cat-bills';
    if (c.includes('health')) return 'cat-health';
    if (c.includes('entertainment')) return 'cat-entertainment';
    if (c.includes('subscription')) return 'cat-subscriptions';
    return 'cat-other';
  },

  // -------------------------------------------------------------------
  // 11. CHART.JS VISUALIZATIONS
  // -------------------------------------------------------------------

  renderCharts(metrics) {
    const { totalIncome, totalExpenses, monthlyTransactions } = metrics;

    // A. Cashflow Bar Chart (Income vs Expense)
    const cashflowCanvas = document.getElementById('cashflowChart');
    const cashflowEmpty = document.getElementById('cashflowEmpty');

    if (cashflowCanvas) {
      if (totalIncome === 0 && totalExpenses === 0) {
        cashflowCanvas.style.display = 'none';
        if (cashflowEmpty) cashflowEmpty.classList.remove('hidden');
      } else {
        cashflowCanvas.style.display = 'block';
        if (cashflowEmpty) cashflowEmpty.classList.add('hidden');

        if (ChartManager.cashflowChart) {
          ChartManager.cashflowChart.destroy();
        }

        const ctx = cashflowCanvas.getContext('2d');
        ChartManager.cashflowChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: ['Total Income', 'Total Expenses'],
            datasets: [{
              label: 'Amount (₹)',
              data: [totalIncome, totalExpenses],
              backgroundColor: ['#10b981', '#ef4444'],
              borderRadius: 8,
              borderSkipped: false,
              barThickness: 56
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#0f172a',
                titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 13, weight: 'bold' },
                bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
                padding: 12,
                cornerRadius: 8,
                callbacks: {
                  label: (context) => ` ${formatCurrency(context.parsed.y)}`
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(226, 232, 240, 0.6)' },
                ticks: {
                  callback: (val) => formatCurrency(val).replace('.00', ''),
                  font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 }
                }
              },
              x: {
                grid: { display: false },
                ticks: { font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600', size: 12 } }
              }
            }
          }
        });
      }
    }

    // B. Expense Breakdown Doughnut Chart
    const categoryCanvas = document.getElementById('categoryChart');
    const categoryEmpty = document.getElementById('categoryEmpty');
    const categoryCountBadge = document.getElementById('categoryCountBadge');

    // Group expenses by category
    const expenseMap = {};
    monthlyTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const cat = t.category || 'Other';
        expenseMap[cat] = (expenseMap[cat] || 0) + Number(t.amount);
      });

    const categoryLabels = Object.keys(expenseMap);
    const categoryAmounts = Object.values(expenseMap);

    if (categoryCountBadge) {
      categoryCountBadge.textContent = `${categoryLabels.length} Categor${categoryLabels.length === 1 ? 'y' : 'ies'}`;
    }

    if (categoryCanvas) {
      if (categoryLabels.length === 0) {
        categoryCanvas.style.display = 'none';
        if (categoryEmpty) categoryEmpty.classList.remove('hidden');
      } else {
        categoryCanvas.style.display = 'block';
        if (categoryEmpty) categoryEmpty.classList.add('hidden');

        if (ChartManager.categoryChart) {
          ChartManager.categoryChart.destroy();
        }

        const colors = categoryLabels.map(cat => CATEGORY_COLORS[cat] || '#94a3b8');
        const ctx2 = categoryCanvas.getContext('2d');

        ChartManager.categoryChart = new Chart(ctx2, {
          type: 'doughnut',
          data: {
            labels: categoryLabels,
            datasets: [{
              data: categoryAmounts,
              backgroundColor: colors,
              borderWidth: 2,
              borderColor: '#ffffff',
              hoverOffset: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'right',
                labels: {
                  boxWidth: 12,
                  boxHeight: 12,
                  font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: '600' },
                  padding: 12
                }
              },
              tooltip: {
                backgroundColor: '#0f172a',
                padding: 12,
                cornerRadius: 8,
                callbacks: {
                  label: (context) => {
                    const label = context.label || '';
                    const val = context.parsed || 0;
                    const total = categoryAmounts.reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                    return ` ${label}: ${formatCurrency(val)} (${pct}%)`;
                  }
                }
              }
            },
            cutout: '68%'
          }
        });
      }
    }
  },

  // -------------------------------------------------------------------
  // 12. TRANSACTIONS VIEW (SEARCH, FILTERS, & SORTING)
  // -------------------------------------------------------------------

  populateFilterCategoryDropdown() {
    const filterSelect = document.getElementById('txCategoryFilter');
    if (!filterSelect) return;

    const currentVal = AppState.filters.category;
    filterSelect.innerHTML = '<option value="all">All Categories</option>';

    let categoriesToShow = [];
    if (AppState.filters.type === 'income') {
      categoriesToShow = INCOME_CATEGORIES;
    } else if (AppState.filters.type === 'expense') {
      categoriesToShow = EXPENSE_CATEGORIES;
    } else {
      categoriesToShow = Array.from(new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]));
    }

    categoriesToShow.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      if (cat === currentVal) opt.selected = true;
      filterSelect.appendChild(opt);
    });
  },

  renderTransactionsView() {
    this.populateFilterCategoryDropdown();

    const tbody = document.getElementById('allTransactionsBody');
    const table = document.getElementById('allTransactionsTable');
    const emptyState = document.getElementById('filterEmptyState');
    const statsText = document.getElementById('filterStatsText');
    const totalsText = document.getElementById('filterTotalsText');

    if (!tbody) return;
    tbody.innerHTML = '';

    // Apply combined filters without modifying original data
    let filtered = [...AppState.transactions];

    // Filter by Search Query
    if (AppState.filters.search) {
      const query = AppState.filters.search;
      filtered = filtered.filter(tx => {
        const desc = (tx.description || '').toLowerCase();
        const notes = (tx.notes || '').toLowerCase();
        const cat = (tx.category || '').toLowerCase();
        const amt = String(tx.amount || '');
        return desc.includes(query) || notes.includes(query) || cat.includes(query) || amt.includes(query);
      });
    }

    // Filter by Type
    if (AppState.filters.type !== 'all') {
      filtered = filtered.filter(tx => tx.type === AppState.filters.type);
    }

    // Filter by Category
    if (AppState.filters.category !== 'all') {
      filtered = filtered.filter(tx => tx.category === AppState.filters.category);
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (AppState.filters.sort) {
        case 'date-asc':
          return new Date(a.date) - new Date(b.date);
        case 'amount-desc':
          return Number(b.amount) - Number(a.amount);
        case 'amount-asc':
          return Number(a.amount) - Number(b.amount);
        case 'date-desc':
        default:
          return new Date(b.date) - new Date(a.date);
      }
    });

    // Update stats bar
    if (statsText) {
      statsText.textContent = `Showing ${filtered.length} of ${AppState.transactions.length} total transactions`;
    }

    if (totalsText) {
      let filteredTotalIncome = 0;
      let filteredTotalExpense = 0;
      filtered.forEach(t => {
        if (t.type === 'income') filteredTotalIncome += Number(t.amount);
        else filteredTotalExpense += Number(t.amount);
      });

      if (AppState.filters.type === 'income') {
        totalsText.textContent = `Total Income: ${formatCurrency(filteredTotalIncome)}`;
      } else if (AppState.filters.type === 'expense') {
        totalsText.textContent = `Total Expense: ${formatCurrency(filteredTotalExpense)}`;
      } else {
        totalsText.textContent = `Net: ${formatCurrency(filteredTotalIncome - filteredTotalExpense)}`;
      }
    }

    if (filtered.length === 0) {
      if (table) table.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (table) table.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    filtered.forEach(tx => {
      const tr = document.createElement('tr');
      const isIncome = tx.type === 'income';
      const typeIcon = isIncome ? 'fa-arrow-down-left' : 'fa-arrow-up-right';
      const catClass = this.getCategoryBadgeClass(tx.category);
      const catIcon = CATEGORY_ICONS[tx.category] || 'fa-tag';

      tr.innerHTML = `
        <td>
          <div class="type-indicator ${tx.type}" title="${isIncome ? 'Income' : 'Expense'}">
            <i class="fa-solid ${typeIcon}"></i>
          </div>
        </td>
        <td>
          <strong>${escapeHtml(tx.description)}</strong>
        </td>
        <td>
          <span class="category-badge ${catClass}">
            <i class="fa-solid ${catIcon}"></i> ${escapeHtml(tx.category)}
          </span>
        </td>
        <td>${formatDateDisplay(tx.date)}</td>
        <td style="color: var(--color-text-muted); font-size: 0.85rem;">
          ${tx.notes ? escapeHtml(tx.notes) : '-'}
        </td>
        <td class="text-right">
          <span class="${isIncome ? 'font-income' : 'font-expense'}">
            ${isIncome ? '+' : '-'}${formatCurrency(tx.amount)}
          </span>
        </td>
        <td class="text-center">
          <div class="table-actions">
            <button type="button" class="action-btn" title="Edit" onclick="SmartSpendApp.openEditModal('${tx.id}')">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button type="button" class="action-btn btn-delete" title="Delete" onclick="SmartSpendApp.confirmDeleteTransaction('${tx.id}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  clearFilters() {
    AppState.filters = {
      search: '',
      type: 'all',
      category: 'all',
      sort: 'date-desc'
    };

    const sInp = document.getElementById('txSearchInput');
    const tSel = document.getElementById('txTypeFilter');
    const cSel = document.getElementById('txCategoryFilter');
    const soSel = document.getElementById('txSortSelect');

    if (sInp) sInp.value = '';
    if (tSel) tSel.value = 'all';
    if (cSel) cSel.value = 'all';
    if (soSel) soSel.value = 'date-desc';

    this.renderTransactionsView();
  },

  // -------------------------------------------------------------------
  // 13. ANALYTICS VIEW
  // -------------------------------------------------------------------

  renderAnalyticsView(metrics) {
    const { totalIncome, totalExpenses, savingsRate, monthlyTransactions } = metrics;

    const analyticsSavingsRate = document.getElementById('analyticsSavingsRate');
    const analyticsSavingsHealth = document.getElementById('analyticsSavingsHealth');
    const analyticsTopCategory = document.getElementById('analyticsTopCategory');
    const analyticsTopCategoryAmount = document.getElementById('analyticsTopCategoryAmount');
    const analyticsAvgDaily = document.getElementById('analyticsAvgDaily');
    const categoryBreakdownList = document.getElementById('categoryBreakdownList');

    if (analyticsSavingsRate) analyticsSavingsRate.textContent = `${savingsRate}%`;
    if (analyticsSavingsHealth) {
      if (savingsRate >= 25) analyticsSavingsHealth.textContent = '🌟 Excellent savings discipline!';
      else if (savingsRate >= 10) analyticsSavingsHealth.textContent = '👍 Moderate savings capacity.';
      else analyticsSavingsHealth.textContent = '⚠️ Low savings rate. Review expenses.';
    }

    // Top Category
    const catMap = {};
    monthlyTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount);
      });

    let topCat = 'None';
    let topCatAmt = 0;
    Object.entries(catMap).forEach(([cat, amt]) => {
      if (amt > topCatAmt) {
        topCat = cat;
        topCatAmt = amt;
      }
    });

    if (analyticsTopCategory) analyticsTopCategory.textContent = topCat;
    if (analyticsTopCategoryAmount) {
      const topCatPct = totalExpenses > 0 ? Math.round((topCatAmt / totalExpenses) * 100) : 0;
      analyticsTopCategoryAmount.textContent = `${formatCurrency(topCatAmt)} (${topCatPct}% of monthly spend)`;
    }

    // Avg Daily Expense for active month
    const [year, month] = AppState.selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const avgDaily = totalExpenses > 0 ? (totalExpenses / daysInMonth) : 0;
    if (analyticsAvgDaily) analyticsAvgDaily.textContent = formatCurrency(avgDaily);

    // Category Spending Breakdown List
    if (categoryBreakdownList) {
      categoryBreakdownList.innerHTML = '';
      if (Object.keys(catMap).length === 0) {
        categoryBreakdownList.innerHTML = '<p style="color: var(--color-text-muted); padding: 1rem 0;">No expense data logged for this month.</p>';
      } else {
        const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
        sortedCats.forEach(([cat, amt]) => {
          const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;
          const catIcon = CATEGORY_ICONS[cat] || 'fa-tag';
          const color = CATEGORY_COLORS[cat] || '#64748b';

          const row = document.createElement('div');
          row.className = 'breakdown-row';
          row.innerHTML = `
            <div class="breakdown-row-header">
              <span class="breakdown-cat-name">
                <i class="fa-solid ${catIcon}" style="color: ${color}"></i> ${escapeHtml(cat)} (${pct}%)
              </span>
              <span class="breakdown-amount">${formatCurrency(amt)}</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
            </div>
          `;
          categoryBreakdownList.appendChild(row);
        });
      }
    }

    // 6-Month Cashflow Trend Chart
    this.renderTrendChart();
  },

  renderTrendChart() {
    const trendCanvas = document.getElementById('trendChart');
    if (!trendCanvas) return;

    if (ChartManager.trendChart) {
      ChartManager.trendChart.destroy();
    }

    // Build past 6 months list ending at AppState.selectedMonth
    const [selY, selM] = AppState.selectedMonth.split('-').map(Number);
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(selY, selM - 1 - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      months.push({ ym, label });
    }

    const incomeData = [];
    const expenseData = [];

    months.forEach(m => {
      let inc = 0;
      let exp = 0;
      AppState.transactions.forEach(t => {
        if (t.date && t.date.startsWith(m.ym)) {
          if (t.type === 'income') inc += Number(t.amount);
          else exp += Number(t.amount);
        }
      });
      incomeData.push(inc);
      expenseData.push(exp);
    });

    const ctx = trendCanvas.getContext('2d');
    ChartManager.trendChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months.map(m => m.label),
        datasets: [
          {
            label: 'Income',
            data: incomeData,
            backgroundColor: '#10b981',
            borderRadius: 6
          },
          {
            label: 'Expenses',
            data: expenseData,
            backgroundColor: '#ef4444',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600' } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (context) => ` ${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (val) => formatCurrency(val).replace('.00', ''),
              font: { family: "'Plus Jakarta Sans', sans-serif" }
            }
          },
          x: {
            ticks: { font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600' } }
          }
        }
      }
    });
  },

  // -------------------------------------------------------------------
  // 14. BUDGET & GOALS VIEW
  // -------------------------------------------------------------------

  renderBudgetView(metrics) {
    const { totalExpenses, monthlyBudget, budgetUtilizationPct, remainingBudget } = metrics;
    const monthLabelStr = formatMonthLabel(AppState.selectedMonth);

    const budgetMonthFormLabel = document.getElementById('budgetMonthFormLabel');
    const monthlyBudgetInput = document.getElementById('monthlyBudgetInput');
    const openingBalanceInput = document.getElementById('openingBalanceInput');

    if (budgetMonthFormLabel) budgetMonthFormLabel.textContent = monthLabelStr;
    if (monthlyBudgetInput) monthlyBudgetInput.value = monthlyBudget;
    if (openingBalanceInput) openingBalanceInput.value = AppState.openingBalance;

    // Stat items
    const statAllocatedBudget = document.getElementById('statAllocatedBudget');
    const statTotalSpent = document.getElementById('statTotalSpent');
    const statRemainingBalance = document.getElementById('statRemainingBalance');
    const statBudgetUsed = document.getElementById('statBudgetUsed');
    const statDailyLimit = document.getElementById('statDailyLimit');

    if (statAllocatedBudget) statAllocatedBudget.textContent = formatCurrency(monthlyBudget);
    if (statTotalSpent) statTotalSpent.textContent = formatCurrency(totalExpenses);
    if (statRemainingBalance) {
      statRemainingBalance.textContent = remainingBudget >= 0
        ? formatCurrency(remainingBudget)
        : `Over by ${formatCurrency(Math.abs(remainingBudget))}`;
      statRemainingBalance.style.color = remainingBudget < 0 ? 'var(--color-expense)' : 'var(--color-text-main)';
    }
    if (statBudgetUsed) statBudgetUsed.textContent = `${budgetUtilizationPct}%`;

    // Calculate daily limit
    const today = new Date();
    const [year, month] = AppState.selectedMonth.split('-').map(Number);
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const isCurrentCalendarMonth = (year === today.getFullYear() && (month - 1) === today.getMonth());
    const daysRemaining = isCurrentCalendarMonth ? Math.max(1, lastDayOfMonth - today.getDate() + 1) : lastDayOfMonth;
    const dailyRec = remainingBudget > 0 ? (remainingBudget / daysRemaining) : 0;

    if (statDailyLimit) statDailyLimit.textContent = `${formatCurrency(dailyRec)} / day`;

    // Health indicator status
    const indicatorBox = document.getElementById('budgetIndicatorBox');
    const indicatorIcon = document.getElementById('budgetIndicatorIcon');
    const indicatorHeading = document.getElementById('budgetIndicatorHeading');
    const indicatorSub = document.getElementById('budgetIndicatorSub');

    if (indicatorBox && indicatorHeading && indicatorSub && indicatorIcon) {
      indicatorBox.className = 'budget-indicator-box';
      if (budgetUtilizationPct >= 100) {
        indicatorBox.classList.add('danger');
        indicatorIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        indicatorHeading.textContent = 'Budget Exceeded!';
        indicatorSub.textContent = `You are ${formatCurrency(Math.abs(remainingBudget))} over your spending target for this month.`;
      } else if (budgetUtilizationPct >= 80) {
        indicatorBox.classList.add('warning');
        indicatorIcon.innerHTML = '<i class="fa-solid fa-bell"></i>';
        indicatorHeading.textContent = 'Caution: Approaching Budget Limit';
        indicatorSub.textContent = `You have used ${budgetUtilizationPct}% of your allocated budget. Slow down spending.`;
      } else {
        indicatorIcon.innerHTML = '<i class="fa-solid fa-check"></i>';
        indicatorHeading.textContent = 'Healthy & On Track';
        indicatorSub.textContent = `You have safely used only ${budgetUtilizationPct}% of your allocated monthly spending ceiling.`;
      }
    }
  },

  // -------------------------------------------------------------------
  // 15. TRANSACTION CRUD: ADD, EDIT, DELETE & VALIDATION
  // -------------------------------------------------------------------

  populateCategoryDropdowns() {
    this.populateCategorySelect('expense');
    this.populateFilterCategoryDropdown();
  },

  populateCategorySelect(type) {
    const select = document.getElementById('txCategorySelect');
    if (!select) return;

    select.innerHTML = '';
    const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    });
  },

  openAddModal(defaultType = 'expense') {
    AppState.editingTransactionId = null;
    const modal = document.getElementById('transactionModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalSubtitle = document.getElementById('modalSubtitle');
    const modalSubmitText = document.getElementById('modalSubmitText');
    const modalIconBadge = document.getElementById('modalIconBadge');

    if (modalTitle) modalTitle.textContent = 'Add Transaction';
    if (modalSubtitle) modalSubtitle.textContent = 'Record a new income or expense item';
    if (modalSubmitText) modalSubmitText.textContent = 'Save Transaction';
    if (modalIconBadge) modalIconBadge.innerHTML = '<i class="fa-solid fa-plus"></i>';

    // Reset Form
    document.getElementById('txIdInput').value = '';
    document.getElementById('txAmountInput').value = '';
    document.getElementById('txDescriptionInput').value = '';
    document.getElementById('txNotesInput').value = '';

    // Date defaults to today or current selected month day
    const txDateInput = document.getElementById('txDateInput');
    if (txDateInput) {
      const today = getTodayDateString();
      if (today.startsWith(AppState.selectedMonth)) {
        txDateInput.value = today;
      } else {
        txDateInput.value = `${AppState.selectedMonth}-01`;
      }
    }

    // Set Type radio
    const expRadio = document.getElementById('typeExpenseRadio');
    const incRadio = document.getElementById('typeIncomeRadio');
    if (defaultType === 'income') {
      if (incRadio) incRadio.checked = true;
      this.populateCategorySelect('income');
    } else {
      if (expRadio) expRadio.checked = true;
      this.populateCategorySelect('expense');
    }

    this.clearValidationErrors();
    if (modal) modal.showModal();
  },

  openEditModal(txId) {
    const tx = AppState.transactions.find(t => t.id === txId);
    if (!tx) {
      showToast('Transaction not found', 'error');
      return;
    }

    AppState.editingTransactionId = txId;
    const modal = document.getElementById('transactionModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalSubtitle = document.getElementById('modalSubtitle');
    const modalSubmitText = document.getElementById('modalSubmitText');
    const modalIconBadge = document.getElementById('modalIconBadge');

    if (modalTitle) modalTitle.textContent = 'Edit Transaction';
    if (modalSubtitle) modalSubtitle.textContent = 'Modify and update transaction details';
    if (modalSubmitText) modalSubmitText.textContent = 'Update Transaction';
    if (modalIconBadge) modalIconBadge.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';

    // Populate Fields
    document.getElementById('txIdInput').value = tx.id;
    document.getElementById('txAmountInput').value = tx.amount;
    document.getElementById('txDescriptionInput').value = tx.description;
    document.getElementById('txDateInput').value = tx.date;
    document.getElementById('txNotesInput').value = tx.notes || '';

    // Type radio
    const expRadio = document.getElementById('typeExpenseRadio');
    const incRadio = document.getElementById('typeIncomeRadio');
    if (tx.type === 'income') {
      if (incRadio) incRadio.checked = true;
      this.populateCategorySelect('income');
    } else {
      if (expRadio) expRadio.checked = true;
      this.populateCategorySelect('expense');
    }

    // Set category value
    const catSelect = document.getElementById('txCategorySelect');
    if (catSelect) catSelect.value = tx.category;

    this.clearValidationErrors();
    if (modal) modal.showModal();
  },

  clearValidationErrors() {
    ['amountError', 'descriptionError', 'dateError', 'categoryError'].forEach(id => {
      const err = document.getElementById(id);
      if (err) err.classList.remove('visible');
    });
  },

  async handleTransactionFormSubmit(e) {
    e.preventDefault();
    this.clearValidationErrors();

    const idInput = document.getElementById('txIdInput').value;
    const isEdit = Boolean(idInput);

    const type = document.querySelector('input[name="txType"]:checked').value;
    const amountVal = parseFloat(document.getElementById('txAmountInput').value);
    const description = document.getElementById('txDescriptionInput').value.trim();
    const date = document.getElementById('txDateInput').value;
    const category = document.getElementById('txCategorySelect').value;
    const notes = document.getElementById('txNotesInput').value.trim();

    let hasErrors = false;

    // Validate Amount
    if (isNaN(amountVal) || amountVal <= 0) {
      document.getElementById('amountError').classList.add('visible');
      hasErrors = true;
    }

    // Validate Description
    if (!description) {
      document.getElementById('descriptionError').classList.add('visible');
      hasErrors = true;
    }

    // Validate Date
    if (!date) {
      document.getElementById('dateError').classList.add('visible');
      hasErrors = true;
    }

    // Validate Category
    if (!category) {
      document.getElementById('categoryError').classList.add('visible');
      hasErrors = true;
    }

    if (hasErrors) {
      return;
    }

    if (isEdit) {
      // Update existing transaction
      const index = AppState.transactions.findIndex(t => t.id === idInput);
      if (index !== -1) {
        const updatedTx = {
          ...AppState.transactions[index],
          type,
          amount: amountVal,
          description,
          category,
          date,
          notes,
          updatedAt: new Date().toISOString()
        };

        if (SupabaseManager.isCloudActive() && !AppState.currentUser?.isDemo) {
          const res = await SupabaseDataService.updateTransaction(updatedTx, AppState.currentUser.id);
          if (!res.success) {
            const errMsg = res.error?.message || 'Failed to update transaction in database';
            showToast(errMsg, 'error');
            return;
          }
          if (res.data) {
            Object.assign(updatedTx, res.data);
          }
        }

        AppState.transactions[index] = updatedTx;
        StorageService.saveTransactions(AppState.transactions);
        showToast('Transaction updated successfully!');
      }
    } else {
      // Create new transaction
      let newTx = {
        id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        type,
        amount: amountVal,
        description,
        category,
        date,
        notes,
        createdAt: new Date().toISOString()
      };

      if (SupabaseManager.isCloudActive() && !AppState.currentUser?.isDemo) {
        const res = await SupabaseDataService.insertTransaction(newTx, AppState.currentUser.id);
        if (!res.success) {
          const errMsg = res.error?.message || 'Failed to save transaction to database';
          showToast(errMsg, 'error');
          return;
        }
        if (res.data) {
          newTx = { ...newTx, ...res.data };
        }
      }

      AppState.transactions.unshift(newTx);
      StorageService.saveTransactions(AppState.transactions);
      showToast(`${type === 'income' ? 'Income' : 'Expense'} of ${formatCurrency(amountVal)} recorded!`);
    }

    // Check if added transaction month differs from currently selected month
    const txMonth = date.substring(0, 7);
    if (txMonth !== AppState.selectedMonth) {
      AppState.selectedMonth = txMonth;
      const monthPicker = document.getElementById('monthPicker');
      if (monthPicker) monthPicker.value = txMonth;
    }

    document.getElementById('transactionModal').close();
    this.renderAll();
  },

  confirmDeleteTransaction(txId) {
    const tx = AppState.transactions.find(t => t.id === txId);
    if (!tx) return;

    AppState.pendingDeleteId = txId;
    const modal = document.getElementById('deleteConfirmModal');
    const descEl = document.getElementById('deleteTxDescription');
    const amtEl = document.getElementById('deleteTxAmount');

    if (descEl) descEl.textContent = `"${tx.description}"`;
    if (amtEl) amtEl.textContent = formatCurrency(tx.amount);

    if (modal) modal.showModal();
  },

  async executeDeleteTransaction() {
    if (!AppState.pendingDeleteId) return;

    const idToDelete = AppState.pendingDeleteId;

    if (SupabaseManager.isCloudActive() && !AppState.currentUser?.isDemo) {
      const res = await SupabaseDataService.deleteTransaction(idToDelete, AppState.currentUser.id);
      if (!res.success) {
        const errMsg = res.error?.message || 'Failed to delete transaction from database';
        showToast(errMsg, 'error');
        return;
      }
    }

    AppState.transactions = AppState.transactions.filter(t => t.id !== idToDelete);
    StorageService.saveTransactions(AppState.transactions);

    AppState.pendingDeleteId = null;
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.close();

    this.renderAll();
    showToast('Transaction deleted successfully');
  },

  // -------------------------------------------------------------------
  // 16. DATA IMPORT, EXPORT, SAMPLE SEEDING & RESET
  // -------------------------------------------------------------------

  async loadSampleData() {
    const samples = generateSampleTransactions();
    if (SupabaseManager.isCloudActive() && !AppState.currentUser?.isDemo) {
      showToast('Uploading sample transactions to your account...', 'info');
      const res = await SupabaseDataService.uploadLocalData(AppState.currentUser.id, samples, {});
      const fresh = await SupabaseDataService.fetchTransactions(AppState.currentUser.id);
      if (fresh) AppState.transactions = fresh;
      StorageService.saveTransactions(AppState.transactions);
      this.renderAll();
      showToast(`Loaded ${res.count || samples.length} sample transactions into your cloud account!`);
    } else {
      AppState.transactions = samples;
      StorageService.saveTransactions(AppState.transactions);
      this.renderAll();
      showToast('Loaded realistic student sample transactions!');
    }
  },

  async resetAllData() {
    if (SupabaseManager.isCloudActive() && !AppState.currentUser?.isDemo) {
      const confirmed = window.confirm('Are you sure you want to delete all your cloud transactions and budgets? This cannot be undone.');
      if (!confirmed) return;
      const ok = await SupabaseDataService.resetUserData(AppState.currentUser.id);
      if (!ok) {
        showToast('Failed to reset cloud account data', 'error');
        return;
      }
    }
    AppState.transactions = [];
    AppState.budgets = {};
    AppState.openingBalance = 0;
    StorageService.clearUserData();
    this.renderAll();
    showToast('All transaction data and budgets wiped clean.', 'info');
  },

  exportCsv() {
    if (AppState.transactions.length === 0) {
      showToast('No transactions to export', 'error');
      return;
    }

    const headers = ['ID', 'Type', 'Description', 'Amount', 'Category', 'Date', 'Notes'];
    const rows = AppState.transactions.map(t => [
      t.id,
      t.type,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.amount,
      `"${(t.category || '').replace(/"/g, '""')}"`,
      t.date,
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SmartSpend_Transactions_${AppState.selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('CSV export downloaded successfully!');
  },

  exportJson() {
    const backupData = {
      app: 'SmartSpend',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      user: AppState.currentUser,
      transactions: AppState.transactions,
      budgets: AppState.budgets,
      openingBalance: AppState.openingBalance,
      preferences: AppState.preferences
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SmartSpend_Backup_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('JSON backup file generated and downloaded!');
  },

  importJson(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.transactions && Array.isArray(parsed.transactions)) {
          // Validate transaction fields
          const validTxs = parsed.transactions.filter(t => 
            t.type && (t.type === 'income' || t.type === 'expense') &&
            !isNaN(parseFloat(t.amount)) && parseFloat(t.amount) > 0 &&
            t.description && t.category && t.date
          ).map(t => ({
            ...t,
            amount: parseFloat(t.amount),
            id: t.id || ('tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6))
          }));

          if (SupabaseManager.isCloudActive() && !AppState.currentUser?.isDemo) {
            showToast('Syncing imported records to your Supabase account...', 'info');
            await SupabaseDataService.uploadLocalData(AppState.currentUser.id, validTxs, parsed.budgets || {});
            const fresh = await SupabaseDataService.fetchTransactions(AppState.currentUser.id);
            if (fresh) AppState.transactions = fresh;
            if (parsed.budgets) {
              const freshBudgets = await SupabaseDataService.fetchBudgets(AppState.currentUser.id);
              if (freshBudgets) AppState.budgets = freshBudgets;
            }
          } else {
            AppState.transactions = validTxs;
            if (parsed.budgets) AppState.budgets = parsed.budgets;
          }

          StorageService.saveTransactions(AppState.transactions);
          if (parsed.budgets) StorageService.saveMonthlyBudgets(AppState.budgets);

          if (parsed.openingBalance !== undefined) {
            AppState.openingBalance = Number(parsed.openingBalance) || 0;
            StorageService.saveOpeningBalance(AppState.openingBalance);
            if (SupabaseManager.isCloudActive() && !AppState.currentUser?.isDemo) {
              await SupabaseDataService.updateProfile(AppState.currentUser.id, {
                opening_balance: AppState.openingBalance
              });
            }
          }

          this.renderAll();
          showToast(`Successfully restored ${validTxs.length} transactions from JSON!`);
        } else {
          showToast('Invalid backup format. Missing transactions array.', 'error');
        }
      } catch (err) {
        showToast('Failed to parse JSON file.', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }
};

// -------------------------------------------------------------------
// 17. INITIALIZE ON DOM READY
// -------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  SmartSpendApp.init();
});

// Export for automated testing environments (Node.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SmartSpendApp,
    AppState,
    StorageService,
    AuthService,
    formatCurrency,
    formatDateDisplay,
    generateSampleTransactions
  };
}
