/**
 * Supabase Client Configuration
 * Used by both server (auth verification) and can be imported by frontend
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Server-side only

// Validate required env vars
function validateConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('⚠️  Supabase not configured - auth features disabled');
    console.warn('   Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables');
    return false;
  }
  return true;
}

const isConfigured = validateConfig();

// ============================================
// Server-side Supabase client (with service key)
// ============================================

let supabaseAdmin = null;

if (isConfigured && SUPABASE_SERVICE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

// ============================================
// JWT Verification (for API auth)
// ============================================

async function verifyToken(token) {
  if (!supabaseAdmin) return null;
  
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch (e) {
    console.error('Token verification failed:', e.message);
    return null;
  }
}

// ============================================
// Auth Middleware for Express-style handlers
// ============================================

async function authMiddleware(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.slice(7);
  return await verifyToken(token);
}

// ============================================
// Profile Helpers
// ============================================

async function getProfile(userId) {
  if (!supabaseAdmin) return null;
  
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
    
  return error ? null : data;
}

async function getProfileByUsername(username) {
  if (!supabaseAdmin) return null;
  
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('username', username.toLowerCase())
    .single();
    
  return error ? null : data;
}

async function updateProfile(userId, updates) {
  if (!supabaseAdmin) return { error: 'Not configured' };
  
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
    
  return { data, error };
}

// ============================================
// Follow Helpers
// ============================================

async function followUser(followerId, targetId) {
  if (!supabaseAdmin) return { error: 'Not configured' };
  
  const { error } = await supabaseAdmin
    .from('follows')
    .insert({ follower_id: followerId, following_id: targetId });
    
  return { success: !error, error };
}

async function unfollowUser(followerId, targetId) {
  if (!supabaseAdmin) return { error: 'Not configured' };
  
  const { error } = await supabaseAdmin
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', targetId);
    
  return { success: !error, error };
}

async function getFollowers(userId, limit = 50) {
  if (!supabaseAdmin) return [];
  
  const { data } = await supabaseAdmin
    .from('follows')
    .select('follower_id, profiles!follows_follower_id_fkey(id, username, display_name, avatar_url)')
    .eq('following_id', userId)
    .limit(limit);
    
  return data?.map(f => f.profiles) || [];
}

async function getFollowing(userId, limit = 50) {
  if (!supabaseAdmin) return [];
  
  const { data } = await supabaseAdmin
    .from('follows')
    .select('following_id, profiles!follows_following_id_fkey(id, username, display_name, avatar_url)')
    .eq('follower_id', userId)
    .limit(limit);
    
  return data?.map(f => f.profiles) || [];
}

async function isFollowing(followerId, targetId) {
  if (!supabaseAdmin) return false;
  
  const { data } = await supabaseAdmin
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', targetId)
    .single();
    
  return !!data;
}

async function getFollowCounts(userId) {
  if (!supabaseAdmin) return { followers: 0, following: 0 };
  
  const [{ count: followers }, { count: following }] = await Promise.all([
    supabaseAdmin.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
    supabaseAdmin.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
  ]);
  
  return { followers: followers || 0, following: following || 0 };
}

// ============================================
// Score Helpers (updated for auth)
// ============================================

async function submitScore(scoreData) {
  if (!supabaseAdmin) return { error: 'Not configured' };
  
  const { data, error } = await supabaseAdmin
    .from('scores')
    .insert(scoreData)
    .select()
    .single();
    
  return { data, error };
}

async function getLeaderboard(game = 'void-rush', limit = 100) {
  if (!supabaseAdmin) return [];
  
  const { data } = await supabaseAdmin
    .from('leaderboard')
    .select('*')
    .eq('game', game)
    .limit(limit);
    
  return data || [];
}

async function getFollowingFeed(userId, limit = 50) {
  if (!supabaseAdmin) return [];
  
  // Get scores from people the user follows
  const { data } = await supabaseAdmin
    .from('scores')
    .select(`
      *,
      profiles!scores_user_id_fkey(id, username, display_name, avatar_url)
    `)
    .in('user_id', 
      supabaseAdmin.from('follows').select('following_id').eq('follower_id', userId)
    )
    .order('created_at', { ascending: false })
    .limit(limit);
    
  return data || [];
}

// ============================================
// Exports
// ============================================

module.exports = {
  isConfigured,
  supabaseAdmin,
  verifyToken,
  authMiddleware,
  // Profiles
  getProfile,
  getProfileByUsername,
  updateProfile,
  // Follows
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  isFollowing,
  getFollowCounts,
  // Scores
  submitScore,
  getLeaderboard,
  getFollowingFeed,
  // Config for frontend
  config: {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY
  }
};
