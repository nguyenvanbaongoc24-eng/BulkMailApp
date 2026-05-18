-- ============================================
-- CA2 CRM - Update Database Constraints
-- Run this script in your Supabase SQL Editor
-- ============================================

-- Drop the restrictive unique constraint that prevents multiple services per MST
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_mst_user_key;

-- Add a new constraint allowing multiple services per customer
ALTER TABLE customers ADD CONSTRAINT customers_mst_user_service_key UNIQUE (mst, user_id, service_type);
