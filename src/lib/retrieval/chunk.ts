/**
 * 章节内文本切分。
 *
 * 规则（来自 CLAUDE.md）：
 * - Chunk 不跨章节
 * - 每个 Chunk 约 500–800 tokens
 * - 相邻 Chunk 重叠约 50 tokens
 * - 每个 Chunk 保存 chapter_index
 */

export type Chunk = {
  chapterIndex: number;
  chunkIndex: number;
  content: string;
};

export const TARGET_TOKENS = 700;
export const MAX_TOKENS = 800;
export const OVERLAP_TOKENS = 50;

/**
 * 粗略估算 token 数。
 *
 * 不引入 tiktoken——它体积大、还要按模型选编码表，而这里只需要
 * 「切出来别超过上限」这个精度。经验值：中日韩字符约 1 字 1 token，
 * 其余（英文、数字、标点）约 4 字符 1 token。
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/[㐀-鿿豈-﫿぀-ヿ]/.test(ch)) cjk++;
    else other++;
  }
  return Math.ceil(cjk + other / 4);
}

/** 按段落切开；段落本身超长时再按句号切。 */
function splitIntoUnits(text: string): string[] {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const units: string[] = [];

  for (const p of paragraphs) {
    if (estimateTokens(p) <= MAX_TOKENS) {
      units.push(p);
      continue;
    }
    // 超长段落按句末标点切，标点跟着前一句
    const sentences = p.split(/(?<=[。！？!?…])/g).filter((s) => s.trim());
    let buffer = "";
    for (const s of sentences) {
      if (buffer && estimateTokens(buffer + s) > MAX_TOKENS) {
        units.push(buffer);
        buffer = s;
      } else {
        buffer += s;
      }
    }
    if (buffer.trim()) units.push(buffer);
  }

  return units;
}

/** 从一段文本尾部取约 OVERLAP_TOKENS 个 token 作为下一块的开头。 */
function tailForOverlap(text: string): string {
  if (estimateTokens(text) <= OVERLAP_TOKENS) return text;

  // 从后往前累加字符，直到够 OVERLAP_TOKENS
  let taken = "";
  for (let i = text.length - 1; i >= 0; i--) {
    taken = text[i] + taken;
    if (estimateTokens(taken) >= OVERLAP_TOKENS) break;
  }

  // 尽量从一个句子边界开始，读起来完整一些
  const boundary = taken.search(/(?<=[。！？!?…\n])./);
  return boundary > 0 ? taken.slice(boundary) : taken;
}

/** 切分单个章节。 */
export function chunkChapter(
  chapterIndex: number,
  content: string,
): Chunk[] {
  const units = splitIntoUnits(content);
  if (units.length === 0) return [];

  const chunks: Chunk[] = [];
  let current = "";

  const flush = () => {
    const text = current.trim();
    if (!text) return;
    chunks.push({
      chapterIndex,
      chunkIndex: chunks.length,
      content: text,
    });
  };

  for (const unit of units) {
    const candidate = current ? `${current}\n${unit}` : unit;

    if (estimateTokens(candidate) <= TARGET_TOKENS) {
      current = candidate;
      continue;
    }

    // 放不下了：先结算当前块，再用重叠内容起新块
    if (current) {
      flush();
      const overlap = tailForOverlap(current);
      current = overlap ? `${overlap}\n${unit}` : unit;
    } else {
      // 单个 unit 就超了 TARGET，独立成块
      current = unit;
      flush();
      current = "";
    }
  }

  flush();
  return chunks;
}

/** 切分整本书，chunk_index 在章节内从 0 开始。 */
export function chunkChapters(
  chapters: { chapterIndex: number; content: string }[],
): Chunk[] {
  return chapters.flatMap((c) => chunkChapter(c.chapterIndex, c.content));
}
