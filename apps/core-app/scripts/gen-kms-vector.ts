/**
 * 生成跨语言 KMS 测试向量:TS 加密侧(account,envelope.ts)产出,
 * Python 解密侧(gateway/tests/test_kms_vector.py)校验,锁死信封线格式互通。
 * 线格式变更时重跑:pnpm --filter @mogwai/core-app tsx scripts/gen-kms-vector.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// 仅测试向量用的固定 KEK,与任何环境无关
const VECTOR_KEK = "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";
process.env.MOGWAI_KMS_BACKEND = "env_kek";
process.env.MOGWAI_DEV_KEK = VECTOR_KEK;

const { envelopeEncrypt, envelopeDecrypt } = await import("../src/modules/account/envelope.js");

const plaintext = "sk-mogwai-cross-language-vector";
const sealed = envelopeEncrypt(plaintext);

if (envelopeDecrypt(sealed) !== plaintext) {
  throw new Error("self round-trip failed");
}

const out = resolve(import.meta.dirname, "../../../gateway/tests/kms_vector.json");
writeFileSync(
  out,
  `${JSON.stringify(
    {
      _comment:
        "TS encrypt-side vector (apps/core-app scripts/gen-kms-vector.ts); python decrypt-side must recover plaintext",
      kek_hex: VECTOR_KEK,
      plaintext,
      nonce: sealed.nonce,
      ciphertext: sealed.ciphertext,
      encrypted_dek: sealed.encryptedDek,
    },
    null,
    2,
  )}\n`,
);
console.log(`wrote ${out}`);
