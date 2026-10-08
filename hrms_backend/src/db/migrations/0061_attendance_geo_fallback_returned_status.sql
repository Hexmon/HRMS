-- GEO-S12-015: manager return decision for geo fallback reviews.

ALTER TABLE attendance.geo_fallback_reviews
  DROP CONSTRAINT IF EXISTS attendance_geo_fallback_status_check;

ALTER TABLE attendance.geo_fallback_reviews
  ADD CONSTRAINT attendance_geo_fallback_status_check
    CHECK (status IN ('pending', 'approved', 'returned', 'rejected'));
