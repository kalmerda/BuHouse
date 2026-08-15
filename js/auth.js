let currentUser = null;
let authClient = null;

async function fetchProfile(userId) {
  const { data, error } = await authClient
    .from('profiles')
    .select('name, university_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function setSessionUser(session) {
  if (!session?.user) {
    currentUser = null;
    updateAuthUI();
    return;
  }

  let profile = null;
  try {
    profile = await fetchProfile(session.user.id);
  } catch {
    profile = null;
  }

  currentUser = {
    id: session.user.id,
    email: session.user.email,
    name: profile?.name || session.user.user_metadata?.name || '',
    university_id: profile?.university_id || session.user.user_metadata?.university_id || 'bogazici',
    verified: Boolean(session.user.email_confirmed_at),
  };
  updateAuthUI();
}

function updateAuthUI() {
  const guestActions = document.getElementById('nav-guest');
  const userActions = document.getElementById('nav-user');
  const userNameEl = document.getElementById('nav-user-name');
  const userEmailEl = document.getElementById('nav-user-email');

  if (currentUser) {
    guestActions?.classList.add('hidden');
    userActions?.classList.remove('hidden');
    if (userNameEl) userNameEl.textContent = currentUser.name || 'Kullanıcı';
    if (userEmailEl) userEmailEl.textContent = currentUser.email;
  } else {
    guestActions?.classList.remove('hidden');
    userActions?.classList.add('hidden');
  }
}

function requireAuth(action) {
  if (currentUser?.verified) {
    action();
    return;
  }
  if (currentUser && !currentUser.verified) {
    openAuthModal('confirm');
    showToast('E-posta adresini doğrulamalısın.');
    return;
  }
  openAuthModal('login');
  showToast('Bu işlem için giriş yapmalısınız.');
}

function openAuthModal(mode = 'register') {
  document.getElementById('auth-modal').showModal();
  switchAuthTab(mode);
}

function closeAuthModal() {
  document.getElementById('auth-modal').close();
  resetAuthForms();
}

function switchAuthTab(mode) {
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === mode);
  });

  ['register', 'confirm', 'login', 'forgot', 'reset-password'].forEach((panel) => {
    document.getElementById(`${panel}-panel`)?.classList.toggle('hidden', mode !== panel);
  });

  const hideTabs = ['forgot', 'reset-password', 'confirm'].includes(mode);
  document.querySelector('.auth-tabs')?.classList.toggle('hidden', hideTabs);
}

function resetAuthForms() {
  document.getElementById('register-form')?.reset();
  document.getElementById('login-form')?.reset();
  document.getElementById('forgot-form')?.reset();
  document.getElementById('reset-password-form')?.reset();
  document.getElementById('register-error').textContent = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('forgot-error').textContent = '';
  document.getElementById('reset-password-error').textContent = '';
  switchAuthTab('register');
}

async function handleRegister(e) {
  e.preventDefault();
  const errorEl = document.getElementById('register-error');
  errorEl.textContent = '';

  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim().toLowerCase();
  const password = document.getElementById('register-password').value;

  const clientError = window.validateBogaziciEmail(email);
  if (clientError) {
    errorEl.textContent = clientError;
    return;
  }

  try {
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          university_id: 'bogazici',
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) throw error;

    document.getElementById('confirm-email').textContent = email;
    switchAuthTab('confirm');

    if (data.session) {
      await setSessionUser(data.session);
      showToast('Kayıt tamamlandı. Hoş geldin!');
      closeAuthModal();
    } else {
      showToast('Doğrulama linki e-postana gönderildi.');
    }
  } catch (err) {
    errorEl.textContent = err.message || 'Kayıt başarısız.';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;

  const clientError = window.validateBogaziciEmail(email);
  if (clientError) {
    errorEl.textContent = clientError;
    return;
  }

  try {
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    await setSessionUser(data.session);
    closeAuthModal();
    showToast(`Hoş geldin, ${currentUser.name || 'Kullanıcı'}!`);
  } catch (err) {
    if (err.message?.includes('Email not confirmed')) {
      document.getElementById('confirm-email').textContent = email;
      switchAuthTab('confirm');
      errorEl.textContent = 'E-posta adresin henüz doğrulanmamış.';
      return;
    }
    errorEl.textContent = err.message || 'Giriş başarısız.';
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const errorEl = document.getElementById('forgot-error');
  errorEl.textContent = '';

  const email = document.getElementById('forgot-email').value.trim().toLowerCase();
  const clientError = window.validateBogaziciEmail(email);
  if (clientError) {
    errorEl.textContent = clientError;
    return;
  }

  try {
    const { error } = await authClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) throw error;

    showToast('Şifre sıfırlama linki e-postana gönderildi.');
    switchAuthTab('login');
  } catch (err) {
    errorEl.textContent = err.message || 'İşlem başarısız.';
  }
}

