/* ===================================================================
   RoboKineDynamics Lab — Authentication & Supabase (auth.js)
   Handles user sessions, login/signup, and cloud persistence.
   =================================================================== */

(function () {
  'use strict';

  // ── Configuration ─────────────────────────────────────────────
  const SUPABASE_URL = 'https://rseqgabugjikqnkciobd.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_sHalKAXt5N9wyb9Ig0F7Pw_yYfoE0tf';

  let supabase = null;
  let currentUser = null;

  // ── Initialization ─────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    // Check if placeholders are still present
    if (SUPABASE_URL.includes('YOUR_PROJECT_REF') || SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY')) {
      console.warn('Supabase credentials not configured. Auth features will be disabled.');
      _showSetupWarning();
      return;
    }

    if (window.supabase) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      _checkUser();
    } else {
      console.warn('Supabase CDN not loaded yet. Retrying...');
      setTimeout(() => {
        if (window.supabase) {
          supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
          _checkUser();
        }
      }, 2000);
    }

    _setupAuthUI();
  });

  function _showSetupWarning() {
    const errorMsg = document.getElementById('auth-error');
    if (errorMsg) {
      errorMsg.innerHTML = 'Supabase credentials missing. <a href="#" id="open-setup-guide" style="color:var(--accent-cyan); text-decoration:underline;">How to setup?</a>';
      document.getElementById('open-setup-guide')?.addEventListener('click', (e) => {
        e.preventDefault();
        alert("To enable Login:\n1. Create a project at supabase.com\n2. Copy 'Project URL' and 'Anon Key' from Settings > API\n3. Paste them into scripts/auth.js at lines 12-13.");
      });
    }
    _setupAuthUI(); // Still setup UI so buttons work
  }

  // ── Auth Logic ────────────────────────────────────────────────
  async function _checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;
    _updateUI(user);

    if (!user) {
      _showAuthGate();
    }
    
    // Listen for auth changes
    supabase.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      _updateUI(currentUser);
      if (!currentUser) {
        _showAuthGate();
      }
    });
  }

  function _showAuthGate() {
    const backdrop = document.getElementById('auth-modal-backdrop');
    if (backdrop) {
      backdrop.classList.add('active');
      // Hide the close button in 'Gate' mode to force login
      const closeBtn = document.getElementById('auth-modal-close');
      if (closeBtn) closeBtn.style.display = 'none';
      
      const title = document.getElementById('auth-modal-title');
      if (title) title.textContent = 'Welcome, Researcher. Please Login.';
    }
  }

  async function handleSignUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async function handleSignIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign out error:', error.message);
  }

  // ── UI Integration ─────────────────────────────────────────────
  function _setupAuthUI() {
    const btnLogin = document.getElementById('btn-login-init');
    const authModal = document.getElementById('auth-modal-backdrop');
    const btnClose = document.getElementById('auth-modal-close');
    const authForm = document.getElementById('auth-form');
    const toggleLink = document.getElementById('auth-toggle-mode');
    
    if (btnLogin) btnLogin.addEventListener('click', () => {
      authModal.classList.add('active');
    });

    if (btnClose) btnClose.addEventListener('click', () => {
      authModal.classList.remove('active');
    });

    if (authForm) {
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const submitBtn = authForm.querySelector('button[type="submit"]');
        const errorMsg = document.getElementById('auth-error');
        const isSignUp = authForm.dataset.mode === 'signup';

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Working...';
        errorMsg.textContent = '';

        try {
          if (isSignUp) {
            await handleSignUp(email, password);
            errorMsg.textContent = 'Check your email for confirmation!';
            errorMsg.style.color = 'var(--accent-emerald)';
          } else {
            await handleSignIn(email, password);
            authModal.classList.remove('active');
          }
        } catch (err) {
          errorMsg.textContent = err.message;
          errorMsg.style.color = 'var(--accent-rose)';
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = isSignUp ? 'Create Lab Account' : 'Enter Lab';
        }
      });
    }

    if (toggleLink) {
      toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        const isSignUp = authForm.dataset.mode === 'signup';
        authForm.dataset.mode = isSignUp ? 'signin' : 'signup';
        document.getElementById('auth-modal-title').textContent = isSignUp ? 'Welcome Back, Researcher' : 'Join the Lab';
        authForm.querySelector('button[type="submit"]').textContent = isSignUp ? 'Enter Lab' : 'Create Lab Account';
        toggleLink.textContent = isSignUp ? "Don't have an account? Sign up" : "Already have an account? Login";
      });
    }
  }

  function _updateUI(user) {
    const headerActions = document.querySelector('.header-actions');
    let loginBtn = document.getElementById('btn-login-init');
    let userBadge = document.getElementById('user-profile-badge');

    if (user) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (!userBadge) {
        userBadge = document.createElement('div');
        userBadge.id = 'user-profile-badge';
        userBadge.className = 'user-badge pulse-glow';
        userBadge.innerHTML = `
          <span class="user-icon">👤</span>
          <span class="user-email">${user.email.split('@')[0]}</span>
          <div class="user-dropdown">
            <button id="btn-cloud-save" class="dropdown-item">💾 Save to Cloud</button>
            <button id="btn-cloud-load" class="dropdown-item">📂 Load Lab</button>
            <button id="btn-logout" class="dropdown-item">🚪 Logout</button>
          </div>
        `;
        headerActions.insertBefore(userBadge, headerActions.firstChild);
        
        document.getElementById('btn-logout').addEventListener('click', handleSignOut);
        document.getElementById('btn-cloud-save').addEventListener('click', () => {
            if (window.rkd_save_logic) window.rkd_save_logic();
        });
        document.getElementById('btn-cloud-load').addEventListener('click', () => {
            if (window.rkd_load_logic) window.rkd_load_logic();
        });
      }
      userBadge.style.display = 'flex';
    } else {
      if (loginBtn) loginBtn.style.display = 'flex';
      if (userBadge) userBadge.style.display = 'none';
    }
  }

  // Exposed for UI controller
  window.RKD_Auth = {
    getUser: () => currentUser,
    saveRobotConfig: async (name, configData) => {
      if (!supabase || !currentUser) return { error: 'Not logged in' };
      return await supabase.from('robot_configs').upsert({
        user_id: currentUser.id,
        name: name,
        robot_id: configData.robotId,
        config: configData
      });
    },
    loadUserConfigs: async () => {
      if (!supabase || !currentUser) return [];
      const { data, error } = await supabase
        .from('robot_configs')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      if (error) console.error('Error loading configs:', error);
      return data || [];
    },
    saveTrajectory: async (name, trajectoryData) => {
      if (!supabase || !currentUser) return { error: 'Not logged in' };
      return await supabase.from('trajectories').upsert({
        user_id: currentUser.id,
        name: name,
        data: trajectoryData
      });
    }
  };

})();
