#!/usr/bin/env python3
"""
Utility untuk membuat JWT secret, postgres password, anon key, dan service_role key
secara otomatis untuk instalasi mandiri Supabase Self-Hosted di VM baru.

Menghasilkan token HS256 standar Supabase yang valid untuk kong/envoy & gotrue.
"""
import base64
import hashlib
import hmac
import json
import secrets
import sys
import time

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def sign_jwt(secret: str, role: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": "supabase",
        "ref": "cortexclip",
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + (10 * 365 * 24 * 3600), # 10 tahun
    }
    h_b64 = b64url(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    p_b64 = b64url(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    signing_input = f"{h_b64}.{p_b64}".encode('utf-8')
    sig = hmac.new(secret.encode('utf-8'), signing_input, hashlib.sha256).digest()
    return f"{h_b64}.{p_b64}.{b64url(sig)}"

def main():
    jwt_secret = secrets.token_hex(32) # 64 hex chars
    db_password = secrets.token_urlsafe(24)
    anon_key = sign_jwt(jwt_secret, "anon")
    service_role_key = sign_jwt(jwt_secret, "service_role")

    print("=================================================================")
    print("      CORTEXCLIP SUPABASE CREDENTIALS GENERATOR (VM BARU)       ")
    print("=================================================================")
    print(f"POSTGRES_PASSWORD={db_password}")
    print(f"JWT_SECRET={jwt_secret}")
    print(f"ANON_KEY={anon_key}")
    print(f"SERVICE_ROLE_KEY={service_role_key}")
    print("=================================================================")
    print("\n--- Snippet untuk supabase-docker/docker/.env ---")
    print(f"POSTGRES_PASSWORD={db_password}")
    print(f"JWT_SECRET={jwt_secret}")
    print(f"ANON_KEY={anon_key}")
    print(f"SERVICE_ROLE_KEY={service_role_key}")
    print("\n--- Snippet untuk backend/.env ---")
    print(f"SUPABASE_URL=http://127.0.0.1:8000")
    print(f"SUPABASE_SERVICE_KEY={service_role_key}")
    print(f"SUPABASE_ANON_KEY={anon_key}")
    print(f"SUPABASE_DB_PASSWORD={db_password}")
    print("\n--- Snippet untuk frontend .env ---")
    print(f"VITE_SUPABASE_URL=http://<IP_ATAU_DOMAIN>")
    print(f"VITE_SUPABASE_PUBLISHABLE_KEY={anon_key}")

if __name__ == "__main__":
    main()
