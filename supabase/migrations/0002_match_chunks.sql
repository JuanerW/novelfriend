-- 无剧透向量检索。
--
-- 关键点：chapter_index <= p_max_chapter 写在 WHERE 里，
-- 也就是「先按章节截断，再做相似度排序」。
-- 绝不能改成先取 top-N 再过滤章节——那样召回质量会随进度变化，
-- 而且一旦顺序写反就会把后文喂给模型。
--
-- security invoker：函数以调用者身份执行，chunks 上的 RLS 依然生效，
-- 所以 user_id 隔离有两道保障（RLS + 下面显式的 auth.uid() 条件）。

create or replace function public.match_chunks(
  p_book_id uuid,
  p_max_chapter integer,
  p_query_embedding vector(1536),
  p_match_count integer default 8
)
returns table (
  id uuid,
  chapter_index integer,
  chunk_index integer,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.chapter_index,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.chunks c
  where c.user_id = auth.uid()
    and c.book_id = p_book_id
    and c.chapter_index <= p_max_chapter
    and c.embedding is not null
  order by c.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 50));
$$;

revoke all on function public.match_chunks(uuid, integer, vector, integer) from public;
grant execute on function public.match_chunks(uuid, integer, vector, integer) to authenticated;
