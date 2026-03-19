const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Admin Client (Service Role) - Bypasses RLS
const adminClient = createClient(supabaseUrl, serviceKey || supabaseKey);

/**
 * Creates an authenticated Supabase client for a specific user request.
 * If serviceKey is available, it returns the admin client for convenience.
 * Otherwise, it creates a client that passes the user's JWT so RLS works.
 */
const getClient = (token) => {
    if (serviceKey) return adminClient;
    if (!token) return adminClient; // Fallback if no token (might fail RLS but better than nothing)
    
    return createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    });
};

// Public Client (Anon Key) - Subject to RLS
const anonClient = createClient(supabaseUrl, supabaseKey);

module.exports = { adminClient, anonClient, getClient };