async function handleResetPassword(e) {
  e.preventDefault();
  const errorEl = document.getElementById('reset-password-error');
  errorEl.textContent = '';

  const password = document.getElementById('reset-password-new').value;
  const confirm = document.getElementById('reset-password-confirm').value;

  if (password !== confirm) {
    errorEl.textContent = 'Şifreler eşleşmiyor.';
    return;
  }

  try {
    const { error } = await authClient.auth.updateUser({ password });
    if (error) throw error;

    showToast('Şifren güncellendi.');
    switchAuthTab('login');
    history.replaceState(null, '', window.location.pathname);
  } catch (err) {
    errorEl.textContent = err.message || 'Şifre güncellenemedi.';
  }
}

async function handleLogout() {
  await authClient.auth.signOut();
  currentUser = null;
  updateAuthUI();
  window.setListingsView?.('all');
  showToast('Çıkış yapıldı.');
}

async function handleRecoveryRedirect() {
  const hash = window.location.hash;
  if (!hash.includes('type=recovery')) return;

  const { data: { session }, error } = await authClient.auth.getSession();
  if (error || !session) return;

  openAuthModal('reset-password');
  history.replaceState(null, '', window.location.pathname);
}

async function initAuth() {
  authClient = window.getSupabase();

  const { data: { session } } = await authClient.auth.getSession();
  await setSessionUser(session);

  authClient.auth.onAuthStateChange(async (_event, nextSession) => {
    await setSessionUser(nextSession);
    if (_event === 'PASSWORD_RECOVERY') {
      openAuthModal('reset-password');
    }
  });

  await handleRecoveryRedirect();
}

function bindAuthEvents() {
  document.getElementById('register-form')?.addEventListener('submit', handleRegister);
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('forgot-form')?.addEventListener('submit', handleForgotPassword);
  document.getElementById('reset-password-form')?.addEventListener('submit', handleResetPassword);
  document.getElementById('btn-forgot-password')?.addEventListener('click', () => {
    const loginEmail = document.getElementById('login-email').value.trim().toLowerCase();
    switchAuthTab('forgot');
    if (loginEmail) {
      document.getElementById('forgot-email').value = loginEmail;
    }
  });
  document.getElementById('btn-back-to-login')?.addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('btn-back-to-login-from-confirm')?.addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('btn-open-register')?.addEventListener('click', () => openAuthModal('register'));
  document.getElementById('btn-open-login')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  document.getElementById('auth-modal-close')?.addEventListener('click', closeAuthModal);
  document.getElementById('auth-modal-cancel')?.addEventListener('click', closeAuthModal);

  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
  });

  document.getElementById('auth-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAuthModal();
  });
}

window.getCurrentUser = () => currentUser;
window.getAuthToken = async () => {
  if (!authClient) authClient = window.getSupabase();
  const { data: { session } } = await authClient.auth.getSession();
  return session?.access_token || null;
};
window.requireAuth = requireAuth;
window.initAuth = initAuth;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindAuthEvents);
} else {
  bindAuthEvents();
}
