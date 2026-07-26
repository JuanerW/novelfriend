import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * 用户 LLM API Key 的加密存储。
 *
 * AES-256-GCM，密文格式 `v1.<iv>.<authTag>.<ciphertext>`（各段 base64url）。
 * 密钥来自 API_KEY_ENCRYPTION_SECRET，只在服务端读取。
 */

const VERSION = "v1";
const IV_BYTES = 12; // GCM 推荐 96 位
const KEY_BYTES = 32;

function getKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "缺少 API_KEY_ENCRYPTION_SECRET，无法加解密 API Key。" +
        '生成方式：node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }

  const key = Buffer.from(secret, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `API_KEY_ENCRYPTION_SECRET 必须是 base64 编码的 32 字节密钥，当前解出 ${key.length} 字节。`,
    );
  }
  return key;
}

export function encryptApiKey(plaintext: string): string {
  if (!plaintext) throw new Error("API Key 不能为空。");

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptApiKey(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("API Key 密文格式不正确。");
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * 给前端看的遮罩，例如 `sk-…a1b2`。
 * 接口永远不返回完整 Key。
 */
export function maskApiKey(plaintext: string): string {
  if (plaintext.length <= 8) return "••••";
  return `${plaintext.slice(0, 3)}…${plaintext.slice(-4)}`;
}

/** 常量时间比较，避免比较密文时泄露信息。 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
