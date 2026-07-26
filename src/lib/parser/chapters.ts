/**
 * 中文 TXT 小说章节切分。
 *
 * 只做常见格式，识别不出来就整本当一章，由调用方提示用户。
 *
 * 关键点是「编号连续性校验」：正文里经常出现 `1、物理学` 这类提纲列表，
 * 光靠正则会误判成章节。所以候选标题还必须构成 1,2,3… 的递增序列才算数。
 */

export type ParsedChapter = {
  chapterIndex: number; // 从 1 开始
  title: string;
  content: string;
};

/** 标题行最长多少字符——超过就认为是正文里恰好提到了「第三章」。 */
const MAX_TITLE_LENGTH = 40;

/** 相邻章节编号最大允许跳跃，防止把年份、页码认成章节号。 */
const MAX_ORDINAL_GAP = 20;

const CN_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/** 解析中文数字，只支持到「九千九百九十九」，小说章节够用了。 */
function parseChineseNumber(s: string): number | null {
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);

  let section = 0; // 已经结算的部分（十/百/千）
  let digit = 0; // 待结算的个位

  for (const ch of s) {
    if (ch in CN_DIGITS) {
      digit = CN_DIGITS[ch];
    } else if (ch === "十") {
      section += (digit || 1) * 10;
      digit = 0;
    } else if (ch === "百") {
      section += (digit || 1) * 100;
      digit = 0;
    } else if (ch === "千") {
      section += (digit || 1) * 1000;
      digit = 0;
    } else {
      return null;
    }
  }

  const total = section + digit;
  return total > 0 ? total : null;
}

// 「第X章」「第 12 节」「第001回」「第1卷」
const NUMBERED_HEADING =
  /^第\s*([0-9零〇一二三四五六七八九十百千两]{1,12})\s*[章节節回卷篇部集](?:\s*[:：、.．\-—]?\s*(.*))?$/;

// 「1.科学边界」「12．红岸之二」——只认半角/全角句点，顿号留给正文提纲
const DOTTED_HEADING = /^(\d{1,4})\s*[.．]\s*(\S.*)$/;

// 无编号的特殊章节
const SPECIAL_HEADING =
  /^(楔子|序章|序言|序|前言|引子|尾声|尾聲|后记|後記|番外|终章|終章)(?:\s*[:：、.．\-—]?\s*(.*))?$/;

type Candidate = {
  line: number;
  title: string;
  /** 有编号的章节给出序号，特殊章节为 null。 */
  ordinal: number | null;
};

function matchHeading(rawLine: string, lineNo: number): Candidate | null {
  const line = rawLine.trim();
  if (!line || line.length > MAX_TITLE_LENGTH) return null;
  // 以句末标点结尾的多半是正文，例如「他翻开了第三章。」
  if (/[。！？!?，,；;：:]$/.test(line)) return null;

  const numbered = NUMBERED_HEADING.exec(line);
  if (numbered) {
    return { line: lineNo, title: line, ordinal: parseChineseNumber(numbered[1]) };
  }

  // 日期行「1989.03.21」不是章节标题
  if (/^\d{1,4}\s*[.．]\s*\d/.test(line)) return null;

  const dotted = DOTTED_HEADING.exec(line);
  if (dotted) {
    return { line: lineNo, title: line, ordinal: parseInt(dotted[1], 10) };
  }

  if (SPECIAL_HEADING.test(line)) {
    return { line: lineNo, title: line, ordinal: null };
  }

  return null;
}

/**
 * 只保留编号能接上的候选。
 * 允许起始编号是 0 或 1，允许中间跳号（有些书缺章），但不允许倒退。
 */
function keepSequential(candidates: Candidate[]): Candidate[] {
  const kept: Candidate[] = [];
  let lastOrdinal = 0;

  for (const c of candidates) {
    if (c.ordinal === null) {
      kept.push(c); // 楔子/后记这类不参与编号校验
      continue;
    }
    // 编号必须递增，且不能跳得太离谱（挡住年份、页码之类）
    if (c.ordinal > lastOrdinal && c.ordinal <= lastOrdinal + MAX_ORDINAL_GAP) {
      kept.push(c);
      lastOrdinal = c.ordinal;
    }
  }

  return kept;
}

/** 去掉 BOM，统一换行。 */
export function normalizeText(raw: string): string {
  return raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/**
 * 去掉下载站水印：短行且在全文重复出现 5 次以上。
 * 例如每章开头都插一行「《三体》 作者：刘慈欣」。
 */
function stripWatermarks(lines: string[]): string[] {
  const counts = new Map<string, number>();
  for (const l of lines) {
    const t = l.trim();
    if (t && t.length <= 30) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const noise = new Set(
    [...counts.entries()].filter(([, n]) => n >= 5).map(([t]) => t),
  );
  if (noise.size === 0) return lines;
  return lines.map((l) => (noise.has(l.trim()) ? "" : l));
}

export type ParseResult = {
  chapters: ParsedChapter[];
  /** true 表示没识别出任何章节标题，整本作为一章。 */
  fallback: boolean;
};

export function parseChapters(raw: string): ParseResult {
  const text = normalizeText(raw);
  const lines = stripWatermarks(text.split("\n"));

  const candidates: Candidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    const c = matchHeading(lines[i], i);
    if (c) candidates.push(c);
  }

  const headings = keepSequential(candidates);

  // 只有一两个候选时不足以判定是分章的书，整本作为一章更安全
  if (headings.length < 2) {
    const content = text.trim();
    return {
      chapters: content ? [{ chapterIndex: 1, title: "全文", content }] : [],
      fallback: true,
    };
  }

  const chapters: ParsedChapter[] = [];

  // 第一个标题之前的正文单独保留，避免丢内容
  const preface = lines.slice(0, headings[0].line).join("\n").trim();
  if (preface) {
    chapters.push({ chapterIndex: 1, title: "前言", content: preface });
  }

  for (let h = 0; h < headings.length; h++) {
    const start = headings[h].line;
    const end = h + 1 < headings.length ? headings[h + 1].line : lines.length;
    const content = lines.slice(start + 1, end).join("\n").trim();

    // 连着两个标题行（目录残留）就跳过空的那个
    if (!content) continue;

    chapters.push({
      chapterIndex: 0, // 下面统一重编号
      title: headings[h].title,
      content,
    });
  }

  chapters.forEach((c, i) => {
    c.chapterIndex = i + 1;
  });

  return { chapters, fallback: chapters.length === 0 };
}

/** 从文件名猜书名：去掉扩展名和常见的下载站后缀。 */
export function guessTitleFromFilename(filename: string): string {
  return (
    filename
      .replace(/\.[^.]+$/, "")
      .replace(/[（([【][^)）\]】]*[)）\]】]\s*$/, "")
      .trim() || "未命名"
  );
}
