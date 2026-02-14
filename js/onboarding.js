/**
 * JAY GENT ARCADE - First Time User Experience
 * Handles welcome flow, tutorials, and progressive onboarding
 */

// ============================================
// State Management
// ============================================

const ONBOARDING_KEY = 'jaygent_onboarding';

function getOnboardingState() {
  try {
    return JSON.parse(localStorage.getItem(ONBOARDING_KEY)) || {};
  } catch {
    return {};
  }
}

function saveOnboardingState(updates) {
  const state = { ...getOnboardingState(), ...updates };
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state));
  return state;
}

function hasSeenWelcome() {
  return getOnboardingState().welcomeSeen === true;
}

function hasPlayedGame() {
  return getOnboardingState().gamesPlayed > 0;
}

function hasSetName() {
  return !!localStorage.getItem('arcade_name') || !!window.ArcadeAuth?.getUser();
}

// ============================================
// Welcome Modal (First Visit)
// ============================================

function showWelcomeModal() {
  if (hasSeenWelcome()) return;
  
  const modal = document.createElement('div');
  modal.id = 'welcomeModal';
  modal.className = 'onboarding-modal';
  modal.innerHTML = `
    <div class="onboarding-content welcome-content">
      <div class="welcome-header">
        <span class="welcome-emoji">🎩</span>
        <h1>Welcome to Jay Gent</h1>
      </div>
      
      <p class="welcome-tagline">The AI-powered gaming arena</p>
      
      <div class="welcome-features">
        <div class="welcome-feature">
          <span class="feature-icon">🎮</span>
          <div>
            <strong>Classic Games, Modern Twist</strong>
            <p>Space shooters, brick breakers, and more — reimagined</p>
          </div>
        </div>
        
        <div class="welcome-feature">
          <span class="feature-icon">🤖</span>
          <div>
            <strong>Challenge AI Opponents</strong>
            <p>Watch AI agents play and try to beat their scores</p>
          </div>
        </div>
        
        <div class="welcome-feature">
          <span class="feature-icon">🏆</span>
          <div>
            <strong>Climb the Leaderboard</strong>
            <p>Compete globally and take on daily challenges</p>
          </div>
        </div>
        
        <div class="welcome-feature">
          <span class="feature-icon">👥</span>
          <div>
            <strong>Follow Players</strong>
            <p>Track your rivals and see their latest scores</p>
          </div>
        </div>
      </div>
      
      <div class="welcome-actions">
        <button class="welcome-btn primary" onclick="dismissWelcome(); window.location.href='/void-rush.html'">
          🚀 Play Now
        </button>
        <button class="welcome-btn secondary" onclick="dismissWelcome(); showLoginModal?.()">
          Sign Up
        </button>
      </div>
      
      <button class="welcome-skip" onclick="dismissWelcome()">
        Just browsing →
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Animate in
  requestAnimationFrame(() => {
    modal.classList.add('visible');
  });
}

function dismissWelcome() {
  saveOnboardingState({ welcomeSeen: true, welcomeSeenAt: Date.now() });
  const modal = document.getElementById('welcomeModal');
  if (modal) {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
  }
}

// ============================================
// Game Tutorial Overlay
// ============================================

function showGameTutorial(gameId = 'void-rush') {
  const state = getOnboardingState();
  const tutorialKey = `tutorial_${gameId}`;
  
  if (state[tutorialKey]) return; // Already seen
  
  const tutorials = {
    'void-rush': {
      title: 'VOID RUSH',
      controls: [
        { keys: ['W', 'A', 'S', 'D'], label: 'Move your ship' },
        { keys: ['SPACE'], label: 'Fire weapons' },
        { keys: ['B'], label: 'Deploy bomb (clears screen)' }
      ],
      tips: [
        'Collect power-ups to upgrade weapons',
        'Survive waves to face the boss',
        'Bombs are limited — use wisely!'
      ]
    },
    'breaker': {
      title: 'BREAKER',
      controls: [
        { keys: ['←', '→'], label: 'Move paddle' },
        { keys: ['SPACE'], label: 'Launch ball' }
      ],
      tips: [
        'Don\'t let the ball fall!',
        'Break all bricks to advance',
        'Some power-ups change ball behavior'
      ]
    },
    'snake': {
      title: 'NEON SNAKE',
      controls: [
        { keys: ['W', 'A', 'S', 'D'], label: 'Change direction' }
      ],
      tips: [
        'Eat food to grow longer',
        'Don\'t hit yourself!',
        'Speed increases as you grow'
      ]
    },
    'asteroids': {
      title: 'ASTEROID FIELD',
      controls: [
        { keys: ['←', '→'], label: 'Rotate ship' },
        { keys: ['↑'], label: 'Thrust forward' },
        { keys: ['SPACE'], label: 'Shoot' },
        { keys: ['SHIFT'], label: 'Hyperspace (risky!)' }
      ],
      tips: [
        'Large asteroids split into smaller ones',
        'Smaller asteroids = more points',
        'Hyperspace teleports randomly (10% explosion risk)'
      ]
    },
    'gridrunner': {
      title: 'GRID RUNNER',
      controls: [
        { keys: ['W', 'A', 'S', 'D'], label: 'Change direction' }
      ],
      tips: [
        'Leave a trail behind you',
        'Don\'t crash into walls or trails',
        'Outlast the AI opponent to win!'
      ]
    },
    'tetris': {
      title: 'STACK ATTACK',
      controls: [
        { keys: ['←', '→'], label: 'Move piece' },
        { keys: ['↑'], label: 'Rotate' },
        { keys: ['↓'], label: 'Soft drop' },
        { keys: ['SPACE'], label: 'Hard drop' },
        { keys: ['C'], label: 'Hold piece' }
      ],
      tips: [
        'Clear lines to score points',
        'Clear 4 lines at once for a Tetris bonus',
        'Speed increases every 10 lines'
      ]
    },
    'pong': {
      title: 'CYBER PONG',
      controls: [
        { keys: ['W', 'S'], label: 'Move paddle up/down' },
        { keys: ['SPACE'], label: 'Serve ball' }
      ],
      tips: [
        'Hit with paddle edge for angled shots',
        'Ball speeds up each rally',
        'First to 11 points wins!'
      ]
    },
    'invaders': {
      title: 'SPACE INVADERS',
      controls: [
        { keys: ['←', '→'], label: 'Move ship' },
        { keys: ['SPACE'], label: 'Fire' }
      ],
      tips: [
        'Clear all invaders before they reach you',
        'Smaller invaders = more points',
        'Watch for the bonus UFO!'
      ]
    },
    'flappy': {
      title: 'NEON FLAP',
      controls: [
        { keys: ['SPACE'], label: 'Flap wings' },
        { keys: ['TAP'], label: 'Touch to flap' }
      ],
      tips: [
        'Time your flaps carefully',
        'Don\'t hit the pipes or ground',
        'Stay calm — it\'s all about rhythm'
      ]
    }
  };
  
  const tutorial = tutorials[gameId];
  if (!tutorial) return;
  
  const overlay = document.createElement('div');
  overlay.id = 'tutorialOverlay';
  overlay.className = 'tutorial-overlay';
  overlay.innerHTML = `
    <div class="tutorial-content">
      <h2>${tutorial.title}</h2>
      
      <div class="tutorial-controls">
        ${tutorial.controls.map(c => `
          <div class="tutorial-control">
            <div class="tutorial-keys">
              ${c.keys.map(k => `<span class="tutorial-key">${k}</span>`).join('')}
            </div>
            <span class="tutorial-label">${c.label}</span>
          </div>
        `).join('')}
      </div>
      
      <div class="tutorial-tips">
        ${tutorial.tips.map(t => `<p>💡 ${t}</p>`).join('')}
      </div>
      
      <p class="tutorial-start">Press any key to start</p>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });
  
  // Dismiss on any key or click
  const dismiss = () => {
    saveOnboardingState({ [tutorialKey]: true });
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
    document.removeEventListener('keydown', dismiss);
    document.removeEventListener('click', dismiss);
  };
  
  // Small delay before allowing dismiss
  setTimeout(() => {
    document.addEventListener('keydown', dismiss, { once: true });
    document.addEventListener('click', dismiss, { once: true });
  }, 500);
}

