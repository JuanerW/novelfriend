# CLAUDE.md — 无剧透小说助手 MVP

## 项目目标

做一个简单的全栈 Web 应用：

1. 用户注册和登录。
2. 用户上传自己的小说。
3. 系统按章节切分小说并生成向量索引。
4. 用户设置自己读到的章节。
5. 用户向大模型询问人物、名词和前情。
6. 系统只检索阅读进度以前的原文，避免剧透。
7. 回答显示引用的章节。

第一版只做“带章节截止点的小说 RAG”，不做知识图谱。

## 第一版不做

- 不做微服务。
- 不用 Kubernetes。
- 不用 Kafka、Temporal、Neo4j 和 OpenSearch。
- 不自动理解复杂叙述诡计。
- 不生成完整人物关系图。
- 不处理 PDF 和 OCR。
- 不支持多人协作空间。
- 不做付费和复杂配额。

## 技术栈

整个项目尽量保持简单：

```text
Next.js + React + TypeScript
Supabase
OpenAI-compatible LLM API
Vercel（部署）
```

### Next.js

负责：

- React 用户界面
- 页面路由
- 服务端 API
- 上传和聊天接口
- 流式返回模型回答

### Supabase

负责：

- 用户注册和登录
- PostgreSQL 数据库
- pgvector 向量检索
- 小说文件存储
- Row Level Security 用户数据隔离

### LLM API

使用 OpenAI-compatible API：

- Chat Model：回答问题
- Embedding Model：生成小说片段向量

第一版允许用户在设置页填写：

- API Key
- Base URL
- Chat Model
- Embedding Model

API Key 必须加密存储，只能在服务端解密和使用。

## 项目结构

```text
src/
  app/
    login/
    register/
    library/
    books/[bookId]/
    settings/
    api/
      books/
      chat/
      provider/
  components/
  lib/
    supabase/
    llm/
    parser/
    retrieval/
  types/
supabase/
  migrations/
```

不要为了“以后可能需要”提前建立复杂目录。

## 用户流程

```text
注册
  ↓
填写 LLM API Key
  ↓
上传 TXT 小说
  ↓
系统识别章节
  ↓
切分文本并生成 Embedding
  ↓
用户设置阅读进度
  ↓
提问
  ↓
只检索阅读进度之前的内容
  ↓
LLM 根据检索结果回答并引用章节
```

## MVP 页面

### `/login`

- 邮箱
- 密码
- 登录按钮

### `/register`

- 邮箱
- 密码
- 注册按钮

### `/library`

- 显示用户上传的小说
- 上传 TXT
- 显示处理状态
- 删除小说

### `/books/[bookId]`

- 左侧：章节目录
- 中间：小说正文
- 右侧：问答窗口
- “我读到这里”按钮
- 显示当前阅读截止章节
- 点击回答引用可以跳到原文

### `/settings`

- API Base URL
- API Key
- Chat Model
- Embedding Model
- 测试连接

## 数据表

### `profiles`

```text
id
email
created_at
```

`id` 对应 Supabase Auth User ID。

### `provider_settings`

```text
id
user_id
base_url
encrypted_api_key
chat_model
embedding_model
created_at
updated_at
```

### `books`

```text
id
user_id
title
author
file_path
status
created_at
```

`status`：

```text
uploaded
processing
ready
failed
```

### `chapters`

```text
id
book_id
user_id
chapter_index
title
content
created_at
```

### `chunks`

```text
id
book_id
chapter_id
user_id
chapter_index
chunk_index
content
embedding
created_at
```

### `reading_progress`

```text
id
user_id
book_id
chapter_index
updated_at
```

### `conversations`

```text
id
user_id
book_id
created_at
```

### `messages`

```text
id
conversation_id
role
content
reader_chapter_snapshot
citations_json
created_at
```

每张业务表必须带 `user_id`，并配置 Supabase Row Level Security。

## 小说导入

第一版只支持 UTF-8 TXT。

### 章节识别

识别常见中文标题：

```text
第一章
第十二章
第001章
第1卷
```

如果没有识别出章节：

- 将整个文件作为一个章节，或者
- 提示用户检查文件格式。

第一版不需要自动修复所有特殊目录格式。

### 文本切分

规则：

- Chunk 不跨章节。
- 每个 Chunk 约 500–800 tokens。
- 相邻 Chunk 重叠约 50 tokens。
- 每个 Chunk 保存 `chapter_index`。

### 处理过程

```text
读取 TXT
→ 识别章节
→ 保存 chapters
→ 切分 chunks
→ 批量生成 embeddings
→ 保存 pgvector
→ books.status = ready
```

第一版可以在 API Route 中处理小文件。若请求超时，再增加一个简单后台 Worker；不要一开始引入复杂任务系统。

## 无剧透检索

这是项目最重要的规则。

用户当前读到第 12 章时，向量查询必须包含：

```sql
WHERE user_id = current_user
  AND book_id = selected_book
  AND chapter_index <= 12
```

必须先过滤章节，再做向量相似度排序。

禁止：

