const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.error('HATA: SUPABASE_URL ve SUPABASE_ANON_KEY tanımlı değil.');
  console.error('Vercel → Settings → Environment Variables bölümüne ekleyip yeniden deploy edin.');
  process.exit(1);
}

const content = `window.BUHOUSE_CONFIG = {
  supabaseUrl: ${JSON.stringify(url)},
  supabaseAnonKey: ${JSON.stringify(key)},
};
`;

fs.writeFileSync(path.join(__dirname, '..', 'js', 'config.js'), content);
console.log('js/config.js oluşturuldu.');
