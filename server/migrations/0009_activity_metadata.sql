-- Details of an activity entry, such as the entry or month it was about.

-- A JSON object, or null when the action needs no details.
ALTER TABLE activity_logs ADD COLUMN metadata TEXT
  CHECK (metadata IS NULL OR (json_valid(metadata) AND json_type(metadata) = 'object'));
