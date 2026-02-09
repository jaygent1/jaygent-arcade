/**
 * JAY GENT ARCADE - Frontend Auth Module
 * Handles Supabase authentication with OAuth + Magic Link
 */

// ============================================
// Configuration (injected by server or set here)
// ============================================

const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

let _supabaseClient = null;
let currentUser = null;
let currentProfile = null;
let authListeners = [];

// ============================================
// Initialize
// ============================================

async function initAuth() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log('Auth not configured - guest mode only');
    return null;
  }

  // Load Supabase client from CDN if not already loaded
  if (!window.supabase?.createClient) {
    await loadSupabaseClient();
  }

  _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Check for existing session
  const { data: { session } } = await _supabaseClient.auth.getSession();
  if (session) {
    await handleAuthChange('SIGNED_IN', session);
  }

  // Listen for auth changes
  _supabaseClient.auth.onAuthStateChange(async (event, session) => {
    await handleAuthChange(event, session);
  });

  return currentUser;
}

async function loadSupabaseClient() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ============================================
// Auth State Management
// ============================================

async function handleAuthChange(event, session) {
  if (event === 'SIGNED_IN' && session) {
    currentUser = session.user;
    currentProfile = await fetchProfile(session.user.id);
    updateAuthUI();
    notifyListeners('signedIn', { user: currentUser, profile: currentProfile });
  } else if (event === 'SIGNED_OUT') {
    currentUser = null;
    currentProfile = null;
    updateAuthUI();
    notifyListeners('signedOut', null);
  }
}

function onAuthChange(callback) {
  authListeners.push(callback);
  // Return unsubscribe function
  return () => {
    authListeners = authListeners.filter(cb => cb !== callback);
  };
}

function notifyListeners(event, data) {
  authListeners.forEach(cb => cb(event, data));
}

// ============================================
// Auth Actions
// ============================================

async function signInWithProvider(provider) {
  if (!_supabaseClient) return { error: 'Auth not configured' };

  const { data, error } = await _supabaseClient.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });

  return { data, error };
}

async function signInWithGoogle() {
  return signInWithProvider('google');
}

async function signInWithGithub() {
  return signInWithProvider('github');
}

async function signInWithFacebook() {
  return signInWithProvider('facebook');
}

async function signInWithTwitter() {
  return signInWithProvider('twitter');
}

async function signInWithMagicLink(email) {
  if (!_supabaseClient) return { error: 'Auth not configured' };

  const { data, error } = await _supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname
    }
  });

  return { data, error };
}

async function signOut() {
  if (!_supabaseClient) return;
  await _supabaseClient.auth.signOut();
}

// ============================================
// Profile Management
// ============================================

async function fetchProfile(userId) {
  if (!_supabaseClient) return null;

  const { data, error } = await _supabaseClient
    .from('profiles')
    .select('*, followers:follows!follows_following_id_fkey(count), following:follows!follows_follower_id_fkey(count)')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Failed to fetch profile:', error);
    return null;
  }

  return {
    ...data,
    followerCount: data.followers?.[0]?.count || 0,
    followingCount: data.following?.[0]?.count || 0
  };
}

async function updateProfile(updates) {
  if (!_supabaseClient || !currentUser) return { error: 'Not signed in' };

  const { data, error } = await _supabaseClient
    .from('profiles')
    .update(updates)
    .eq('id', currentUser.id)
    .select()
    .single();

  if (!error) {
    currentProfile = { ...currentProfile, ...data };
    updateAuthUI();
  }

  return { data, error };
}

async function getPublicProfile(username) {
  if (!_supabaseClient) return null;

  const { data } = await _supabaseClient
    .from('profiles')
    .select('*, followers:follows!follows_following_id_fkey(count), following:follows!follows_follower_id_fkey(count)')
    .eq('username', username)
    .single();

  if (data) {
    data.followerCount = data.followers?.[0]?.count || 0;
    data.followingCount = data.following?.[0]?.count || 0;
  }

  return data;
}

// ============================================
// Follow System
// ============================================

async function followUser(targetUserId) {
  if (!_supabaseClient || !currentUser) return { error: 'Not signed in' };

  const { error } = await _supabaseClient
    .from('follows')
    .insert({ follower_id: currentUser.id, following_id: targetUserId });

  return { success: !error, error };
}

async function unfollowUser(targetUserId) {
  if (!_supabaseClient || !currentUser) return { error: 'Not signed in' };

  const { error } = await _supabaseClient
    .from('follows')
    .delete()
    .eq('follower_id', currentUser.id)
    .eq('following_id', targetUserId);

  return { success: !error, error };
}

