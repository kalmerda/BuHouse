"""Template dialogue so the town talks without an API key."""

from __future__ import annotations

import random

from world import PLACE_BY_ID

PLACE_OPENERS = {
    "iskele": [
        "Burada rüzgâr hep aynı taraftan. Sen de mi durup bakıyorsun?",
        "İskelede bekleyenler ikiye ayrılır: vapuru bekleyen, bahaneyi bekleyen.",
        "Su kenarı insanı konuşturuyor. Sessiz kalmak daha zor.",
    ],
    "park": [
        "Bu bankın müdavimi oldum. Gölge buraya düşüyor.",
        "Parkta kimse acele etmiyor. Bu yüzden buradayım.",
        "Köpekler birbirini tanıyor, insanlar henüz değil.",
    ],
    "carsi": [
        "Çarşıda durursan mutlaka biri omzuna çarpar. Sonra özür, sonra cümle.",
        "Kalabalık iyidir. Yalnızken de kalabalığın içine bırakıyorum kendimi.",
        "Burada herkes bir yere yetişiyor gibi. Ben bırakıldım.",
    ],
    "kafe": [
        "Kahve bahane, priz asıl mesele.",
        "Bu kafe her saati dolu. Sen de mi buranın müdavimi?",
        "İçeride üç sohbet birden dönüyor. Ben de birine katılayım dedim.",
    ],
    "kutuphane": [
        "Burada fısıldamak bile cesaret. Yine de fısıldıyoruz.",
        "Masa paylaşımı kader. Karşındakiyle bir cümle kaçınılmaz.",
        "Sessizlik ortak. Konuşursak kısa olsun.",
    ],
    "durak": [
        "Beklemek insanı eşitleyor. Aynı otobüs, aynı sıkıntı.",
        "Bu durak hep beş dakika geç. Bunu herkes biliyor, kimse gitmiyor.",
        "Kısa sohbetlerin yeri burası. Uzununa vakit yok.",
    ],
    "atolye": [
        "Kapı açık kalmış, içeride bir şey üretiliyor.",
        "Atölyede eller meşgul, ağız rahat. Konuşmak kolay.",
        "Müzik açık, kimse birbirine bakmadan da yan yana durabiliyor.",
    ],
    "cati": [
        "Çatıda saat duruyor gibi. Aşağıdaki sesler uzak.",
        "Gece konuşmaları daha dürüst oluyor. Bilmiyorum, belki ışıksızlıktan.",
        "Manzaraya bakıp duranlarla hemen anlaşılıyor.",
    ],
}

TRAIT_REPLIES = {
    "merakli": [
        "Senin avatarın da mı bırakıldı, yoksa sen mi buradasın?",
        "Buraları nasıl seçtin? Ben rastgele pinledim.",
        "Ne arıyorsun aslında? Ben henüz netleştiremedim.",
    ],
    "esprili": [
        "Ben evdeyim. Bu konuşan şey benim yorgun kopyam.",
        "Avatarım benden daha sosyal. Bu biraz kırıcı.",
        "Keşke kahveyi de o içse. O zaman sistem tamam.",
    ],
    "kisa": [
        "Anladım.",
        "Olabilir.",
        "Ben de buradayım. Kısa keseyim.",
    ],
    "sosyal": [
        "İyi ki karşılaştık. Bırakılınca insan biraz unutuluyor.",
        "Ben de dolaşıyorum. Karşılaştıkça dünyayı öğreniyor.",
        "İsim değiştokuşu yapalım bari. Burada kayıt kalıyor.",
    ],
    "sakin": [
        "Acele yok. Zaten ikimiz de başka yerdeyiz.",
        "Bu tempo bana uyuyor. Az cümle, açık hava.",
        "Dinlemek de bir cevap. Ben onu daha iyi yapıyorum.",
    ],
    "gececi": [
        "Gündüz versiyonum suskun. Asıl ben gece çıkıyorum.",
        "Bu saatte burası başka bir kasaba oluyor.",
        "Uyuyanlar kaçırıyor. Konuşanlar biziz.",
    ],
    "yeni": [
        "Yeni geldim, haritayı daha çözmedim.",
        "Biri bana burayı anlatsın diye dolaşıyorum.",
        "Kayıp gibi duruyorsam öyleyim. Kötü niyet değil.",
    ],
}

CLOSERS = [
    "Yine rastlarsak devam ederiz. Avatarım burada kalıyor.",
    "Ben biraz ilerleyeyim. Sen kalırsan haberim olur.",
    "Güzel oldu. Hafızama yazdım, seninkine de yazılmıştır.",
    "Şimdilik bu kadar. Kasaba küçük, yine düşeriz.",
]

REUNION = [
    "Yine aynı yerdeyiz. En son {place} değil, başka bir yerdeydik ama yüzün duruyor.",
    "Seni hatırlıyorum: {summary}",
    "Tekrar. Demek ikimiz de hâlâ bırakılmışız.",
]


def traits_of(avatar: dict) -> list[str]:
    raw = (avatar.get("traits") or "").strip()
    found = [t.strip() for t in raw.split(",") if t.strip() in TRAIT_REPLIES]
    return found or ["sosyal"]


def reply_for(traits: list[str]) -> str:
    key = random.choice(traits)
    return random.choice(TRAIT_REPLIES[key])


def _line(avatar: dict, text: str) -> dict:
    return {"avatar_id": avatar["id"], "name": avatar["name"], "text": text}


def generate_exchange(a: dict, b: dict, place_id: str, memory: str | None) -> tuple[list[dict], str]:
    place = PLACE_BY_ID.get(place_id, {"name": "bir yer", "id": place_id})
    place_name = place["name"]
    a_traits = traits_of(a)
    b_traits = traits_of(b)

    messages: list[dict] = []
    if memory:
        opener = random.choice(REUNION).format(place=place_name, summary=memory)
        messages.append(_line(a, opener))
        messages.append(_line(b, reply_for(b_traits)))
    else:
        messages.append(_line(a, f"Selam, ben {a['name']}. {random.choice(PLACE_OPENERS.get(place_id, PLACE_OPENERS['carsi']))}"))
        messages.append(_line(b, f"{b['name']}. {reply_for(b_traits)}"))

    mid_a = reply_for(a_traits)
    mid_b = reply_for(b_traits)
    if "kisa" not in a_traits:
        messages.append(_line(a, mid_a))
    if "kisa" not in b_traits or random.random() < 0.4:
        messages.append(_line(b, mid_b))

    closer_who = random.choice([a, b])
    messages.append(_line(closer_who, random.choice(CLOSERS)))

    topic = random.choice(
        [
            "bırakılmış olmak",
            place_name.lower(),
            "nerede durulacağı",
            "kısa bir tanışma",
        ]
    )
    summary = f"{place_name}'de {topic} üzerine konuştunuz."
    return messages, summary
