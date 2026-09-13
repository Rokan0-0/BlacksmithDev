-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum Type for Slot Status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'slot_status') THEN
    CREATE TYPE slot_status AS ENUM ('AVAILABLE', 'BOOKED');
  END IF;
END
$$;

-- Slots Table
CREATE TABLE IF NOT EXISTS slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time VARCHAR(255) NOT NULL,
  status slot_status NOT NULL DEFAULT 'AVAILABLE'
);

-- Idempotency Keys Table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  booking_result JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optimization Index for concurrent slot lookup
CREATE INDEX IF NOT EXISTS idx_slots_id_status ON slots(id, status);

-- Seed initial test slots
INSERT INTO slots (id, time, status) VALUES
  ('11111111-1111-1111-1111-111111111111', '09:00 AM', 'AVAILABLE'),
  ('22222222-2222-2222-2222-222222222222', '10:00 AM', 'AVAILABLE'),
  ('33333333-3333-3333-3333-333333333333', '02:00 PM', 'AVAILABLE')
ON CONFLICT (id) DO NOTHING;