// ============================================
// Name Setup Flow
// ============================================

function promptForName(callback) {
  // If already has name or is logged in, skip
  if (hasSetName()) {
    callback?.(localStorage.getItem('arcade_name') || window.ArcadeAuth?.getProfile()?.username);
    return;
  }
  
  const modal = document.createElement('div');
  modal.id = 'nameModal';
  modal.className = 'onboarding-modal';
  modal.innerHTML = `
    <div class="onboarding-content name-content">
      <h2>🏆 Nice Score!</h2>
      <p>Enter your initials for the leaderboard:</p>
      
      <div class="name-input-container">
        <input 
          type="text" 
          id="nameInput" 
          maxlength="3" 
          placeholder="AAA"
          autocomplete="off"
          autofocus
        >
      </div>
      
      <button class="welcome-btn primary" id="nameSubmitBtn">
        Save & Submit Score
      </button>
      
      <div class="name-signup-prompt">
        <p>Want a full profile with avatar?</p>
        <button class="welcome-btn secondary" onclick="hideNameModal(); showLoginModal?.()">
          Sign Up Instead
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const input = document.getElementById('nameInput');
  const submitBtn = document.getElementById('nameSubmitBtn');
  
  // Auto-uppercase and filter
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  
  // Submit on enter or button click
  const submit = () => {
    const name = input.value.trim().padEnd(3, ' ').slice(0, 3);
    if (name.trim()) {
      localStorage.setItem('arcade_name', name);
      hideNameModal();
      callback?.(name);
    }
  };
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  
  submitBtn.addEventListener('click', submit);
  
  // Animate in and focus
  requestAnimationFrame(() => {
    modal.classList.add('visible');
    input.focus();
  });
}

function hideNameModal() {
  const modal = document.getElementById('nameModal');
  if (modal) {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
  }
}

// ============================================
// Post-Game Celebrations
// ============================================

function celebrateFirstScore(score, wave) {
  const state = getOnboardingState();
  if (state.firstScoreCelebrated) return;
  
  saveOnboardingState({ firstScoreCelebrated: true });
  
  // Create celebration overlay
  const overlay = document.createElement('div');
  overlay.id = 'celebrationOverlay';
  overlay.className = 'celebration-overlay';
  overlay.innerHTML = `
    <div class="celebration-content">
      <div class="celebration-emoji">🎉</div>
      <h2>First Score!</h2>
      <p class="celebration-score">${score.toLocaleString()} pts</p>
      <p class="celebration-wave">Wave ${wave}</p>
      <p class="celebration-msg">You're officially in the arena!</p>
      <button class="welcome-btn primary" onclick="dismissCelebration()">Let's Go!</button>
    </div>
  `;
  
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

function dismissCelebration() {
  const overlay = document.getElementById('celebrationOverlay');
  if (overlay) {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  }
}

function suggestDailyChallenge() {
  const state = getOnboardingState();
  if (state.dailyChallengeSuggested) return;
  if ((state.gamesPlayed || 0) < 2) return; // Wait for 2nd game
  
  saveOnboardingState({ dailyChallengeSuggested: true });
  
  // Could show a toast or highlight the daily challenge section
  const challengeCard = document.querySelector('.daily-challenge');
  if (challengeCard) {
    challengeCard.classList.add('highlight-pulse');
    setTimeout(() => challengeCard.classList.remove('highlight-pulse'), 3000);
  }
}

// ============================================
// Track Game Plays
// ============================================

function trackGameStart(gameId) {
  const state = getOnboardingState();
  saveOnboardingState({
    gamesPlayed: (state.gamesPlayed || 0) + 1,
    lastGamePlayed: gameId,
    lastPlayedAt: Date.now()
  });
}

function trackGameEnd(gameId, score, wave) {
  const state = getOnboardingState();
  const bestKey = `best_${gameId}`;
  const currentBest = state[bestKey] || 0;
  
  const updates = {
    totalScore: (state.totalScore || 0) + score,
    lastScore: score,
    lastWave: wave
  };
  
  if (score > currentBest) {
    updates[bestKey] = score;
    updates.newPersonalBest = true;
  }
  
  saveOnboardingState(updates);
  
  // Trigger celebrations
  if (!state.firstScoreCelebrated && score > 0) {
    celebrateFirstScore(score, wave);
  }
  
  suggestDailyChallenge();
}

// ============================================
// Styles
// ============================================

function injectOnboardingStyles() {
  if (document.getElementById('onboardingStyles')) return;
  
  const style = document.createElement('style');
  style.id = 'onboardingStyles';
  style.textContent = `
    /* Modal Base */
    .onboarding-modal {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(3, 3, 10, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
      backdrop-filter: blur(8px);
    }
    
    .onboarding-modal.visible {
      opacity: 1;
    }
    
    .onboarding-content {
      background: linear-gradient(135deg, #0a0a15 0%, #0f0f1a 100%);
      border: 1px solid #1a1a2e;
      border-radius: 20px;
      padding: 40px;
      max-width: 500px;
      width: 90%;
      text-align: center;
      transform: scale(0.9) translateY(20px);
      transition: transform 0.3s ease;
    }
    
    .onboarding-modal.visible .onboarding-content {
      transform: scale(1) translateY(0);
    }
    
    /* Welcome Modal */
    .welcome-header {
      margin-bottom: 10px;
    }
    
    .welcome-emoji {
      font-size: 4rem;
      display: block;
      margin-bottom: 10px;
      animation: welcomeBounce 0.6s ease;
    }
    
    @keyframes welcomeBounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    
    .welcome-content h1 {
      font-size: 2rem;
      color: #00ffaa;
      margin: 0;
    }
    
    .welcome-tagline {
      color: #666;
      margin-bottom: 30px;
    }
    
    .welcome-features {
      text-align: left;
      margin-bottom: 30px;
    }
    
    .welcome-feature {
      display: flex;
      align-items: flex-start;
      gap: 15px;
      padding: 12px 0;
      border-bottom: 1px solid #1a1a2e;
    }
    
    .welcome-feature:last-child {
      border-bottom: none;
    }
    
    .feature-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
    }
    
    .welcome-feature strong {
      color: #e0e0e0;
      display: block;
      margin-bottom: 2px;
    }
    
    .welcome-feature p {
      color: #666;
      font-size: 0.85rem;
      margin: 0;
    }
    
    .welcome-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-bottom: 20px;
    }
    
    .welcome-btn {
      padding: 14px 28px;
      font-family: inherit;
      font-size: 1rem;
      font-weight: bold;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }
    
    .welcome-btn.primary {
      background: linear-gradient(135deg, #00ffaa, #00cc88);
      color: #000;
    }
    
    .welcome-btn.primary:hover {
      transform: scale(1.05);
      box-shadow: 0 0 30px rgba(0, 255, 170, 0.4);
    }
    
    .welcome-btn.secondary {
      background: transparent;
      border: 1px solid #00ffaa;
      color: #00ffaa;
    }
    
    .welcome-btn.secondary:hover {
      background: rgba(0, 255, 170, 0.1);
    }
    
    .welcome-skip {
      background: none;
      border: none;
      color: #444;
      font-family: inherit;
      cursor: pointer;
      padding: 10px;
    }
    
    .welcome-skip:hover {
      color: #666;
    }
    
    /* Tutorial Overlay */
    .tutorial-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(3, 3, 10, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    
    .tutorial-overlay.visible {
      opacity: 1;
    }
    
    .tutorial-content {
      text-align: center;
      max-width: 400px;
    }
    
    .tutorial-content h2 {
      font-size: 2.5rem;
      color: #00ffaa;
      margin-bottom: 30px;
      letter-spacing: 4px;
    }
    
    .tutorial-controls {
      margin-bottom: 30px;
    }
    
    .tutorial-control {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      margin-bottom: 15px;
    }
    
    .tutorial-keys {
      display: flex;
      gap: 5px;
    }
    
    .tutorial-key {
      background: #1a1a2e;
      border: 1px solid #2a2a4e;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 1rem;
      font-weight: bold;
      color: #fff;
      min-width: 44px;
      text-align: center;
    }
    
    .tutorial-label {
      color: #888;
      font-size: 0.9rem;
    }
    
    .tutorial-tips {
      margin-bottom: 30px;
    }
    
    .tutorial-tips p {
      color: #666;
      font-size: 0.85rem;
      margin: 8px 0;
    }
    
    .tutorial-start {
      color: #00ffaa;
      animation: pulse 1.5s ease infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    /* Name Input Modal */
    .name-content h2 {
      color: #ffd700;
      margin-bottom: 10px;
    }
    
    .name-content > p {
      color: #888;
      margin-bottom: 25px;
    }
    
    .name-input-container {
      margin-bottom: 25px;
    }
    
    #nameInput {
      width: 120px;
      padding: 20px;
      font-size: 2.5rem;
      font-family: inherit;
      font-weight: bold;
      text-align: center;
      letter-spacing: 10px;
      background: #050510;
      border: 2px solid #2a2a4e;
      border-radius: 12px;
      color: #00ffaa;
      text-transform: uppercase;
    }
    
    #nameInput:focus {
      outline: none;
      border-color: #00ffaa;
      box-shadow: 0 0 20px rgba(0, 255, 170, 0.2);
    }
    
    #nameInput::placeholder {
      color: #333;
    }
    
    .name-signup-prompt {
      margin-top: 25px;
      padding-top: 25px;
      border-top: 1px solid #1a1a2e;
    }
    
    .name-signup-prompt p {
      color: #555;
      font-size: 0.85rem;
      margin-bottom: 12px;
    }
    
    /* Celebration Overlay */
    .celebration-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(3, 3, 10, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    
    .celebration-overlay.visible {
      opacity: 1;
    }
    
    .celebration-content {
      text-align: center;
    }
    
    .celebration-emoji {
      font-size: 5rem;
      animation: celebrateBounce 0.5s ease;
    }
    
    @keyframes celebrateBounce {
      0% { transform: scale(0); }
      50% { transform: scale(1.2); }
      100% { transform: scale(1); }
    }
    
    .celebration-content h2 {
      font-size: 2rem;
      color: #ffd700;
      margin: 20px 0 10px;
    }
    
    .celebration-score {
      font-size: 3rem;
      font-weight: bold;
      color: #00ffaa;
      margin: 0;
    }
    
    .celebration-wave {
      color: #888;
      margin: 5px 0 20px;
    }
    
    .celebration-msg {
      color: #666;
      margin-bottom: 25px;
    }
    
    /* Highlight Pulse */
    .highlight-pulse {
      animation: highlightPulse 0.5s ease 3;
    }
    
    @keyframes highlightPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0); }
      50% { box-shadow: 0 0 20px 5px rgba(255, 215, 0, 0.4); }
    }
  `;
  
  document.head.appendChild(style);
}

// ============================================
// Initialize
// ============================================

function initOnboarding() {
  injectOnboardingStyles();
  
  // Show welcome modal on homepage for new visitors
  if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    // Small delay to let page render
    setTimeout(() => {
      showWelcomeModal();
    }, 500);
  }
}

// Auto-init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOnboarding);
} else {
  initOnboarding();
}

// Export for use in game pages
window.Onboarding = {
  showWelcome: showWelcomeModal,
  dismissWelcome,
  showTutorial: showGameTutorial,
  promptForName,
  trackGameStart,
  trackGameEnd,
  celebrateFirstScore,
  getState: getOnboardingState,
  hasSetName
};
