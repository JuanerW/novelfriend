import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// crypto.ts 里是调用时才读环境变量的，所以静态 import 也没问题
process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");

import { encryptApiKey, decryptApiKey, maskApiKey } from "./crypto";

const KEY = "sk-proj-abcdefghijklmnop1234567890XYZ";

test("加密后能原样解回", () => {
  assert.equal(decryptApiKey(encryptApiKey(KEY)), KEY);
});

test("同一个 Key 两次加密的密文不同（IV 随机）", () => {
  assert.notEqual(encryptApiKey(KEY), encryptApiKey(KEY));
});

test("密文里不含明文", () => {
  assert.ok(!encryptApiKey(KEY).includes(KEY));
  assert.ok(!encryptApiKey(KEY).includes("sk-proj"));
});

test("篡改密文会被 GCM 认证标签发现", () => {
  const enc = encryptApiKey(KEY);
  assert.throws(() => decryptApiKey(enc.slice(0, -4) + "AAAA"));
});

test("格式不对直接拒绝", () => {
  assert.throws(() => decryptApiKey("garbage"), /格式不正确/);
  assert.throws(() => decryptApiKey("v2.a.b.c"), /格式不正确/);
});

test("空 Key 拒绝加密", () => {
  assert.throws(() => encryptApiKey(""), /不能为空/);
});

test("遮罩只露出头尾", () => {
  assert.equal(maskApiKey(KEY), "sk-…0XYZ");
  assert.equal(maskApiKey("short"), "••••");
  assert.ok(!maskApiKey(KEY).includes("proj"));
});

test("密钥长度不对时报错", async () => {
  const saved = process.env.API_KEY_ENCRYPTION_SECRET;
  process.env.API_KEY_ENCRYPTION_SECRET = Buffer.from("tooshort").toString("base64");
  assert.throws(() => encryptApiKey(KEY), /32 字节/);
  process.env.API_KEY_ENCRYPTION_SECRET = saved;
});

test("没配密钥时给出可操作的提示", () => {
  const saved = process.env.API_KEY_ENCRYPTION_SECRET;
  delete process.env.API_KEY_ENCRYPTION_SECRET;
  assert.throws(() => encryptApiKey(KEY), /API_KEY_ENCRYPTION_SECRET/);
  process.env.API_KEY_ENCRYPTION_SECRET = saved;
});
