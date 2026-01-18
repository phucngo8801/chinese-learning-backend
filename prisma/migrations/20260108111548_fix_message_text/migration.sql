-- ✅ Rename message column safely (content <-> text)
DO $$
BEGIN
  -- ChatMessage: nếu có content mà chưa có text => rename content -> text
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ChatMessage' AND column_name = 'content'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ChatMessage' AND column_name = 'text'
  ) THEN
    ALTER TABLE "ChatMessage" RENAME COLUMN "content" TO "text";
  END IF;

  -- RoomMessage: nếu có content mà chưa có text => rename content -> text
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'RoomMessage' AND column_name = 'content'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'RoomMessage' AND column_name = 'text'
  ) THEN
    ALTER TABLE "RoomMessage" RENAME COLUMN "content" TO "text";
  END IF;

  -- add readAt nếu chưa có (nullable)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ChatMessage' AND column_name = 'readAt'
  ) THEN
    ALTER TABLE "ChatMessage" ADD COLUMN "readAt" TIMESTAMP(3);
  END IF;

  -- add isRead nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ChatMessage' AND column_name = 'isRead'
  ) THEN
    ALTER TABLE "ChatMessage" ADD COLUMN "isRead" BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
