export type BookStatus = "uploaded" | "processing" | "ready" | "failed";

export type Book = {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  file_path: string | null;
  status: BookStatus;
  error_message: string | null;
  chapter_count: number;
  created_at: string;
};

export type Chapter = {
  id: string;
  book_id: string;
  user_id: string;
  chapter_index: number;
  title: string;
  content: string;
  created_at: string;
};

/** 目录用，不含正文。 */
export type ChapterSummary = Pick<
  Chapter,
  "id" | "chapter_index" | "title"
>;

export type ReadingProgress = {
  id: string;
  user_id: string;
  book_id: string;
  chapter_index: number;
  updated_at: string;
};
