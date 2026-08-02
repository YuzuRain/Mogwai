import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Provider Key 的信封加密(tech-design §2.1)。线格式契约与 gateway 解密侧
 * (gateway/plugins/kms.py + key_resolver.py)逐字节一致,跨语言测试向量见
 * gateway/tests/test_kms_vector.py:
 *
 *   nonce         = base64(12B GCM nonce)
 *   ciphertext    = base64(AES-256-GCM(DEK, key 明文) ‖ 16B tag)
 *   encrypted_dek = base64(12B nonce ‖ AES-256-GCM(KEK, DEK) ‖ 16B tag)   (env_kek 后端)
 *
 * KMS 后端选择与 gateway 同一组环境变量(MOGWAI_KMS_BACKEND / MOGWAI_DEV_KEK)。
 * openbao_transit 的加密侧随 OpenBao 进 infra 时实现(journal/TODO.md account 项)。
 */

const GCM_NONCE_LEN = 12;

function loadKek(): Buffer {
  const backend = process.env.MOGWAI_KMS_BACKEND ?? "env_kek";
  if (backend !== "env_kek") {
    throw new Error(`kms: encrypt path for backend '${backend}' not implemented (env_kek only, M1)`);
  }
  const kekHex = process.env.MOGWAI_DEV_KEK;
  if (!kekHex) {
    throw new Error("kms: MOGWAI_KMS_BACKEND=env_kek requires MOGWAI_DEV_KEK");
  }
  const kek = Buffer.from(kekHex, "hex");
  if (kek.length !== 32) {
    throw new Error("kms: MOGWAI_DEV_KEK must be 32 bytes (64 hex chars)");
  }
  return kek;
}

function gcmEncrypt(key: Buffer, plaintext: Buffer): { nonce: Buffer; sealed: Buffer } {
  const nonce = randomBytes(GCM_NONCE_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const sealed = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return { nonce, sealed };
}

function gcmDecrypt(key: Buffer, nonce: Buffer, sealed: Buffer): Buffer {
  const tag = sealed.subarray(sealed.length - 16);
  const body = sealed.subarray(0, sealed.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export interface EnvelopeSealed {
  nonce: string;
  ciphertext: string;
  encryptedDek: string;
}

export function envelopeEncrypt(plaintext: string): EnvelopeSealed {
  const kek = loadKek();
  const dek = randomBytes(32);
  const data = gcmEncrypt(dek, Buffer.from(plaintext, "utf8"));
  const wrapped = gcmEncrypt(kek, dek);
  return {
    nonce: data.nonce.toString("base64"),
    ciphertext: data.sealed.toString("base64"),
    encryptedDek: Buffer.concat([wrapped.nonce, wrapped.sealed]).toString("base64"),
  };
}

/** 巡检/重探测需要还原明文(内存中用完即弃,与网关同一纪律)。 */
export function envelopeDecrypt(sealed: EnvelopeSealed): string {
  const kek = loadKek();
  const dekBlob = Buffer.from(sealed.encryptedDek, "base64");
  const dek = gcmDecrypt(kek, dekBlob.subarray(0, GCM_NONCE_LEN), dekBlob.subarray(GCM_NONCE_LEN));
  return gcmDecrypt(
    dek,
    Buffer.from(sealed.nonce, "base64"),
    Buffer.from(sealed.ciphertext, "base64"),
  ).toString("utf8");
}
