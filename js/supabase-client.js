const ALLOWED_EMAIL_DOMAINS = ['std.bogazici.edu.tr', 'bogazici.edu.tr'];

let supabaseClient = null;

function getSupabaseConfig() {
  const config = window.BUHOUSE_CONFIG || {};
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Supabase yapılandırması eksik. js/config.js dosyasını kontrol edin.');
  }
  return config;
}

function getSupabase() {
  if (supabaseClient) return supabaseClient;

  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}

function validateBogaziciEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return 'Geçerli bir e-posta adresi girin.';
  if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
    return 'Sadece @std.bogazici.edu.tr veya @bogazici.edu.tr adresleri kabul edilir.';
  }
  return null;
}

window.getSupabase = getSupabase;
window.validateBogaziciEmail = validateBogaziciEmail;
