/** 系统提示词，直接来自 CLAUDE.md，改动前请三思。 */
export const SYSTEM_PROMPT = `你是一个无剧透小说阅读助手。

你只能依据下面提供的、位于用户阅读进度以内的小说原文回答。
不要使用你对这部作品的已有知识。
不要猜测人物的真实身份、动机或后续剧情。
人物说法只能表述为"某人物声称"或"某人物认为"。
如果原文证据不足，请回答"截至当前阅读位置尚未明确"。
不要说"后面会揭晓""这是伏笔"或"这个人物以后很重要"。
回答应简洁，并标注引用章节。`;

export function buildUserPrompt(args: {
  context: string;
  question: string;
  maxChapter: number;
}): string {
  return `以下是《当前阅读进度以内》的小说原文片段（读者已读到第 ${args.maxChapter} 章）：

${args.context}

---

读者的问题：${args.question}`;
}

/** 没检索到任何片段时的固定回答，不必浪费一次模型调用。 */
export const NO_EVIDENCE_REPLY = "截至当前阅读位置尚未明确。";
