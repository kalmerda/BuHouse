import config  # noqa: F401 — .env yüklemesi

import hashlib
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from db import (
    create_pending_password_reset,
    create_pending_verification,
    create_session,
    create_user,
    delete_pending_password_reset,
    delete_pending_verification,
    delete_session,
    get_pending_password_reset,
    get_pending_verification,
    get_session,
    get_user_by_email,
    init_db,
    update_user_password,
    user_to_public,
)
from email_service import (
    send_password_reset_email,
    send_verification_email,
    smtp_configured,
    smtp_startup_message,
)
from universities import UNIVERSITIES, email_matches_university, get_university

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
MAX_PHOTOS = 5
MAX_PHOTO_BYTES = 5 * 1024 * 1024

app = Flask(__name__, static_folder=ROOT, static_url_path="")
app.secret_key = config.SECRET_KEY

if config.CORS_ORIGINS:
    CORS(app, origins=config.CORS_ORIGINS, supports_credentials=True)
else:
    CORS(app, supports_credentials=True)

BLOCKED_STATIC_PREFIXES = (
    "server/",
    ".env",
    ".git/",
    "__pycache__/",
)
ALLOWED_STATIC_PREFIXES = ("css/", "js/", "assets/", "uploads/")

init_db()


def hash_password(password):
    salt = "oda-arkadasi-v1"
    return hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()


def generate_code():
    return f"{secrets.randbelow(1_000_000):06d}"


def generate_token():
    return secrets.token_urlsafe(32)


def send_verification_safe(email, code, university_name):
    try:
        return send_verification_email(email, code, university_name)
    except RuntimeError as exc:
        print(f"[SMTP ERROR] {exc}")
        return {"sent": False, "dev_code": code, "smtp_error": str(exc)}


def send_password_reset_safe(email, code):
    try:
        return send_password_reset_email(email, code)
    except RuntimeError as exc:
        print(f"[SMTP ERROR] {exc}")
        return {"sent": False, "dev_code": code, "smtp_error": str(exc)}


def mail_response(email, mail_result):
    if mail_result.get("sent"):
        return {
            "message": "Doğrulama kodu e-posta adresinize gönderildi.",
            "email": email,
            "expires_in_minutes": 15,
        }, 200

    if config.EXPOSE_DEV_CODE and mail_result.get("dev_code"):
        message = "E-posta gönderilemedi. Kod ekranda gösteriliyor."
        if mail_result.get("smtp_error"):
            message = "Gmail bağlantısı başarısız. Kod ekranda gösteriliyor."

        return {
            "message": message,
            "email": email,
            "expires_in_minutes": 15,
            "dev_mode": True,
            "dev_message": "Doğrulama kodun aşağıda.",
            "dev_code": mail_result.get("dev_code"),
        }, 200

    return {
        "message": "E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.",
        "email": email,
        "expires_in_minutes": 15,
    }, 503


def get_bearer_token():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


def json_error(message, status=400):
    return jsonify({"error": message}), status


