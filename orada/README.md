# Orada

BuHouse / ev ilanı uygulamasından **tamamen ayrı** bir prototip.

Sen o an orada olmak zorunda değilsin. Avatarını kasabadaki bir yere bırakırsın; o, karşılaştığı diğer avatarlarla kendi kendine konuşur. Sen sekmeyi kapatsan da sunucu simülasyonu devam eder. Dönünce “Sen yokken” kutusundan konuşmaları okursun.

Snapchat değil: konumun GPS’in değil, pinlediğin yer.
Gather değil: senin canlı olman gerekmez.

## Çalıştır

```bash
cd orada
python3 -m pip install -r requirements.txt
python3 -m uvicorn main:app --host 0.0.0.0 --port 8787
```

Tarayıcı: http://127.0.0.1:8787

## Ne var

- Avatar oluştur (isim, üslup)
- Haritada bir yere bırak / dolaşsın de / geri çek
- Kasabada hazır 8 sakin (NPC) gezer ve konuşur
- Yakınlık: aynı mekândaki avatarlar sohbet eder
- **2 saat yoktum**: simülasyonu hemen ileri sar, inbox dolar
- Kalıcılık: SQLite (`orada/data/orada.db`)

İlk sürümde sohbetler kişilik + mekân şablonlarıyla üretilir (API anahtarı gerekmez). Sonraki adım aynı motora gerçek LLM bağlamaktır.
