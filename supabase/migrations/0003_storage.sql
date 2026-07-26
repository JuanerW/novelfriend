-- 小说原文件的存储桶和访问策略。
--
-- 单独一个文件，因为 Supabase 的 SQL Editor 默认把整个脚本当一个事务，
-- 而 storage.objects 上建策略在部分项目会报
--   ERROR: must be owner of table objects
-- 放在 0001 里的话，这一句失败会把所有建表一起回滚。
--
-- 如果下面第二段真的报 must be owner，就走控制台：
--   Storage → New bucket → 名字 novels、不勾 Public
--   然后在该 bucket 的 Policies 里加一条 allow all，
--   条件填 (storage.foldername(name))[1] = auth.uid()::text

-- 1) 建私有 bucket。这一句一般不会有权限问题。
insert into storage.buckets (id, name, public)
values ('novels', 'novels', false)
on conflict (id) do nothing;

-- 2) 只能读写自己那层目录。路径约定 {user_id}/{book_id}/原文件名
drop policy if exists novels_self on storage.objects;
create policy novels_self on storage.objects
  for all
  using (bucket_id = 'novels' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'novels' and auth.uid()::text = (storage.foldername(name))[1]);
