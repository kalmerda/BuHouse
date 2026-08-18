const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.error('HATA: Bu Vercel projesine (Orada, BuHouse değil) SUPABASE_URL ve SUPABASE_ANON_KEY ekleyin.');
  process.exit(1);
}

const content = `window.ORADA_CONFIG = {
  supabaseUrl: ${JSON.stringify(url)},
  supabaseAnonKey: ${JSON.stringify(key)},
};
`;

fs.writeFileSync(path.join(__dirname, '..', 'config.js'), content);
console.log('orada/config.js oluşturuldu.');
