"""Cross-language envelope-encryption vector.

The account module (TypeScript, apps/core-app envelope.ts) encrypts provider
keys; this gateway (Python, plugins/kms.py + key_resolver.py) decrypts them.
The wire format is a documented contract -- this test pins byte-level
compatibility using a committed vector produced by the TS encrypt side
(regenerate: pnpm --filter @mogwai/core-app tsx scripts/gen-kms-vector.ts).
"""

from __future__ import annotations

import asyncio
import base64
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

sys.path.insert(0, "/gateway-plugins")

VECTOR = json.loads((Path(__file__).parent / "kms_vector.json").read_text())


def test_ts_encrypted_envelope_decrypts(monkeypatch):
    monkeypatch.setenv("MOGWAI_DEV_KEK", VECTOR["kek_hex"])
    from kms import EnvKekKms  # noqa: E402  (env must be set before init)

    dek = asyncio.run(EnvKekKms().decrypt_dek(VECTOR["encrypted_dek"]))
    assert len(dek) == 32

    # exactly what key_resolver.py does with the projection entry
    plaintext = (
        AESGCM(dek)
        .decrypt(
            base64.b64decode(VECTOR["nonce"]),
            base64.b64decode(VECTOR["ciphertext"]),
            None,
        )
        .decode()
    )
    assert plaintext == VECTOR["plaintext"]
