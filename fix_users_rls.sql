-- ============================================
-- FIX INFINITE RECURSION IN USERS TABLE POLICY
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Drop existing problematic policies on public.users
DROP POLICY IF EXISTS "Users can see themselves" ON public.users;
DROP POLICY IF EXISTS "Admin can see all" ON public.users;
DROP POLICY IF EXISTS "Allow individual read" ON public.users;
DROP POLICY IF EXISTS "Allow admin read all" ON public.users;

-- 2. Create a safe policy for users to see their own profile
-- This is NOT recursive because it compares ID directly with auth.uid()
CREATE POLICY "Users can view own profile" 
ON public.users 
FOR SELECT 
USING (auth.uid() = id);

-- 3. Create a safe policy for admins (if needed)
-- Using auth.jwt() avoids querying the users table itself during the policy check
CREATE POLICY "Admins can view all profiles" 
ON public.users 
FOR SELECT 
USING (
  (auth.jwt() ->> 'role') = 'admin' 
  OR 
  -- Fallback: check metadata if role is stored there
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- 4. Enable RLS (if it was disabled for some reason, though recursion only happens if it's ENABLED)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 5. Optional: Grant all to service_role (Admin bypass)
ALTER TABLE public.users FORCE ROW LEVEL SECURITY; -- Ensures policies apply even to owner, EXCEPT service_role bypasses by default
