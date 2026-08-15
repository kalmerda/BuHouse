const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.warn('UYARI: SUPABASE_URL veya SUPABASE_ANON_KEY tanımlı değil.');
}

const content = `window.BUHOUSE_CONFIG = {
  supabaseUrl: ${JSON.stringify(url)},
  supabaseAnonKey: ${JSON.stringify(key)},
};
`;

fs.writeFileSync(path.join(__dirname, '..', 'js', 'config.js'), content);
console.log('js/config.js oluşturuldu.');