- 检索全书后再删除后文章节。
- 把后文发送给 LLM，再提示它不要剧透。
- 使用包含全书剧情的人物摘要。

## RAG 流程

```text
用户问题
  ↓
读取数据库中的阅读进度
  ↓
生成问题 Embedding
  ↓
在截止章节内查找最相似的 8 个 Chunk
  ↓
按章节和位置整理上下文
  ↓
发送给 Chat Model
  ↓
流式返回回答
  ↓
保存回答和引用
```

不要相信客户端提交的截止章节。聊天接口必须从数据库读取当前用户的 `reading_progress`。

## 模型 Prompt

```text
你是一个无剧透小说阅读助手。

你只能依据下面提供的、位于用户阅读进度以内的小说原文回答。
不要使用你对这部作品的已有知识。
不要猜测人物的真实身份、动机或后续剧情。
人物说法只能表述为“某人物声称”或“某人物认为”。
如果原文证据不足，请回答“截至当前阅读位置尚未明确”。
不要说“后面会揭晓”“这是伏笔”或“这个人物以后很重要”。
回答应简洁，并标注引用章节。
```

## API

```text
POST   /api/provider/test
PUT    /api/provider

POST   /api/books/upload
GET    /api/books
GET    /api/books/:id
DELETE /api/books/:id
POST   /api/books/:id/process

PUT    /api/books/:id/progress
POST   /api/chat
```

所有接口都必须检查当前登录用户及书籍归属。

## 安全要求

- 使用 Supabase Auth。
- 所有业务表启用 Row Level Security。
- 用户只能访问 `user_id = auth.uid()` 的数据。
- Storage 文件路径使用 `{user_id}/{book_id}/原文件名`。
- API Key 加密后保存。
- API 响应永远不返回完整 API Key。
- 日志不得记录密码、API Key 和完整小说正文。
- 限制上传文件类型和大小。
- 用户删除小说时，同时删除文件、章节、Chunk、向量和对话。
- 上传页面要求用户确认其有权处理该文件。

## 开发阶段

### 阶段一：项目基础

实现：

- Next.js 项目
- Supabase 连接
- 注册、登录和退出
- 基础页面布局

验收：

- 用户可以注册、登录并进入书架。

### 阶段二：上传和阅读

实现：

- TXT 上传
- 章节识别
- 章节目录
- 小说阅读页面
- 保存阅读进度

验收：

- 用户可以上传并阅读一本 TXT 小说。
- 用户可以标记读到的章节。

### 阶段三：生成 RAG

实现：

- 用户配置 API
- 测试 API Key
- 文本切分
- 生成 Embedding
- pgvector 检索
- 处理状态

验收：

- 小说处理完成后，可以检索到相关前文片段。

### 阶段四：无剧透聊天

实现：

- 对话界面
- 截止章节过滤
- LLM 流式回答
- 章节引用
- 对话历史

验收：

- 第 5 章提问时，检索结果和模型上下文中不存在第 6 章以后的内容。
- 没有证据时模型明确表示尚未确认。

### 阶段五：体验优化

实现：

- 点击引用跳转原文
- 上传和索引进度
- 失败重试
- 更好的章节解析
- EPUB 支持

### 阶段六：以后再做

验证 MVP 有用户价值之后再考虑：

- 人物和地点索引
- 人物首次出现
- 化名和未知身份
- 事件时间线
- 当前人物关系
- 知识图谱

## 测试重点

创建一篇测试小说：

```text
第1章：出现主角。
第2章：出现身份未知的黑衣人。
第3章：有人猜测黑衣人是甲。
第4章：揭晓黑衣人其实是乙。
```

测试：

- 阅读进度在第 2 章时，询问黑衣人是谁，回答必须是尚未明确。
- 阅读进度在第 3 章时，只能说某人猜测是甲。
- 阅读进度到第 4 章以后，才允许说是乙。
- 检索数据库时，第 2 章的查询不能返回第 3、4 章的 Chunk。

## MVP 完成标准

满足以下条件即可发布第一版：

- 用户可以注册和登录。
- 用户可以连接自己的 LLM API。
- 用户可以上传 TXT 小说。
- 系统可以识别章节并生成向量。
- 用户可以设置阅读进度。
- 用户可以询问前文内容。
- 检索严格限制在阅读进度以内。
- 回答显示引用章节。
- 用户之间的数据完全隔离。
- 用户可以删除小说和 API Key。

## Claude 开发规则

1. 优先完成最小可用功能。
2. 不主动引入微服务或复杂基础设施。
3. 不在 MVP 阶段实现知识图谱。
4. 所有数据库变更使用 Supabase Migration。
5. 所有服务端接口验证登录用户。
6. 所有检索必须执行章节截止过滤。
7. 修改功能后运行类型检查和相关测试。
8. 如果简单实现已经够用，不创建额外抽象。

## 第一项开发任务

从下面这一条完整链路开始：

```text
注册
→ 登录
→ 上传 TXT
→ 识别章节
→ 展示目录和正文
→ 保存阅读进度
```

完成并测试后，再接入 Embedding 和 LLM。
