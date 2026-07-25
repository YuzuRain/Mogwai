"""One-shot seeder: writes the two Redis projections the spike plugins read.

Seed data lives only here (dedicated seed script, per no-mocks rule).
"""

import base64
import hashlib
import json
import os

import redis
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PLATFORM_TOKEN = "sk_spike_platform_token_001"
USER_ID = "u_spike_1"
FAKE_OPENAI_KEY = "sk-fake-openai-key-A1B2C3"  # what fake_provider should receive
FAKE_ANTHROPIC_KEY = "sk-fake-anthropic-key-D4E5F6"

r = redis.Redis(host=os.environ["REDIS_HOST"], port=6379, decode_responses=True)
kek = bytes.fromhex(os.environ["SPIKE_KEK"])

# 1. token projection: sha256(platform token) -> user identity
token_hash = hashlib.sha256(PLATFORM_TOKEN.encode()).hexdigest()
r.hset(
    f"proj:token:{token_hash}",
    mapping={"user_id": USER_ID, "privacy_mode": "0", "blocked": "0"},
)

# 2. key-routing projection: user -> encrypted provider keys (multi-provider)
def encrypted_entry(provider: str, key: str, whitelist: list[str]) -> dict:
    nonce = os.urandom(12)
    ciphertext = AESGCM(kek).encrypt(nonce, key.encode(), None)
    return {
        "provider": provider,
        "nonce": base64.b64encode(nonce).decode(),
        "ciphertext": base64.b64encode(ciphertext).decode(),
        "model_whitelist": whitelist,
    }


r.set(
    f"proj:keys:{USER_ID}",
    json.dumps(
        [
            encrypted_entry("openai", FAKE_OPENAI_KEY, ["gpt-3.5-turbo"]),
            encrypted_entry("anthropic", FAKE_ANTHROPIC_KEY, ["claude-3-haiku"]),
        ]
    ),
)

print(f"seeded: token projection ({token_hash[:12]}...) + key projection for {USER_ID}")
