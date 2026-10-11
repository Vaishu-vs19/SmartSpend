/**
 * ===================================================================
 * SMARTSPEND — AUTH HELPER & SESSION CONTROLLER
 * Shared Authentication Utilities for Dedicated Auth Pages & Dashboard
 * ===================================================================
 */

'use strict';

const AuthHelper = {
  CONFIG_KEY: 'smartspend_supabase_config',
  SESSION_USER_KEY: 'smartspend_session_user',

  getConfig() {
    try {
      const stored = localStorage.getItem(this.CONFIG_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed reading Supabase config', e);
    }
    return {
      url: '',
      anonKey: '',
      enabled: false
    };
  },

  saveConfig(url, anonKey, enabled = true) {
    const config = {
      url: (url || '').trim(),
      anonKey: (anonKey || '').trim(),
      enabled: Boolean(enabled)
    };
    try {
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(config));
    } catch (e) {}
    return config;
  },

  getClient() {
    const config = this.getConfig();
    if (!config.url || !config.anonKey) {
      return null;
    }
    if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        if (!window.__smartspend_supabase_client) {
          window.__smartspend_supabase_client = window.supabase.createClient(config.url, config.anonKey);
        }
        return window.__smartspend_supabase_client;
      } catch (err) {
        console.error('Failed to create Supabase client:', err);
      }
    }
    return null;
  },

  async getSession() {
    const client = this.getClient();
    if (!client) return null;
    try {
      const { data: { session }, error } = await client.auth.getSession();
      if (error || !session) return null;
      return session;
    } catch (e) {
      return null;
    }
  },

  async getCurrentUser() {
    const client = this.getClient();
    if (!client) return null;
    try {
      const { data: { user }, error } = await client.auth.getUser();
      if (error || !user) return null;
      return user;
    } catch (e) {
      return null;
    }
  },

  async handleAuthCallback() {
    const client = this.getClient();
    if (!client || typeof window === 'undefined') return { handled: false };

    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (error) {
        return {
          handled: true,
          success: false,
          message: errorDescription || error || 'Email confirmation failed or link expired.'
        };
      }

      // If PKCE exchange code is in query parameter
      if (code) {
        const { data, error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          return {
            handled: true,
            success: false,
            message: exchangeError.message || 'Failed to verify email confirmation code.'
          };
        }

        if (data && data.user) {
          const fullName = data.user.user_metadata?.full_name || (data.user.email ? data.user.email.split('@')[0] : 'SmartSpend User');
          try {
            await client.from('profiles').upsert({
              id: data.user.id,
              full_name: fullName,
              email: data.user.email
            }, { onConflict: 'id' });
          } catch (e) {}

          const userObj = {
            id: data.user.id,
            name: fullName,
            email: data.user.email,
            isDemo: false,
            isCloud: true
          };

          try {
            localStorage.setItem(this.SESSION_USER_KEY, JSON.stringify(userObj));
          } catch (e) {}

          return {
            handled: true,
            success: true,
            user: userObj,
            session: data.session,
            message: 'Email confirmed successfully! Signing you in...'
          };
        }
      }

      // If token arrived via URL hash (implicit grant)
      if (window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('type=signup'))) {
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (session && session.user) {
          const fullName = session.user.user_metadata?.full_name || (session.user.email ? session.user.email.split('@')[0] : 'SmartSpend User');
          const userObj = {
            id: session.user.id,
            name: fullName,
            email: session.user.email,
            isDemo: false,
            isCloud: true
          };
          try {
            localStorage.setItem(this.SESSION_USER_KEY, JSON.stringify(userObj));
          } catch (e) {}

          return {
            handled: true,
            success: true,
            user: userObj,
            session: session,
            message: 'Email verified successfully! Signing you in...'
          };
        }
      }
    } catch (err) {
      console.warn('Auth callback handling error:', err);
    }

    return { handled: false };
  },

  async resendConfirmation(email) {
    const client = this.getClient();
    if (!client) {
      return { success: false, message: 'Supabase project credentials not configured.' };
    }
    try {
      const redirectUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'login.html';
      const { error } = await client.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: redirectUrl
        }
      });
      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: 'Confirmation link sent! Please check your inbox and spam folder.' };
    } catch (err) {
      return { success: false, message: err.message || 'Failed to resend confirmation email.' };
    }
  },

  async checkAuthAndRedirect({ requiresAuth = false, redirectIfAuth = false }) {
    const session = await this.getSession();
    if (redirectIfAuth && session) {
      window.location.replace('index.html');
      return session;
    }
    if (requiresAuth && !session) {
      window.location.replace('login.html');
      return null;
    }
    return session;
  },

  async login(email, password) {
    const client = this.getClient();
    if (!client) {
      return { 
        success: false, 
        message: 'Supabase project credentials not configured. Please enter your Project URL and Anon key in the Project Connection drawer below.' 
      };
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        return { success: false, message: error.message };
      }

      if (data && data.user) {
        // Ensure profile exists in profiles table
        const fullName = data.user.user_metadata?.full_name || (data.user.email ? data.user.email.split('@')[0] : 'SmartSpend User');
        try {
          await client.from('profiles').upsert({
            id: data.user.id,
            full_name: fullName,
            email: data.user.email
          }, { onConflict: 'id' });
        } catch (e) {}

        const userObj = {
          id: data.user.id,
          name: fullName,
          email: data.user.email,
          isDemo: false,
          isCloud: true
        };

        try {
          localStorage.setItem(this.SESSION_USER_KEY, JSON.stringify(userObj));
        } catch (e) {}

        return { success: true, user: userObj, session: data.session };
      }

      return { success: false, message: 'Unexpected response from Supabase authentication.' };
    } catch (err) {
      return { success: false, message: err.message || 'Authentication request failed' };
    }
  },

  async register(name, email, password) {
    const client = this.getClient();
    if (!client) {
      return { 
        success: false, 
        message: 'Supabase project credentials not configured. Please enter your Project URL and Anon key below.' 
      };
    }

    try {
      const redirectUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'login.html';
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: name.trim()
          }
        }
      });

      if (error) {
        return { success: false, message: error.message };
      }

      if (data && data.user) {
        // Check if email confirmation is required (session will be null if email confirm is turned on in Supabase)
        const needsConfirmation = !data.session;

        // Try ensuring profile row
        try {
          await client.from('profiles').upsert({
            id: data.user.id,
            full_name: name.trim(),
            email: data.user.email,
            currency: 'INR',
            theme: 'light',
            opening_balance: 0
          }, { onConflict: 'id' });
        } catch (e) {}

        const userObj = {
          id: data.user.id,
          name: name.trim(),
          email: data.user.email,
          isDemo: false,
          isCloud: true
        };

        if (!needsConfirmation) {
          try {
            localStorage.setItem(this.SESSION_USER_KEY, JSON.stringify(userObj));
          } catch (e) {}
        }

        return { 
          success: true, 
          user: userObj, 
          session: data.session,
          needsConfirmation: needsConfirmation
        };
      }

      return { success: false, message: 'Registration response was empty.' };
    } catch (err) {
      return { success: false, message: err.message || 'Registration request failed' };
    }
  },

  async requestPasswordReset(email) {
    const client = this.getClient();
    if (!client) {
      return { success: false, message: 'Supabase project is not configured.' };
    }

    try {
      const redirectUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'reset-password.html';
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl
      });

      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message || 'Failed to send password reset email' };
    }
  },

  async updatePassword(newPassword) {
    const client = this.getClient();
    if (!client) {
      return { success: false, message: 'Supabase project is not configured.' };
    }

    try {
      const { error } = await client.auth.updateUser({
        password: newPassword
      });

      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message || 'Failed to update password' };
    }
  },

  async logout() {
    const client = this.getClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (e) {
        console.warn('Sign out error:', e);
      }
    }
    try {
      localStorage.removeItem(this.SESSION_USER_KEY);
    } catch (e) {}
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AuthHelper };
}
