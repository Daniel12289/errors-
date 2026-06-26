// ===== FIREBASE CONFIGURATION =====
const firebaseConfig = {
  apiKey: "AIzaSyBHnae2lJXPoaGwD3yC4f0AOTo0osOE00w",
  authDomain: "power-81d5e.firebaseapp.com",
  databaseURL: "https://power-81d5e-default-rtdb.firebaseio.com",
  projectId: "power-81d5e",
  storageBucket: "power-81d5e.firebasestorage.app",
  messagingSenderId: "1012873005832",
  appId: "1:1012873005832:web:596e4fc5232f84d6f93abd"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// ===== CONSTANTS =====
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_TOKENS = 200;
const TOKEN_COST_PER_MSG = 2;

// ===== STATE =====
let apiKey = null;
let currentUser = null;
let userTokens = DEFAULT_TOKENS;
let conversationHistory = [];
let isSignup = false;
let selectedPlan = null;
let uploadedReceipt = null;

// ===== DOM CACHE =====
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== SCREEN NAVIGATION =====
function showScreen(screenId) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(screenId).classList.add('active');
}

// ===== AUTH FUNCTIONS =====
function showAuthError(msg) {
  const el = $('authError');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}

function toggleAuthMode() {
  isSignup = !isSignup;
  $('loginForm').style.display = isSignup ? 'none' : 'flex';
  $('signupForm').style.display = isSignup ? 'flex' : 'none';
  $('authTitle').textContent = isSignup ? 'Create Account' : 'Welcome back';
  $('authSubtitle').textContent = isSignup ? 'Join ELren AI today' : 'Sign in to continue your journey';
  $('authToggleText').textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
  $('toggleAuthMode').textContent = isSignup ? 'Sign in' : 'Sign up';
}

async function handleLogin() {
  const email = $('loginEmail').value.trim();
  const pass = $('loginPassword').value;
  if (!email || !pass) return showAuthError('Please fill all fields');
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    showAuthError(e.message);
  }
}

async function handleSignup() {
  const name = $('signupName').value.trim();
  const email = $('signupEmail').value.trim();
  const pass = $('signupPassword').value;
  const confirm = $('signupConfirm').value;

  if (!name || !email || !pass) return showAuthError('All fields are required');
  if (pass.length < 6) return showAuthError('Password must be at least 6 characters');
  if (pass !== confirm) return showAuthError('Passwords do not match');

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });
    await initializeUserData(cred.user.uid, name, email);
  } catch (e) {
    showAuthError(e.message);
  }
}

async function initializeUserData(uid, name, email) {
  await database.ref(`/users/${uid}`).set({
    name: name || '',
    email: email || '',
    tokens: DEFAULT_TOKENS,
    createdAt: new Date().toISOString()
  });
}

// ===== API KEY MANAGEMENT =====
database.ref('/api_keys/aiKey').on('value', snap => {
  const val = snap.val();
  apiKey = (val && val.startsWith('gsk_')) ? val : null;
});

// ===== TOKEN MANAGEMENT =====
async function loadUserTokens() {
  if (!currentUser) return;
  const snap = await database.ref(`/users/${currentUser.uid}/tokens`).once('value');
  userTokens = snap.val() || DEFAULT_TOKENS;
  updateTokenDisplay();
}

async function deductTokens(amount) {
  if (!currentUser) return false;
  userTokens = Math.max(0, userTokens - amount);
  await database.ref(`/users/${currentUser.uid}/tokens`).set(userTokens);
  updateTokenDisplay();
  return userTokens > 0;
}

function updateTokenDisplay() {
  const text = `${userTokens} tokens`;
  $('tokenBadge').textContent = text;
  $('menuTokenCount').textContent = userTokens;
  if (userTokens < 20) {
    $('tokenBadge').style.background = 'rgba(239, 68, 68, 0.2)';
    $('tokenBadge').style.color = '#f87171';
    $('tokenBadge').style.borderColor = 'rgba(239, 68, 68, 0.3)';
  }
}

// ===== CHAT FUNCTIONS =====
async function callGroqAPI(msg) {
  if (!apiKey) throw new Error('API key missing');

  const messages = [
    {
      role: "system",
      content: "You are ELren, a friendly and knowledgeable AI assistant. Keep responses concise, helpful, and engaging. Use markdown formatting when helpful."
    },
    ...conversationHistory.slice(-10),
    { role: "user", content: msg.slice(0, 500) }
  ];

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 500
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'API error');
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

function createMessageElement(role, text) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `
    <div class="message-avatar ${role}">${role === 'bot' ? '🤖' : '👤'}</div>
    <div class="message-bubble">${formatMessage(text)}</div>
  `;
  return div;
}

function formatMessage(text) {
  // Basic markdown formatting
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(124,58,237,0.2);padding:2px 6px;border-radius:4px;font-family:monospace;">$1</code>')
    .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.3);padding:12px;border-radius:8px;overflow-x:auto;font-size:12px;"><code>$1</code></pre>')
    .replace(/\n/g, '<br>');
}

function addTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'message bot';
  div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="message-avatar bot">🤖</div>
    <div class="message-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  $('messagesContainer').appendChild(div);
  scrollToBottom();
  return div;
}

function removeTypingIndicator() {
  const el = $('typingIndicator');
  if (el) el.remove();
}

function scrollToBottom() {
  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
}

async function sendMessage(text) {
  if (!text.trim()) return;
  if (userTokens < TOKEN_COST_PER_MSG) {
    openTokenModal();
    return;
  }

  // Switch from empty state to messages
  $('chatEmpty').style.display = 'none';
  $('messagesContainer').style.display = 'flex';

  // Add user message
  $('messagesContainer').appendChild(createMessageElement('user', text));
  $('chatInput').value = '';
  $('chatInput').style.height = 'auto';
  scrollToBottom();

  // Deduct tokens
  await deductTokens(TOKEN_COST_PER_MSG);

  // Show typing
  addTypingIndicator();
  $('sendBtn').disabled = true;

  try {
    const reply = await callGroqAPI(text);
    removeTypingIndicator();
    $('messagesContainer').appendChild(createMessageElement('bot', reply));
    conversationHistory.push(
      { role: 'user', content: text },
      { role: 'assistant', content: reply }
    );
    await saveToHistory(text, reply);
    await loadHistory();
  } catch (e) {
    removeTypingIndicator();
    const errorMsg = e.message.includes('API key') 
      ? 'Service temporarily unavailable. Please try again later.'
      : `Error: ${e.message.slice(0, 100)}`;
    $('messagesContainer').appendChild(createMessageElement('bot', errorMsg));
  } finally {
    $('sendBtn').disabled = false;
    scrollToBottom();
  }
}

// ===== HISTORY =====
async function loadHistory() {
  if (!currentUser) return;
  const snap = await database.ref(`/history/${currentUser.uid}`).limitToLast(10).once('value');
  const data = snap.val() || {};
  const items = Object.entries(data).reverse();

  const list = $('historyList');
  if (items.length === 0) {
    list.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">
        No conversations yet<br>Start chatting!
      </div>
    `;
    return;
  }

  list.innerHTML = '';
  items.forEach(([key, val], index) => {
    const icons = ['💬', '🔍', '💻', '✨', '📝'];
    const colors = ['purple', 'cyan', 'pink', 'green', 'purple'];
    const icon = icons[index % icons.length];
    const color = colors[index % colors.length];
    const time = new Date(val.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-item-icon ${color}">${icon}</div>
      <div class="history-item-content">
        <div class="history-item-title">${(val.query || '').slice(0, 30)}${(val.query || '').length > 30 ? '...' : ''}</div>
        <div class="history-item-desc">${(val.reply || '').slice(0, 40)}${(val.reply || '').length > 40 ? '...' : ''}</div>
      </div>
      <div class="history-item-time">${time}</div>
    `;
    div.addEventListener('click', () => {
      showScreen('chatScreen');
      $('chatEmpty').style.display = 'none';
      $('messagesContainer').style.display = 'flex';
      $('messagesContainer').innerHTML = '';
      $('messagesContainer').appendChild(createMessageElement('user', val.query));
      $('messagesContainer').appendChild(createMessageElement('bot', val.reply));
    });
    list.appendChild(div);
  });
}

async function saveToHistory(query, reply) {
  if (!currentUser) return;
  await database.ref(`/history/${currentUser.uid}`).push({
    query,
    reply,
    time: new Date().toISOString()
  });
}

// ===== SIDEBAR =====
function openSidebar() {
  $('sidebarOverlay').classList.add('active');
  $('sidebarDrawer').classList.add('open');
}

function closeSidebar() {
  $('sidebarOverlay').classList.remove('active');
  $('sidebarDrawer').classList.remove('open');
}

// ===== TOKEN MODAL =====
function openTokenModal() {
  $('tokenModal').classList.add('active');
  // Select premium by default
  selectedPlan = { amount: 1000, tokens: 2500 };
  updatePlanSelection();
}

function closeTokenModal() {
  $('tokenModal').classList.remove('active');
  selectedPlan = null;
  uploadedReceipt = null;
}

function updatePlanSelection() {
  $$('.plan-card').forEach(card => {
    card.classList.remove('selected');
    if (selectedPlan && card.dataset.amount == selectedPlan.amount) {
      card.classList.add('selected');
    }
  });
  if (selectedPlan) {
    $('amountToPay').textContent = `₦${selectedPlan.amount.toLocaleString()}`;
  }
}

