import os
import smtplib
from email.message import EmailMessage
from pathlib import Path

from dotenv import load_dotenv

ENV_PATH = Path(__file__).parent / ".env"


def _reload_env():
    load_dotenv(ENV_PATH, override=True)


def smtp_configured():
    _reload_env()
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    return bool(
        os.getenv("SMTP_HOST")
        and os.getenv("SMTP_FROM")
        and user
        and password
        and user != "your-email@gmail.com"
        and password not in {"your-app-password", "your-16-char-app-password"}
    )


def smtp_password_valid():
    if not smtp_configured():
        return True
    length = len(_normalize_smtp_password(os.getenv("SMTP_PASSWORD", "")))
    return length == 16


def smtp_password_hint():
    length = len(_normalize_smtp_password(os.getenv("SMTP_PASSWORD", "")))
    if length == 16:
        return None
    return (
        f"Şifre {length} karakter — Google App Password tam 16 harftir "
        f"(ör. abcd efgh ijkl mnop). Mac/Chrome'un önerdiği 18 harflik şifre değil."
    )


def smtp_startup_message():
    if not smtp_configured():
        return "[DEV] SMTP yapılandırılmadı — server/.env dosyasını doldurun."
    if not smtp_password_valid():
        length = len(_normalize_smtp_password(os.getenv("SMTP_PASSWORD", "")))
        return (
            f"[SMTP UYARI] Şifre {length} karakter — Google App Password 16 harf olmalı "
            f"(4×4 grup: abcd efgh ijkl mnop). Mac'in önerdiği 18 harflik şifre değil."
        )
    return f"[SMTP] Gmail yapılandırıldı: {os.getenv('SMTP_USER')}"


def _normalize_smtp_password(password):
    return (password or "").replace(" ", "").replace("-", "")



def _send_via_smtp(msg):
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = _normalize_smtp_password(os.getenv("SMTP_PASSWORD"))
    use_ssl = os.getenv("SMTP_SSL", "false").lower() == "true"

    if use_ssl or port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=20) as server:
            server.login(user, password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as server:
            if os.getenv("SMTP_TLS", "true").lower() == "true":
                server.starttls()
            server.login(user, password)
            server.send_message(msg)


def send_verification_email(to_email, code, university_name):
    _reload_env()
    subject = "BuHouse — E-posta Doğrulama Kodunuz"
    body = f"""Merhaba,

BuHouse'a {university_name} öğrencisi olarak kayıt olmak için doğrulama kodunuz:

    {code}

Bu kod 15 dakika geçerlidir. Kodu kimseyle paylaşmayın.

Bu işlemi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.

BuHouse Ekibi
"""

    if not smtp_configured():
        print(f"[DEV] Doğrulama kodu ({to_email}): {code}")
        return {"sent": False, "dev_code": code}

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.getenv("SMTP_FROM")
    msg["To"] = to_email
    msg["Reply-To"] = os.getenv("SMTP_USER")
    msg.set_content(body)

    try:
        _send_via_smtp(msg)
    except smtplib.SMTPAuthenticationError as exc:
        pwd_len = len(_normalize_smtp_password(os.getenv("SMTP_PASSWORD", "")))
        hint = (
            f" (SMTP_PASSWORD uzunluğu: {pwd_len}; Gmail App Password genelde 16 karakter)"
            if pwd_len != 16
            else ""
        )
        raise RuntimeError(
            "Gmail kimlik doğrulama başarısız. 2 Adımlı Doğrulama açık mı? "
            "Google Hesap → Güvenlik → App Password oluşturup .env dosyasına yapıştırın."
            + hint
        ) from exc
    except smtplib.SMTPException as exc:
        raise RuntimeError(f"E-posta gönderilemedi: {exc}") from exc

    print(f"[SMTP] Doğrulama kodu gönderildi: {to_email}")
    return {"sent": True}


def send_password_reset_email(to_email, code):
    _reload_env()
    subject = "BuHouse — Şifre Sıfırlama Kodunuz"
    body = f"""Merhaba,

BuHouse hesabınız için şifre sıfırlama kodunuz:

    {code}

Bu kod 15 dakika geçerlidir. Kodu kimseyle paylaşmayın.

Bu işlemi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.

BuHouse Ekibi
"""

    if not smtp_configured():
        print(f"[DEV] Şifre sıfırlama kodu ({to_email}): {code}")
        return {"sent": False, "dev_code": code}

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.getenv("SMTP_FROM")
    msg["To"] = to_email
    msg["Reply-To"] = os.getenv("SMTP_USER")
    msg.set_content(body)

    try:
        _send_via_smtp(msg)
    except smtplib.SMTPAuthenticationError as exc:
        raise RuntimeError(
            "Gmail kimlik doğrulama başarısız. App Password ayarlarını kontrol edin."
        ) from exc
    except smtplib.SMTPException as exc:
        raise RuntimeError(f"E-posta gönderilemedi: {exc}") from exc

    print(f"[SMTP] Şifre sıfırlama kodu gönderildi: {to_email}")
    return {"sent": True}
