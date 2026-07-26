/**
 * 向量维度。
 *
 * 必须和 supabase/migrations 里 chunks.embedding 以及 match_chunks 参数的
 * vector(N) 保持一致。改这里的时候一定要一起改 SQL 并重建表——
 * pgvector 的维度写在 DDL 里，不是运行时可变的。
 *
 * 当前对应通义 text-embedding-v3（默认 1024 维）。
 * 其它常见取值：OpenAI text-embedding-3-small = 1536，智谱 embedding-3 = 2048。
 */
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * 一次 embedding 请求送多少条文本。
 *
 * OpenAI 能接受上百条，但 DashScope 的 compatible-mode 对单次请求的
 * 数组长度有较小的上限，所以这里保守取 10。
 * 如果换成 OpenAI 可以调大，能明显减少请求次数。
 */
export const EMBED_BATCH = 10;
