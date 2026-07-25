"""pre-call hook: Redis key-routing projection -> AES-256-GCM decrypt -> inject api_key.

Spike counterpart of architecture.md A4 key_resolver. Proves a CustomLogger
async_pre_call_hook can swap the provider credential per request. Debt-routing
priority (tech-design §10.3) is not exercised here; it reads another projection
through the exact same mechanism.
"""

import base64
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from litellm.integrations.custom_logger import CustomLogger

from spike_redis import get_redis

KEY_PROJECTION_PREFIX = "proj:keys:"


def _decrypt(nonce_b64: str, ciphertext_b64: str) -> str:
    kek = bytes.fromhex(os.environ["SPIKE_KEK"])
    plaintext = AESGCM(kek).decrypt(
        base64.b64decode(nonce_b64), base64.b64decode(ciphertext_b64), None
    )
    return plaintext.decode()


class KeyResolver(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data: dict, call_type: str):
        user_id = user_api_key_dict.user_id
        if not user_id:
            raise ValueError("key_resolver: no user_id on request (platform_auth not applied?)")

        raw = await get_redis().get(KEY_PROJECTION_PREFIX + user_id)
        if raw is None:
            raise ValueError(f"key_resolver: no key projection for user {user_id}")

        provider = data.get("model", "").split("/", 1)[0]
        entries = [e for e in json.loads(raw) if e["provider"] == provider]
        if not entries:
            raise ValueError(f"key_resolver: user {user_id} has no key for provider {provider}")

        entry = entries[0]
        data["api_key"] = _decrypt(entry["nonce"], entry["ciphertext"])
        return data


key_resolver_instance = KeyResolver()
