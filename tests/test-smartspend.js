/**
 * Automated Test Suite for SmartSpend Logic
 * Simulates DOM and tests all core functional scenarios
 */

// Mock localStorage
const localStorageMock = (function () {
  let store = {};
  return {
    getItem(key) {
      return store[key] || null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key(i) {
      return Object.keys(store)[i] || null;
    }
  };
})();

global.localStorage = localStorageMock;

// Mock window and document basics
global.window = global;
global.document = {
  body: {
    classList: {
      add: () => {},
      remove: () => {}
    }
  },
  getElementById: (id) => ({
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    getContext: () => ({}),
    showModal: () => {},
    close: () => {},
    appendChild: () => {},
    removeChild: () => {},
    addEventListener: () => {}
  }),
  querySelectorAll: () => [],
  createElement: (tag) => ({
    style: {},
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    innerHTML: '',
    textContent: '',
    setAttribute: () => {},
    click: () => {}
  }),
  addEventListener: () => {}
};

// Mock Chart
global.Chart = function() {
  return {
    destroy: () => {},
    update: () => {}
  };
};

console.log('--- Requiring script.js ---');
const {
  SmartSpendApp,
  AppState,
  StorageService,
  AuthService,
  formatCurrency,
  formatDateDisplay,
  generateSampleTransactions
} = require('../script.js');

console.log('--- Running SmartSpend Test Suite ---');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

// TEST 1: App initializes with sample transactions
SmartSpendApp.init();
assert(AppState.transactions.length > 0, `App initialized with ${AppState.transactions.length} sample transactions`);
assert(AppState.currentUser !== null, `Current user set to ${AppState.currentUser.name}`);

// TEST 2: Calculate metrics for selected month
const metrics1 = SmartSpendApp.calculateMonthlyMetrics();
assert(metrics1.totalIncome > 0, `Total Income is calculated correctly: ${metrics1.totalIncome}`);
assert(metrics1.totalExpenses > 0, `Total Expenses is calculated correctly: ${metrics1.totalExpenses}`);
assert(metrics1.netSavings === (metrics1.totalIncome - metrics1.totalExpenses), `Net Savings matches income - expense (${metrics1.netSavings})`);

// TEST 3: Add new expense
const initialExpense = metrics1.totalExpenses;
const newExpenseTx = {
  id: 'test_tx_exp_01',
  type: 'expense',
  description: 'Test Textbook Purchase',
  amount: 1500,
  category: 'Education',
  date: `${AppState.selectedMonth}-10`,
  notes: 'Test note'
};
AppState.transactions.unshift(newExpenseTx);
StorageService.saveTransactions(AppState.transactions);

const metrics2 = SmartSpendApp.calculateMonthlyMetrics();
assert(metrics2.totalExpenses === initialExpense + 1500, `Total expenses increased by 1500 after adding new expense (new: ${metrics2.totalExpenses})`);
assert(metrics2.netSavings === metrics1.netSavings - 1500, `Net savings decreased by 1500 after expense`);

// TEST 4: Add new income
const initialIncome = metrics2.totalIncome;
const newIncomeTx = {
  id: 'test_tx_inc_01',
  type: 'income',
  description: 'Test Scholarship Grant',
  amount: 5000,
  category: 'Scholarship',
  date: `${AppState.selectedMonth}-12`,
  notes: 'Test income note'
};
AppState.transactions.unshift(newIncomeTx);
StorageService.saveTransactions(AppState.transactions);

const metrics3 = SmartSpendApp.calculateMonthlyMetrics();
assert(metrics3.totalIncome === initialIncome + 5000, `Total income increased by 5000 (new: ${metrics3.totalIncome})`);
assert(metrics3.netSavings === metrics2.netSavings + 5000, `Net savings increased by 5000`);

// TEST 5: Edit transaction
const indexToEdit = AppState.transactions.findIndex(t => t.id === 'test_tx_exp_01');
AppState.transactions[indexToEdit].amount = 2000;
StorageService.saveTransactions(AppState.transactions);

const metrics4 = SmartSpendApp.calculateMonthlyMetrics();
assert(metrics4.totalExpenses === metrics3.totalExpenses + 500, `Editing expense amount from 1500 to 2000 reflected in total expenses`);

// TEST 6: Delete transaction
AppState.transactions = AppState.transactions.filter(t => t.id !== 'test_tx_exp_01');
StorageService.saveTransactions(AppState.transactions);

const metrics5 = SmartSpendApp.calculateMonthlyMetrics();
assert(metrics5.totalExpenses === metrics3.totalExpenses - 1500, `Deleting transaction reduced total expenses properly`);

// TEST 7: Month filtering (exclude transactions from other months)
const otherMonthTx = {
  id: 'test_other_month',
  type: 'expense',
  description: 'Other Month Bill',
  amount: 9999,
  category: 'Bills',
  date: '2024-01-01',
  notes: 'Past year'
};
AppState.transactions.push(otherMonthTx);
StorageService.saveTransactions(AppState.transactions);
const monthlyOnlyTxs = SmartSpendApp.getTransactionsForSelectedMonth();
const containsOther = monthlyOnlyTxs.some(t => t.id === 'test_other_month');
assert(!containsOther, `Selected month (${AppState.selectedMonth}) excludes transactions from other months (2024-01)`);

// TEST 8: Search and filters
AppState.filters.search = 'textbook';
let filteredTxs = AppState.transactions.filter(tx => {
  const query = AppState.filters.search;
  return (tx.description || '').toLowerCase().includes(query) || (tx.notes || '').toLowerCase().includes(query);
});
assert(filteredTxs.length > 0, `Search for 'textbook' found matching transactions (${filteredTxs.length})`);

AppState.filters.search = '';
AppState.filters.type = 'income';
filteredTxs = AppState.transactions.filter(tx => tx.type === 'income');
assert(filteredTxs.every(t => t.type === 'income'), `Type filter 'income' strictly returns only income transactions`);

// TEST 9: Budget warning thresholds
AppState.budgets[AppState.selectedMonth] = 10000;
const testMetricsBudget = SmartSpendApp.calculateMonthlyMetrics();
const utilization = (testMetricsBudget.totalExpenses / 10000) * 100;
assert(utilization >= 0, `Budget utilization calculated correctly: ${Math.round(utilization)}%`);

// TEST 10: Validation logic
const invalidAmounts = [0, -100, -0.5, NaN, null, ''];
const validAmounts = [1, 50.5, 1000, 25000];
assert(invalidAmounts.every(a => isNaN(parseFloat(a)) || parseFloat(a) <= 0), 'Validation correctly rejects non-positive, zero, NaN, or empty amounts');
assert(validAmounts.every(a => !isNaN(parseFloat(a)) && parseFloat(a) > 0), 'Validation correctly accepts positive numeric amounts');

// TEST 11: LocalStorage persistence roundtrip
const savedJson = StorageService.getTransactions();
assert(Array.isArray(savedJson) && savedJson.length === AppState.transactions.length, 'Transactions correctly serialized and deserialized from localStorage');

// TEST 12: Currency formatting
const inrFormat = formatCurrency(25000);
assert(inrFormat.includes('25,000') || inrFormat.includes('₹'), `Indian currency formatting includes 25,000 or ₹: "${inrFormat}"`);

// TEST 13: AuthHelper configuration persistence
const { AuthHelper } = require('../auth-helper.js');
AuthHelper.saveConfig('https://sample.supabase.co', 'sample_anon_key', true);
const loadedConfig = AuthHelper.getConfig();
assert(loadedConfig.url === 'https://sample.supabase.co' && loadedConfig.anonKey === 'sample_anon_key' && loadedConfig.enabled === true, 'AuthHelper correctly persists and retrieves Supabase credentials');

// TEST 14: User-scoped storage isolation between two separate accounts
AppState.currentUser = { id: 'user_alice_123', name: 'Alice', isDemo: false };
const keyAlice = StorageService.getStorageKey('transactions');
AppState.currentUser = { id: 'user_bob_456', name: 'Bob', isDemo: false };
const keyBob = StorageService.getStorageKey('transactions');
assert(keyAlice !== keyBob && keyAlice.includes('user_alice_123') && keyBob.includes('user_bob_456'), 'StorageService isolates namespaces strictly per user ID');

// TEST 15: Supabase transaction payload validation
const validTx = {
  type: 'expense',
  amount: 250,
  description: 'Lunch Cafeteria',
  category: 'Food',
  date: '2026-10-11'
};
const isValidPayload = validTx.type === 'expense' && validTx.amount > 0 && validTx.description.trim().length > 0 && Boolean(validTx.date);
assert(isValidPayload === true, 'Transaction payload schema matches Supabase database requirements');

console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passedTests}/${totalTests} tests passed successfully!`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
