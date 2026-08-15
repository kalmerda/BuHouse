#!/usr/bin/env python3
"""SMTP bağlantısını test eder. Kullanım: python3 test_smtp.py [alici@email.com]"""

import sys

import config  # noqa: F401
from email_service import send_verification_email, smtp_configured, smtp_password_hint, smtp_password_valid


def main():
    if not smtp_configured():
        print("HATA: server/.env dosyasında SMTP bilgileri eksik veya placeholder.")
        print("SMTP_USER, SMTP_PASSWORD ve SMTP_FROM alanlarını doldurun.")
        sys.exit(1)

    if not smtp_password_valid():
        hint = smtp_password_hint()
        print(f"UYARI: {hint}")
        print("Yine de Gmail'e baglanmayi deniyoruz...")

    recipient = sys.argv[1] if len(sys.argv) > 1 else None
    if not recipient:
        import os
        recipient = os.getenv("SMTP_USER")
        print(f"Alıcı belirtilmedi, test maili gönderen adrese gidecek: {recipient}")

    try:
        result = send_verification_email(recipient, "123456", "Test Üniversitesi")
        if result.get("sent"):
            print(f"OK: Test e-postası gönderildi → {recipient}")
        else:
            print("UYARI: SMTP yapılandırılmamış, geliştirme modu aktif.")
            sys.exit(1)
    except RuntimeError as exc:
        print(f"HATA: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