async function isFollowing(targetUserId) {
  if (!_supabaseClient || !currentUser) return false;

  const { data } = await _supabaseClient
    .from('follows')
    .select('follower_id')
    .eq('follower_id', currentUser.id)
    .eq('following_id', targetUserId)
    .single();

  return !!data;
}

async function getFollowers(userId, limit = 50) {
  if (!_supabaseClient) return [];

  const { data } = await _supabaseClient
    .from('follows')
    .select('profiles!follows_follower_id_fkey(id, username, display_name, avatar_url)')
    .eq('following_id', userId)
    .limit(limit);

  return data?.map(f => f.profiles) || [];
}

async function getFollowing(userId, limit = 50) {
  if (!_supabaseClient) return [];

  const { data } = await _supabaseClient
    .from('follows')
    .select('profiles!follows_following_id_fkey(id, username, display_name, avatar_url)')
    .eq('follower_id', userId)
    .limit(limit);

  return data?.map(f => f.profiles) || [];
}

// ============================================
// Feed (scores from followed users)
// ============================================

async function getFollowingFeed(limit = 50) {
  if (!_supabaseClient || !currentUser) return [];

  // First get who we follow
  const { data: follows } = await _supabaseClient
    .from('follows')
    .select('following_id')
    .eq('follower_id', currentUser.id);

  if (!follows?.length) return [];

  const followingIds = follows.map(f => f.following_id);

  // Get their scores
  const { data } = await _supabaseClient
    .from('scores')
    .select('*, profiles!scores_user_id_fkey(id, username, display_name, avatar_url)')
    .in('user_id', followingIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

// ============================================
// Score Submission (with auth)
// ============================================

async function submitScore(score, wave, game = 'void-rush', playerType = 'HUMAN') {
  // Always submit to server - server handles Supabase
  const payload = {
    score,
    wave,
    game,
    playerType
  };

  // If logged in, include auth token
  const headers = { 'Content-Type': 'application/json' };
  
  if (_supabaseClient && currentUser) {
    const { data: { session } } = await _supabaseClient.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } else {
    // Guest mode - include 3-letter name
    payload.name = localStorage.getItem('arcade_name') || 'AAA';
  }

  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    console.error('Score submit failed:', e);
    return { error: e.message };
  }
}

// ============================================
// UI Helpers
// ============================================

function updateAuthUI() {
  const userMenu = document.getElementById('userMenu');
  const loginBtn = document.getElementById('loginBtn');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');

  if (currentUser && currentProfile) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (userMenu) userMenu.style.display = 'flex';
    if (userAvatar) {
      userAvatar.src = currentProfile.avatar_url || defaultAvatar(currentProfile.username);
      userAvatar.alt = currentProfile.username;
    }
    if (userName) userName.textContent = currentProfile.display_name || currentProfile.username;
  } else {
    if (loginBtn) loginBtn.style.display = 'flex';
    if (userMenu) userMenu.style.display = 'none';
  }
}

