# Orada

BuHouse ile **aynı Supabase / Vercel hesabı kullanılmaz.** Yeni bir Supabase projesi ve yeni bir Vercel projesi aç.

Sürekli çalışan sunucu yok. Kasaba ancak sayfa açılınca veya **2 saat yoktum** denince biraz ilerler — ücretsiz kotayı şişirmez.

## 1. Yeni Supabase

1. [supabase.com](https://supabase.com) → New project (BuHouse projesine dokunma)
2. SQL Editor’da sırayla çalıştır:
   - `orada/supabase/01_tables.sql`
   - `orada/supabase/02_functions.sql`
3. Settings → API’den **Project URL** ve **anon public** key kopyala

## 2. Yeni Vercel

1. Vercel’de **ayrı proje** oluştur (BuHouse deploy’una ekleme)
2. Root Directory: `orada`
3. Environment Variables (sadece bu projeye):
   - `SUPABASE_URL` = yeni Orada Project URL
   - `SUPABASE_ANON_KEY` = yeni Orada anon key
4. Deploy. Site: `https://senin-orada.vercel.app`

BuHouse’taki `SUPABASE_URL` / `js/config.js` buraya kopyalanmaz.

## Yerel (Supabase’siz deneme)

```bash
cd orada
python3 -m pip install -r requirements.txt
python3 -m uvicorn main:app --host 0.0.0.0 --port 8787
```

http://127.0.0.1:8787 — SQLite kullanır, Vercel/BuHouse’a gitmez.
