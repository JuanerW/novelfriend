# novelfriend · 无剧透小说助手

上传自己的小说，标记读到第几章，然后向大模型提问——
检索严格限制在阅读进度以内，不会剧透。

技术栈：Next.js 16 + TypeScript + Tailwind + Supabase（Auth / Postgres / pgvector / Storage）。

## 当前进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 一 | 项目基础、注册登录、页面布局 | ✅ |
| 二 | TXT 上传、章节识别、目录与正文、阅读进度 | ✅ |
| 三 | LLM 配置、切分、Embedding、pgvector 检索 | 🟡 代码完成，待接真实 API 联调 |
| 四 | 无剧透聊天、章节引用、对话历史 | ⬜ |
| 五 | 引用跳转、进度显示、失败重试、EPUB | ⬜ |

## 本地启动

### 1. 建 Supabase 项目

到 [supabase.com](https://supabase.com) 新建一个项目（免费档够用），记下
Settings → API 里的 **Project URL** 和 **anon public key**。

### 2. 执行数据库迁移

把 `supabase/migrations/0001_init.sql` 的内容贴进 Supabase 控制台的
SQL Editor 执行一次。它会建立：

- 全部业务表（`profiles` / `books` / `chapters` / `chunks` / `reading_progress` / `conversations` / `messages` / `provider_settings`）
- 每张表的 Row Level Security 策略（只能访问 `user_id = auth.uid()` 的数据）
- 名为 `novels` 的私有 Storage bucket，路径约定 `{user_id}/{book_id}/原文件名`
- `vector` 扩展和向量索引（阶段三用）
- 注册后自动建 `profiles` 记录的触发器

如果装了 Supabase CLI，也可以 `supabase db push`。

### 3. 配置环境变量

```bash
cp .env.local.example .env.local
```

填入第 1 步拿到的 URL 和 anon key。

### 4. 关掉邮箱验证（可选，方便本地调试）

Supabase 控制台 → Authentication → Providers → Email，
关掉 “Confirm email”，注册后就能直接登录。

### 5. 跑起来

```bash
npm install
npm run dev
```

打开 http://localhost:3000 ，会跳到 `/login`。

## 章节识别

支持两种常见格式：

```text
第一章 / 第十二章 / 第001章 / 第1卷
1.科学边界 / 12．红岸之二
```

外加 `楔子` `序章` `前言` `尾声` `后记` `番外` 等无编号章节。

正文里经常出现 `1、物理学` 这种提纲列表，光靠正则会误判成章节标题，
所以候选标题还必须构成**递增且不跳号过大**的编号序列才算数；
日期形式（`1989.03.21`）也会被排除。

另外会自动去掉下载站水印——全文重复 5 次以上的短行。

识别不出任何章节时，整本作为一章，并在上传结果里提示检查文件格式。

编码方面，虽然规范写的是只支持 UTF-8，实际会先按 UTF-8 严格解码，
失败则回退 GB18030（兼容 GBK/GB2312）。

## 使用流程

1. `/settings` 填 Base URL、API Key、Chat Model、Embedding Model，点「测试连接」。
2. `/library` 上传 TXT，系统识别章节后即可阅读（状态 `可阅读 · 未建索引`）。
3. 点「生成索引」跑 embedding，完成后状态变 `可提问`。
4. 在阅读页点「我读到这里」标记进度，之后提问只会检索这一章及之前的内容。

API Key 用 AES-256-GCM 加密后存库，只在服务端解密，
接口和页面永远不会把完整 Key 返回给浏览器。

### Embedding 维度

`chunks.embedding` 声明为 `vector(1536)`，匹配 OpenAI `text-embedding-3-small`。
换用其它维度的模型时，「测试连接」会提示维度不符，
需要改 `0001_init.sql` 里的维度并重建索引。

## 无剧透规则

这是项目最重要的约束，写在这里免得以后改坏：

- 向量检索必须先按 `user_id` + `book_id` + `chapter_index <= 进度` 过滤，再排序相似度。
- 不允许检索全书后再删除后文。
- 不允许把后文发给模型再叮嘱它别剧透。
- 聊天接口的阅读进度**只能从数据库读**，不能信客户端传的值。

## 目录结构

```text
src/
  app/
    login/ register/ library/ books/[bookId]/
    auth/actions.ts          注册登录退出的 Server Action
    api/books/               上传、列表、详情、删除、进度
  components/
  lib/
    supabase/                server / client / proxy 三份客户端
    parser/                  章节识别与编码回退
  types/
supabase/migrations/
```
