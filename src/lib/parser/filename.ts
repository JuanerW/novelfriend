/**
 * 把用户上传的文件名转成 Supabase Storage 能接受的对象名。
 *
 * Storage 的 key 校验里 `\w` 是 ASCII-only，中文、全角标点（比如
 * 《三体I：地球往事.txt》里的全角冒号）都会被拒，报 `Invalid key`。
 *
 * 真正的书名保存在 books.title，所以这里可以放心把非 ASCII 字符替换掉，
 * 不会丢信息。
 */

/** 对象名最长多少字符，留出 {user_id}/{book_id}/ 前缀的余量。 */
const MAX_NAME_LENGTH = 80;

export function toStorageName(filename: string): string {
  // 拆出扩展名，单独清洗，避免扩展名被截断
  const lastDot = filename.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < filename.length - 1;

  const rawBase = hasExt ? filename.slice(0, lastDot) : filename;
  const rawExt = hasExt ? filename.slice(lastDot + 1) : "";

  const clean = (s: string) =>
    s
      // 允许的字符之外一律换成下划线
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      // 连续下划线合成一个
      .replace(/_+/g, "_")
      .replace(/^[._-]+|[._-]+$/g, "");

  const base = clean(rawBase).slice(0, MAX_NAME_LENGTH);
  const ext = clean(rawExt).toLowerCase() || "txt";

  // 中文书名清洗后往往只剩一两个零碎字符（《三体I：地球往事》只剩个 "I"），
  // 那样不如直接用兜底名。真书名在 books.title 里，这里只要能存住就行。
  const meaningful = (base.match(/[A-Za-z0-9]/g) ?? []).length >= 2;

  return `${meaningful ? base : "novel"}.${ext}`;
}