// ===== VOICE INPUT =====
function startVoiceInput() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Voice input not supported on this device');
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = false;

  $('voiceBtn').style.color = '#ec4899';
  recognition.start();

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    $('chatInput').value = transcript;
    $('chatInput').style.height = 'auto';
    $('chatInput').style.height = Math.min($('chatInput').scrollHeight, 100) + 'px';
  };

  recognition.onend = () => {
    $('voiceBtn').style.color = '';
  };

  recognition.onerror = () => {
    $('voiceBtn').style.color = '';
  };
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
  // Welcome screen
  $('welcomeBtn').addEventListener('click', () => {
    showScreen('authScreen');
  });

  // Auth toggle
  $('toggleAuthMode').addEventListener('click', toggleAuthMode);

  // Login
  $('loginBtn').addEventListener('click', handleLogin);
  $('loginPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // Signup
  $('signupBtn').addEventListener('click', handleSignup);
  $('signupConfirm').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSignup();
  });

  // Auth state
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      const name = user.displayName || user.email.split('@')[0];
      const initial = name[0].toUpperCase();

      // Update all user displays
      $('homeUserName').textContent = name;
      $('homeAvatar').textContent = initial;
      $('sidebarAvatar').textContent = initial;
      $('sidebarUserName').textContent = name;
      $('sidebarUserEmail').textContent = user.email;

      showScreen('homeScreen');
      await loadUserTokens();
      await loadHistory();
    } else {
      currentUser = null;
      userTokens = DEFAULT_TOKENS;
      conversationHistory = [];
      showScreen('welcomeScreen');
    }
  });

  // Home actions
  $('chatWithBotCard').addEventListener('click', () => {
    showScreen('chatScreen');
  });

  $('searchImageCard').addEventListener('click', () => {
    sendMessage('I want to search by image. Please describe how I can upload an image for analysis.');
    showScreen('chatScreen');
  });

  $('codeHelperCard').addEventListener('click', () => {
    sendMessage('Help me with coding. I need assistance with programming.');
    showScreen('chatScreen');
  });

  $('creativeCard').addEventListener('click', () => {
    sendMessage('Help me write something creative.');
    showScreen('chatScreen');
  });

  // Sidebar
  $('menuBtn').addEventListener('click', openSidebar);
  $('sidebarOverlay').addEventListener('click', closeSidebar);

  $('menuBuyTokens').addEventListener('click', () => {
    closeSidebar();
    openTokenModal();
  });

  $('menuHistory').addEventListener('click', () => {
    closeSidebar();
    showScreen('homeScreen');
  });

  $('menuSettings').addEventListener('click', () => {
    closeSidebar();
    alert('Settings coming soon!');
  });

  $('menuHelp').addEventListener('click', () => {
    closeSidebar();
    sendMessage('How do I use ELren? What can you help me with?');
    showScreen('chatScreen');
  });

  $('sidebarLogout').addEventListener('click', () => {
    if (confirm('Sign out?')) {
      auth.signOut();
      closeSidebar();
    }
  });

  // Chat
  $('chatBack').addEventListener('click', () => {
    showScreen('homeScreen');
  });

  $('sendBtn').addEventListener('click', () => sendMessage($('chatInput').value));

  $('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage($('chatInput').value);
    }
  });

  $('chatInput').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
  });

  $('voiceBtn').addEventListener('click', startVoiceInput);

  // Bottom nav
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      $$('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      const nav = item.dataset.nav;
      if (nav === 'home') showScreen('homeScreen');
      else if (nav === 'chat') showScreen('chatScreen');
      else if (nav === 'friends') alert('Friends feature coming soon!');
      else if (nav === 'settings') alert('Settings coming soon!');
    });
  });

  // Token modal
  $$('.plan-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedPlan = {
        amount: parseInt(card.dataset.amount),
        tokens: parseInt(card.dataset.tokens)
      };
      updatePlanSelection();
    });
  });

  $('tokenModal').addEventListener('click', (e) => {
    if (e.target === $('tokenModal')) closeTokenModal();
  });

  // Receipt upload
  $('uploadArea').addEventListener('click', () => $('receiptUpload').click());
  $('receiptUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadedReceipt = file;
      $('uploadArea').innerHTML = `<p>✅ Receipt selected: ${file.name}</p>`;
    }
  });

  $('submitPayment').addEventListener('click', async () => {
    if (!selectedPlan) return alert('Please select a plan');
    if (!uploadedReceipt) return alert('Please upload your payment receipt');

    $('submitPayment').disabled = true;
    $('submitPayment').textContent = 'Submitting...';

    try {
      // Upload receipt to Firebase Storage (simulated - would need storage setup)
      // For now, save payment request to database
      await database.ref('/payments').push({
        userId: currentUser?.uid || 'anonymous',
        email: currentUser?.email || '',
        plan: selectedPlan,
        status: 'pending',
        submittedAt: new Date().toISOString()
      });

      $('submitPayment').textContent = '✅ Submitted for Verification';
      $('submitPayment').style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';

      setTimeout(() => {
        closeTokenModal();
        $('submitPayment').disabled = false;
        $('submitPayment').textContent = 'Submit for Verification';
        $('submitPayment').style.background = '';
        $('uploadArea').innerHTML = '<p>📸 Tap to upload payment receipt</p>';
      }, 2000);
    } catch (e) {
      alert('Error submitting payment: ' + e.message);
      $('submitPayment').disabled = false;
      $('submitPayment').textContent = 'Submit for Verification';
    }
  });

  // See all history
  $('seeAllHistory').addEventListener('click', () => {
    showScreen('chatScreen');
  });

  // Token badge click
  $('tokenBadge').addEventListener('click', openTokenModal);
});
