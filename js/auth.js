let currentUser = null;
let authClient = null;
let isRecoveringPassword = false;
let capturedAuthRedirect = null;

const CONFIG_ERROR = 'Site yapılandırması eksik. Supabase anahtarları tanımlanmamış — yönetici Vercel environment variables kontrol etmeli.';

function ensureAuthClient() {
  if (authClient) return authClient;
  try {
    authClient = window.getSupabase();
    return authClient;
  } catch {
    throw new Error(CONFIG_ERROR);
  }
}

function getSiteRedirectTo() {
  return `${window.location.origin}${window.location.pathname || '/'}`;
}

function captureAuthRedirect() {
  if (capturedAuthRedirect) return capturedAuthRedirect;

  const params = new URLSearchParams();
  const search = window.location.search.replace(/^\?/, '');
  const hash = window.location.hash.replace(/^#/, '');
  new URLSearchParams(search).forEach((value, key) => params.set(key, value));
  new URLSearchParams(hash).forEach((value, key) => params.set(key, value));

  capturedAuthRedirect = {
    type: params.get('type'),
    error: params.get('error'),
    errorCode: params.get('error_code'),
    errorDescription: params.get('error_description'),
  };
  return capturedAuthRedirect;
}

function friendlyAuthRedirectError(redirect) {
  const raw = redirect?.errorDescription || redirect?.errorCode || redirect?.error || '';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(String(raw).replace(/\+/g, ' '));
  } catch {
    decoded = String(raw);
  }

  if (/expired|invalid|otp/i.test(decoded) || redirect?.errorCode === 'otp_expired') {
    return 'Şifre sıfırlama linkinin süresi dolmuş veya geçersiz. Yeni bir link iste.';
  }
  return decoded || 'Şifre sıfırlama linki kullanılamadı. Yeni bir link iste.';
}

function setButtonBusy(button, busy, idleLabel) {
  if (!button) return;
  button.disabled = busy;
  if (busy) {
    button.dataset.idleLabel = button.dataset.idleLabel || button.textContent;
    button.textContent = 'Gönderiliyor...';
  } else {
    button.textContent = button.dataset.idleLabel || idleLabel || button.textContent;
  }
}

async function fetchProfile(userId) {
  const client = ensureAuthClient();
  const { data, error } = await client
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
  const modal = document.getElementById('auth-modal');
  if (modal && !modal.open) modal.showModal();
  switchAuthTab(mode);
}

function closeAuthModal() {
  isRecoveringPassword = false;
  document.getElementById('auth-modal')?.close();
  resetAuthForms();
}

function switchAuthTab(mode) {
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === mode);
  });

  ['register', 'confirm', 'login', 'forgot', 'forgot-sent', 'reset-password'].forEach((panel) => {
    document.getElementById(`${panel}-panel`)?.classList.toggle('hidden', mode !== panel);
  });

  const hideTabs = ['forgot', 'forgot-sent', 'reset-password', 'confirm'].includes(mode);
  document.querySelector('.auth-tabs')?.classList.toggle('hidden', hideTabs);

  if (mode === 'reset-password') {
    requestAnimationFrame(() => {
      document.getElementById('reset-password-new')?.focus();
    });
  }
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

function enterPasswordRecovery() {
  isRecoveringPassword = true;
  openAuthModal('reset-password');
}

function showForgotLinkError(message) {
  openAuthModal('forgot');
  const errorEl = document.getElementById('forgot-error');
  if (errorEl) errorEl.textContent = message;
  showToast(message);
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
    const client = ensureAuthClient();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          university_id: 'bogazici',
        },
        emailRedirectTo: getSiteRedirectTo(),
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
    const client = ensureAuthClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
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
  const submitBtn = document.getElementById('btn-forgot-submit');
  errorEl.textContent = '';

  const email = document.getElementById('forgot-email').value.trim().toLowerCase();
  const clientError = window.validateBogaziciEmail(email);
  if (clientError) {
    errorEl.textContent = clientError;
    return;
  }

  setButtonBusy(submitBtn, true, 'Sıfırlama Linki Gönder');
  try {
    const client = ensureAuthClient();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: getSiteRedirectTo(),
    });
    if (error) throw error;

    document.getElementById('forgot-sent-email').textContent = email;
    switchAuthTab('forgot-sent');
    showToast('Şifre sıfırlama linki e-postana gönderildi.');
  } catch (err) {
    errorEl.textContent = err.message || 'İşlem başarısız.';
  } finally {
    setButtonBusy(submitBtn, false, 'Sıfırlama Linki Gönder');
  }
}

async function handleResetPassword(e) {
  e.preventDefault();
  const errorEl = document.getElementById('reset-password-error');
  const submitBtn = document.getElementById('btn-reset-submit');
  errorEl.textContent = '';

  const password = document.getElementById('reset-password-new').value;
  const confirm = document.getElementById('reset-password-confirm').value;

  if (password !== confirm) {
    errorEl.textContent = 'Şifreler eşleşmiyor.';
    return;
  }

  setButtonBusy(submitBtn, true, 'Şifreyi Güncelle');
  try {
    const client = ensureAuthClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;

    isRecoveringPassword = false;
    showToast('Şifren güncellendi.');
    closeAuthModal();
  } catch (err) {
    const message = err.message || 'Şifre güncellenemedi.';
    if (/session|expired|not authenticated/i.test(message)) {
      errorEl.textContent = 'Oturumun süresi doldu. Şifremi unuttum adımından yeni bir link iste.';
      return;
    }
    errorEl.textContent = message;
  } finally {
    setButtonBusy(submitBtn, false, 'Şifreyi Güncelle');
  }
}

async function handleLogout() {
  await ensureAuthClient().auth.signOut();
  currentUser = null;
  isRecoveringPassword = false;
  updateAuthUI();
  window.setListingsView?.('all');
  showToast('Çıkış yapıldı.');
}

async function initAuth() {
  const redirect = captureAuthRedirect();
  const client = ensureAuthClient();

  // URL'deki recovery oturumu initialize sırasında işlenir; dinleyiciyi
  // getSession'dan önce bağla ki PASSWORD_RECOVERY kaçmasın.
  client.auth.onAuthStateChange(async (event, nextSession) => {
    await setSessionUser(nextSession);
    if (event === 'PASSWORD_RECOVERY') {
      enterPasswordRecovery();
    }
  });

  const { data: { session } } = await client.auth.getSession();
  await setSessionUser(session);

  if (redirect.type === 'recovery') {
    if (session) {
      enterPasswordRecovery();
    } else {
      showForgotLinkError(friendlyAuthRedirectError(redirect));
    }
  } else if (redirect.error || redirect.errorCode || redirect.errorDescription) {
    showForgotLinkError(friendlyAuthRedirectError(redirect));
  }
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
  document.getElementById('btn-back-to-login-from-forgot-sent')?.addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('btn-open-register')?.addEventListener('click', () => openAuthModal('register'));
  document.getElementById('btn-open-login')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  document.getElementById('auth-modal-close')?.addEventListener('click', closeAuthModal);
  document.getElementById('auth-modal-cancel')?.addEventListener('click', closeAuthModal);

  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
  });

  document.getElementById('auth-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget && !isRecoveringPassword) closeAuthModal();
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