function defaultAvatar(username) {
  // Generate a fun default avatar URL
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`;
}

function showLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.style.display = 'flex';
}

function hideLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.style.display = 'none';
}

// ============================================
// Render Login Modal HTML
// ============================================

function renderLoginModal() {
  const existing = document.getElementById('loginModal');
  if (existing) return;

  const modal = document.createElement('div');
  modal.id = 'loginModal';
  modal.className = 'auth-modal';
  modal.innerHTML = `
    <div class="auth-modal-content">
      <button class="auth-modal-close" onclick="hideLoginModal()">&times;</button>
      <h2>🎩 Sign In</h2>
      <p class="auth-subtitle">Join the arena. Track your scores. Follow players.</p>
      
      <div class="auth-providers">
        <button class="auth-btn google" onclick="signInWithGoogle()">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
        
        <button class="auth-btn github" onclick="signInWithGithub()">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          Continue with GitHub
        </button>
        
        <button class="auth-btn twitter" onclick="signInWithTwitter()">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          Continue with X
        </button>
        
        <button class="auth-btn facebook" onclick="signInWithFacebook()">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          Continue with Facebook
        </button>
      </div>
      
      <div class="auth-divider"><span>or</span></div>
      
      <form class="auth-magic-link" onsubmit="handleMagicLink(event)">
        <input type="email" id="magicLinkEmail" placeholder="Enter your email" required>
        <button type="submit">Send Magic Link ✨</button>
      </form>
      
      <p class="auth-footer">No password needed. We'll email you a login link.</p>
    </div>
  `;
  
  document.body.appendChild(modal);
}

async function handleMagicLink(e) {
  e.preventDefault();
  const email = document.getElementById('magicLinkEmail').value;
  const btn = e.target.querySelector('button');
  
  btn.disabled = true;
  btn.textContent = 'Sending...';
  
  const { error } = await signInWithMagicLink(email);
  
  if (error) {
    alert('Failed to send magic link: ' + error.message);
    btn.disabled = false;
    btn.textContent = 'Send Magic Link ✨';
  } else {
    btn.textContent = 'Check your email! 📧';
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Send Magic Link ✨';
    }, 5000);
  }
}

// ============================================
// Auth Modal Styles
// ============================================

function injectAuthStyles() {
  if (document.getElementById('authStyles')) return;
  
  const style = document.createElement('style');
  style.id = 'authStyles';
  style.textContent = `
    .auth-modal {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.85);
      z-index: 10000;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }
    
    .auth-modal-content {
      background: #0a0a15;
      border: 1px solid #1a1a2e;
      border-radius: 16px;
      padding: 40px;
      max-width: 400px;
      width: 90%;
      position: relative;
      animation: authSlideIn 0.3s ease;
    }
    
    @keyframes authSlideIn {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .auth-modal-close {
      position: absolute;
      top: 15px; right: 20px;
      background: none;
      border: none;
      color: #666;
      font-size: 24px;
      cursor: pointer;
    }
    
    .auth-modal-close:hover { color: #fff; }
    
    .auth-modal h2 {
      margin: 0 0 8px;
      font-size: 1.8rem;
      color: #00ffaa;
    }
    
    .auth-subtitle {
      color: #666;
      margin-bottom: 30px;
    }
    
    .auth-providers {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .auth-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 14px 20px;
      border: 1px solid #2a2a3e;
      border-radius: 8px;
      background: #0f0f1a;
      color: #e0e0e0;
      font-family: inherit;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .auth-btn:hover {
      border-color: #00ffaa;
      background: #151525;
    }
    
    .auth-btn.google:hover { border-color: #4285f4; }
    .auth-btn.github:hover { border-color: #fff; }
    .auth-btn.twitter:hover { border-color: #1da1f2; }
    .auth-btn.facebook:hover { border-color: #1877f2; }
    
    .auth-divider {
      display: flex;
      align-items: center;
      margin: 25px 0;
      color: #444;
    }
    
    .auth-divider::before,
    .auth-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #2a2a3e;
    }
    
    .auth-divider span {
      padding: 0 15px;
      font-size: 0.85rem;
    }
    
    .auth-magic-link {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    
    .auth-magic-link input {
      flex: 1 1 200px;
      min-width: 0;
      padding: 14px 16px;
      background: #050510;
      border: 1px solid #2a2a3e;
      border-radius: 8px;
      color: #fff;
      font-family: inherit;
      font-size: 1rem;
    }
    
    .auth-magic-link input:focus {
      outline: none;
      border-color: #00ffaa;
    }
    
    .auth-magic-link button {
      flex: 0 0 auto;
      padding: 14px 20px;
      background: linear-gradient(135deg, #00ffaa, #00cc88);
      border: none;
      border-radius: 8px;
      color: #000;
      font-family: inherit;
      font-weight: bold;
      cursor: pointer;
      white-space: nowrap;
      transition: transform 0.2s;
    }
    
    .auth-magic-link button:hover {
      transform: scale(1.02);
    }
    
    .auth-magic-link button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    
    @media (max-width: 480px) {
      .auth-magic-link {
        flex-direction: column;
      }
      .auth-magic-link input,
      .auth-magic-link button {
        width: 100%;
      }
    }
    
    .auth-footer {
      margin-top: 20px;
      font-size: 0.8rem;
      color: #555;
      text-align: center;
    }
    
    /* User menu styles */
    #userMenu {
      display: none;
      align-items: center;
      gap: 10px;
      cursor: pointer;
    }
    
    #userAvatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid #00ffaa;
    }
    
    #userName {
      color: #e0e0e0;
      font-size: 0.9rem;
    }
    
    #loginBtn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: transparent;
      border: 1px solid #00ffaa;
      border-radius: 6px;
      color: #00ffaa;
      font-family: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    #loginBtn:hover {
      background: #00ffaa;
      color: #000;
    }
  `;
  
  document.head.appendChild(style);
}

// ============================================
// Auto-initialize
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  injectAuthStyles();
  renderLoginModal();
  initAuth();
});

// Export for global access
window.ArcadeAuth = {
  init: initAuth,
  signInWithGoogle,
  signInWithGithub,
  signInWithFacebook,
  signInWithTwitter,
  signInWithMagicLink,
  signOut,
  getUser: () => currentUser,
  getProfile: () => currentProfile,
  updateProfile,
  followUser,
  unfollowUser,
  isFollowing,
  getFollowers,
  getFollowing,
  getFollowingFeed,
  submitScore,
  showLoginModal,
  hideLoginModal,
  onAuthChange
};
