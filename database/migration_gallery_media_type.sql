-- ============================================
-- CareerMyntra Exam Portal - Gallery: video/link support
-- Adds media_type so a gallery item can be an image OR a video link
-- (image_url column is reused to store the video URL/link for video items).
-- ============================================
ALTER TABLE gallery ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) NOT NULL DEFAULT 'image';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gallery_media_type_check'
  ) THEN
    ALTER TABLE gallery ADD CONSTRAINT gallery_media_type_check CHECK (media_type IN ('image', 'video'));
  END IF;
END $$;