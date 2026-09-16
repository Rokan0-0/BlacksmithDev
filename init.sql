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

-- Slots Table Base Creation
CREATE TABLE IF NOT EXISTS slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time VARCHAR(255) NOT NULL,
  status slot_status NOT NULL DEFAULT 'AVAILABLE'
);

-- Safe Schema Migration: Upgrade existing slots table with clinician_id column if missing
ALTER TABLE slots ADD COLUMN IF NOT EXISTS clinician_id VARCHAR(255);

-- Add Unique Constraint on (clinician_id, time) safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_slot'
  ) THEN
    ALTER TABLE slots ADD CONSTRAINT unique_slot UNIQUE (clinician_id, time);
  END IF;
END
$$;

-- Idempotency Keys Table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  booking_result JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optimization Index for concurrent slot lookup by clinician and status
CREATE INDEX IF NOT EXISTS idx_slots_clinician_status ON slots(clinician_id, status);

-- Seed initial test slots for dr-smith
INSERT INTO slots (id, clinician_id, time, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'dr-smith', '09:00', 'AVAILABLE'),
  ('22222222-2222-2222-2222-222222222222', 'dr-smith', '10:00', 'AVAILABLE'),
  ('33333333-3333-3333-3333-333333333333', 'dr-smith', '14:00', 'AVAILABLE')
ON CONFLICT (clinician_id, time) DO NOTHING;