def is_safe_static_path(path):
    if not path or path.startswith("/"):
        return False
    if ".." in path or path.startswith("."):
        return False
    normalized = path.replace("\\", "/")
    if any(normalized.startswith(prefix) for prefix in BLOCKED_STATIC_PREFIXES):
        return False
    if normalized.startswith("uploads/"):
        return True
    return any(normalized.startswith(prefix) for prefix in ALLOWED_STATIC_PREFIXES)


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.route("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    safe_name = Path(filename).name
    if safe_name != filename or ".." in filename:
        return json_error("Geçersiz dosya yolu.", 404)
    return send_from_directory(UPLOAD_DIR, safe_name)


@app.route("/robots.txt")
def robots_txt():
    return (
        "User-agent: *\nAllow: /\nDisallow: /server/\nDisallow: /uploads/\n",
        200,
        {"Content-Type": "text/plain; charset=utf-8"},
    )


@app.post("/api/upload-photos")
def upload_photos():
    token = get_bearer_token()
    if not token or not get_session(token):
        return json_error("Fotoğraf yüklemek için giriş yapmalısınız.", 401)

    files = request.files.getlist("photos")
    if not files or all(not f.filename for f in files):
        return json_error("En az bir fotoğraf seçin.")

    if len(files) > MAX_PHOTOS:
        return json_error(f"En fazla {MAX_PHOTOS} fotoğraf yükleyebilirsiniz.")

    urls = []
    for file in files:
        if not file.filename:
            continue
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_IMAGE_EXT:
            return json_error("Sadece JPG, PNG veya WEBP yükleyebilirsiniz.")

        data = file.read()
        if len(data) > MAX_PHOTO_BYTES:
            return json_error("Her fotoğraf en fazla 5 MB olabilir.")

        filename = f"{secrets.token_hex(12)}{ext}"
        (UPLOAD_DIR / filename).write_bytes(data)
        urls.append(f"/uploads/{filename}")

    if not urls:
        return json_error("Fotoğraf yüklenemedi.")

    return jsonify({"photos": urls})


@app.route("/<path:path>")
def static_files(path):
    if not is_safe_static_path(path):
        return json_error("Sayfa bulunamadı.", 404)
    target = ROOT / path
    if not target.is_file():
        return json_error("Sayfa bulunamadı.", 404)
    return send_from_directory(ROOT, path)


@app.get("/api/universities")
def list_universities():
    return jsonify(
        [
            {
                "id": u["id"],
                "name": u["name"],
                "city": u["city"],
                "domains": u["domains"],
                "email_example": u["email_example"],
            }
            for u in UNIVERSITIES
        ]
    )


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()
    university_id = data.get("university_id") or ""

    if not email or not password or not name or not university_id:
        return json_error("Tüm alanlar zorunludur.")

    if len(password) < 6:
        return json_error("Şifre en az 6 karakter olmalıdır.")

    uni = get_university(university_id)
    if not uni:
        return json_error("Geçersiz üniversite seçimi.")

    if not email_matches_university(email, university_id):
        domains = ", ".join(f"@{d}" for d in uni["domains"])
        return json_error(f"Bu üniversite için geçerli bir e-posta girin. Kabul edilen domainler: {domains}")

    existing = get_user_by_email(email)
    if existing:
        return json_error("Bu e-posta adresi zaten kayıtlı.")

    code = generate_code()
    create_pending_verification(
        email=email,
        password_hash=hash_password(password),
        name=name,
        university_id=university_id,
        code=code,
    )

    mail_result = send_verification_safe(email, code, uni["name"])
    response, status = mail_response(email, mail_result)
    return jsonify(response), status


@app.post("/api/auth/verify")
def verify():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code = (data.get("code") or "").strip()

    if not email or not code:
        return json_error("E-posta ve doğrulama kodu zorunludur.")

    pending = get_pending_verification(email)
    if not pending:
        return json_error("Doğrulama kaydı bulunamadı. Lütfen tekrar kayıt olun.")

    expires_at = datetime.fromisoformat(pending["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        delete_pending_verification(email)
        return json_error("Doğrulama kodunun süresi doldu. Lütfen tekrar kayıt olun.")

    if pending["code"] != code:
        return json_error("Geçersiz doğrulama kodu.")

    user_id = create_user(
        email=pending["email"],
        password_hash=pending["password_hash"],
        name=pending["name"],
        university_id=pending["university_id"],
    )
    delete_pending_verification(email)

    token = generate_token()
    create_session(token, user_id)
    user = get_user_by_email(email)

    return jsonify(
        {
            "message": "Kayıt tamamlandı. Hoş geldiniz!",
            "token": token,
            "user": user_to_public(user),
        }
    )


@app.post("/api/auth/resend-code")
def resend_code():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    pending = get_pending_verification(email)
    if not pending:
        return json_error("Doğrulama kaydı bulunamadı.")

    uni = get_university(pending["university_id"])
    if not uni:
        return json_error("Üniversite bilgisi bulunamadı.")

    code = generate_code()
    create_pending_verification(
        email=pending["email"],
        password_hash=pending["password_hash"],
        name=pending["name"],
        university_id=pending["university_id"],
        code=code,
    )

    mail_result = send_verification_safe(email, code, uni["name"])

    if mail_result.get("sent"):
        return jsonify({"message": "Yeni doğrulama kodu gönderildi.", "email": email})

    response, status = mail_response(email, mail_result)
    return jsonify(response), status


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return json_error("E-posta ve şifre zorunludur.")

    user = get_user_by_email(email)
    if not user or user["password_hash"] != hash_password(password):
        return json_error("E-posta veya şifre hatalı.", 401)

    if not user["verified"]:
        return json_error("Hesabınız henüz doğrulanmamış.", 403)

    token = generate_token()
    create_session(token, user["id"])

    return jsonify({"token": token, "user": user_to_public(user)})


@app.post("/api/auth/forgot-password")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    if not email:
        return json_error("E-posta adresi zorunludur.")

    user = get_user_by_email(email)
    generic_message = "Kayıtlı bir hesap varsa sıfırlama kodu e-posta adresinize gönderildi."
    if not user or not user["verified"]:
        return jsonify({"message": generic_message, "email": email})

    code = generate_code()
    create_pending_password_reset(email, code)

    mail_result = send_password_reset_safe(email, code)
    if mail_result.get("sent"):
        return jsonify({
            "message": "Şifre sıfırlama kodu e-posta adresinize gönderildi.",
            "email": email,
        })

    response, status = mail_response(email, mail_result)
    if status != 200 and not config.EXPOSE_DEV_CODE:
        return jsonify({"message": generic_message, "email": email})
    return jsonify(response), status


@app.post("/api/auth/reset-password")
def reset_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code = (data.get("code") or "").strip()
    password = data.get("password") or ""

    if not email or not code or not password:
        return json_error("E-posta, kod ve yeni şifre zorunludur.")

    if len(password) < 6:
        return json_error("Şifre en az 6 karakter olmalıdır.")

    user = get_user_by_email(email)
    if not user:
        return json_error("Bu e-posta ile kayıtlı hesap bulunamadı.")

    pending = get_pending_password_reset(email)
    if not pending:
        return json_error("Sıfırlama kaydı bulunamadı. Lütfen tekrar kod isteyin.")

    expires_at = datetime.fromisoformat(pending["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        delete_pending_password_reset(email)
        return json_error("Sıfırlama kodunun süresi doldu. Lütfen tekrar kod isteyin.")

    if pending["code"] != code:
        return json_error("Geçersiz sıfırlama kodu.")

    update_user_password(email, hash_password(password))
    delete_pending_password_reset(email)

    return jsonify({"message": "Şifreniz güncellendi. Giriş yapabilirsiniz.", "email": email})


@app.get("/api/auth/me")
def me():
    token = get_bearer_token()
    if not token:
        return json_error("Oturum bulunamadı.", 401)

    session = get_session(token)
    if not session:
        return json_error("Oturum süresi dolmuş.", 401)

    return jsonify(
        {
            "user": {
                "id": session["user_id"],
                "email": session["email"],
                "name": session["name"],
                "university_id": session["university_id"],
                "verified": bool(session["verified"]),
            }
        }
    )


@app.post("/api/auth/logout")
def logout():
    token = get_bearer_token()
    if token:
        delete_session(token)
    return jsonify({"message": "Çıkış yapıldı."})


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.errorhandler(404)
def not_found(_error):
    return json_error("Sayfa bulunamadı.", 404)


@app.errorhandler(500)
def server_error(_error):
    return json_error("Sunucu hatası.", 500)


if __name__ == "__main__":
    print(f"BuHouse sunucusu: http://localhost:{config.PORT}")
    print(smtp_startup_message())
    app.run(host="0.0.0.0", port=config.PORT, debug=config.FLASK_DEBUG)
