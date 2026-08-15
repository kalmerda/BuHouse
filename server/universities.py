UNIVERSITIES = [
    {
        "id": "bogazici",
        "name": "Boğaziçi Üniversitesi",
        "city": "İstanbul",
        "domains": ["std.bogazici.edu.tr", "bogazici.edu.tr"],
        "email_example": "ad.soyad@std.bogazici.edu.tr",
    },
]

UNIVERSITY_BY_ID = {u["id"]: u for u in UNIVERSITIES}


def get_university(university_id):
    return UNIVERSITY_BY_ID.get(university_id)


def email_matches_university(email, university_id):
    uni = get_university(university_id)
    if not uni:
        return False
    email = email.lower().strip()
    if "@" not in email:
        return False
    domain = email.split("@", 1)[1]
    return domain in uni["domains"]
