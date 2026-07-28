"""KMS client for the envelope-encryption KEK layer (architecture A3 #22).

Provider keys are envelope-encrypted (tech-design §2.1):

    provider key --AES-256-GCM--> ciphertext        (DEK, per key, random)
    DEK          --KEK---------->  encrypted_dek     (this module's concern)

The gateway only ever *unwraps* DEKs. Three interchangeable backends are
planned (same interface, selected per environment); two exist today:

- ``env_kek``        dev/local only: KEK is a hex env var, unwrap in-process.
- ``openbao_transit``self-hosted OpenBao/Vault Transit ``decrypt`` API.
- cloud KMS          added when production infra lands (M4+), same interface.

Wire format for ``encrypted_dek`` produced by the account module and consumed
here (documented contract, also noted in packages/shared key-routing.ts):

    base64( 12-byte GCM nonce || AES-256-GCM ciphertext of the 32-byte DEK )

Environment variables:

=====================  =======================================================
MOGWAI_KMS_BACKEND     ``env_kek`` (default) | ``openbao_transit``
MOGWAI_DEV_KEK         hex-encoded 32-byte KEK (env_kek backend only)
OPENBAO_ADDR           e.g. ``http://openbao:8200`` (openbao_transit only)
OPENBAO_TOKEN          transit-capable token (openbao_transit only)
OPENBAO_TRANSIT_KEY    transit key name, default ``mogwai-kek``
=====================  =======================================================
"""

from __future__ import annotations

import base64
import os
from abc import ABC, abstractmethod

import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_GCM_NONCE_LEN = 12


class KmsClient(ABC):
    """Unwraps envelope-encrypted DEKs. Implementations must fail loudly."""

    @abstractmethod
    async def decrypt_dek(self, encrypted_dek_b64: str) -> bytes:
        """Return the plaintext 32-byte DEK. Raise on any failure."""


class EnvKekKms(KmsClient):
    """Dev/local backend: KEK lives in an env var. Never use in production."""

    def __init__(self) -> None:
        kek_hex = os.environ.get("MOGWAI_DEV_KEK")
        if not kek_hex:
            raise RuntimeError("kms: MOGWAI_KMS_BACKEND=env_kek requires MOGWAI_DEV_KEK")
        self._kek = bytes.fromhex(kek_hex)
        if len(self._kek) != 32:
            raise RuntimeError("kms: MOGWAI_DEV_KEK must be 32 bytes (64 hex chars)")

    async def decrypt_dek(self, encrypted_dek_b64: str) -> bytes:
        blob = base64.b64decode(encrypted_dek_b64)
        nonce, ciphertext = blob[:_GCM_NONCE_LEN], blob[_GCM_NONCE_LEN:]
        return AESGCM(self._kek).decrypt(nonce, ciphertext, None)


class OpenBaoTransitKms(KmsClient):
    """Self-hosted backend: OpenBao (Vault fork) Transit engine ``decrypt``."""

    def __init__(self) -> None:
        self._addr = os.environ["OPENBAO_ADDR"].rstrip("/")
        self._token = os.environ["OPENBAO_TOKEN"]
        self._key_name = os.environ.get("OPENBAO_TRANSIT_KEY", "mogwai-kek")

    async def decrypt_dek(self, encrypted_dek_b64: str) -> bytes:
        # Transit expects its own ``vault:v1:...`` ciphertext format, which the
        # account module stores verbatim (base64-wrapped) in the projection.
        ciphertext = base64.b64decode(encrypted_dek_b64).decode()
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{self._addr}/v1/transit/decrypt/{self._key_name}",
                headers={"X-Vault-Token": self._token},
                json={"ciphertext": ciphertext},
            )
        resp.raise_for_status()
        return base64.b64decode(resp.json()["data"]["plaintext"])


_client: KmsClient | None = None


def get_kms() -> KmsClient:
    """Backend singleton, selected by MOGWAI_KMS_BACKEND (default env_kek)."""
    global _client
    if _client is None:
        backend = os.environ.get("MOGWAI_KMS_BACKEND", "env_kek")
        if backend == "env_kek":
            _client = EnvKekKms()
        elif backend == "openbao_transit":
            _client = OpenBaoTransitKms()
        else:
            raise RuntimeError(f"kms: unknown MOGWAI_KMS_BACKEND {backend!r}")
    return _client
