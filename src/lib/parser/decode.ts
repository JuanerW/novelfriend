/**
 * TXT 解码。规范里写的是只支持 UTF-8，但实际下载到的中文小说
 * 很多是 GBK/GB18030，直接按 UTF-8 读会整篇乱码，所以做一次回退。
 */
export function decodeNovel(buffer: ArrayBuffer): {
  text: string;
  encoding: string;
} {
  // 先严格按 UTF-8 解，遇到非法字节会抛错
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { text, encoding: "utf-8" };
  } catch {
    // 落到 GB18030（兼容 GBK/GB2312）
    try {
      const text = new TextDecoder("gb18030").decode(buffer);
      return { text, encoding: "gb18030" };
    } catch {
      // 最后放宽 UTF-8，让非法字节变成替换符，至少不整个失败
      return {
        text: new TextDecoder("utf-8").decode(buffer),
        encoding: "utf-8(lossy)",
      };
    }
  }
}
