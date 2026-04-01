/**
 * Setup Script: Create Supabase bucket + verify/update table schema
 * Run: node setup_supabase.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    console.log('='.repeat(60));
    console.log('🔧 SUPABASE SETUP SCRIPT');
    console.log('='.repeat(60));
    console.log(`URL: ${SUPABASE_URL}`);
    console.log(`Key type: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE ROLE' : 'ANON (limited)'}`);
    console.log('');

    // ============================
    // STEP 1: Create Storage Bucket
    // ============================
    console.log('--- STEP 1: Storage Bucket "certificates" ---');
    try {
        // Check if bucket exists
        const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
        if (listErr) {
            console.log(`⚠️  Cannot list buckets: ${listErr.message}`);
            console.log('   Trying to create anyway...');
        } else {
            const existing = buckets.find(b => b.name === 'certificates');
            if (existing) {
                console.log('✅ Bucket "certificates" already exists');
            }
        }

        // Try to create bucket
        const bucketExists = buckets && buckets.find(b => b.name === 'certificates');
        if (!bucketExists) {
            const { data, error } = await supabase.storage.createBucket('certificates', {
                public: true,
                fileSizeLimit: 10485760, // 10MB
                allowedMimeTypes: ['application/pdf']
            });

            if (error) {
                if (error.message.includes('already exists')) {
                    console.log('✅ Bucket "certificates" already exists (confirmed)');
                } else {
                    console.log(`❌ Failed to create bucket: ${error.message}`);
                    console.log('   → You need to create it manually in Supabase Dashboard');
                    console.log('   → Go to: Storage → New Bucket → Name: "certificates" → Public: ON');
                }
            } else {
                console.log('✅ Bucket "certificates" created successfully!');
            }
        }
    } catch (e) {
        console.log(`❌ Bucket error: ${e.message}`);
    }

    // ============================
    // STEP 2: Verify certificates table
    // ============================
    console.log('\n--- STEP 2: Table "certificates" schema ---');
    try {
        // Try to query the table
        const { data, error } = await supabase
            .from('certificates')
            .select('mst, serial, pdf_url, pdf_status, updated_at')
            .limit(1);

        if (error) {
            if (error.message.includes('pdf_status')) {
                console.log('⚠️  Column "pdf_status" does not exist - needs to be added');
            } else if (error.message.includes('updated_at')) {
                console.log('⚠️  Column "updated_at" does not exist - needs to be added');
            } else if (error.message.includes('does not exist') || error.code === '42P01') {
                console.log('❌ Table "certificates" does not exist!');
                console.log('   Run this SQL in Supabase SQL Editor:');
                console.log('');
                printCreateTableSQL();
            } else {
                console.log(`⚠️  Query error: ${error.message} (code: ${error.code})`);
                // Try individual column checks
                await checkColumns();
            }
        } else {
            console.log('✅ Table "certificates" exists with all required columns');
            if (data && data.length > 0) {
                console.log(`   Sample row: mst=${data[0].mst}, pdf_status=${data[0].pdf_status || 'NULL'}`);
            } else {
                console.log('   (Table is empty)');
            }
        }
    } catch (e) {
        console.log(`❌ Table check error: ${e.message}`);
    }

    // ============================
    // STEP 3: Check customers table has pdf_url
    // ============================
    console.log('\n--- STEP 3: Table "customers" pdf_url column ---');
    try {
        const { data, error } = await supabase
            .from('customers')
            .select('mst, pdf_url')
            .limit(1);

        if (error) {
            console.log(`⚠️  Query error: ${error.message}`);
        } else {
            console.log('✅ Table "customers" accessible with pdf_url column');
        }
    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
    }

    // ============================
    // STEP 4: Test upload to bucket
    // ============================
    console.log('\n--- STEP 4: Test upload to "certificates" bucket ---');
    try {
        const testContent = Buffer.from('PDF_TEST_CONTENT');
        const { error: uploadErr } = await supabase.storage
            .from('certificates')
            .upload('_test_upload.txt', testContent, { upsert: true });

        if (uploadErr) {
            console.log(`❌ Upload test failed: ${uploadErr.message}`);
            if (uploadErr.message.includes('row-level security') || uploadErr.message.includes('Bucket not found')) {
                console.log('   → Bucket may not exist or RLS is blocking uploads');
                console.log('   → Create bucket "certificates" with Public=ON in Supabase Dashboard');
            }
        } else {
            console.log('✅ Upload test passed!');
            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('certificates')
                .getPublicUrl('_test_upload.txt');
            console.log(`   Public URL: ${publicUrl}`);

            // Cleanup test file
            await supabase.storage.from('certificates').remove(['_test_upload.txt']);
            console.log('   (Test file cleaned up)');
        }
    } catch (e) {
        console.log(`❌ Upload test error: ${e.message}`);
    }

    // ============================
    // STEP 5: Test DB insert/update
    // ============================
    console.log('\n--- STEP 5: Test DB insert into "certificates" ---');
    try {
        const testMST = '_TEST_SETUP_' + Date.now();
        const { error: insertErr } = await supabase
            .from('certificates')
            .insert({
                mst: testMST,
                serial: 'TEST',
                pdf_url: 'https://test.example.com/test.pdf',
                pdf_status: 'ready',
                updated_at: new Date().toISOString()
            });

        if (insertErr) {
            console.log(`❌ Insert test failed: ${insertErr.message}`);
            
            if (insertErr.message.includes('pdf_status') || insertErr.message.includes('updated_at')) {
                console.log('\n   ⚠️  Missing columns! Run this SQL in Supabase SQL Editor:\n');
                printAlterTableSQL();
            }
            if (insertErr.message.includes('row-level security')) {
                console.log('   → RLS is blocking inserts. Disable RLS or add policy.');
                console.log('\n   Run this SQL to disable RLS:\n');
                printDisableRLS();
            }
        } else {
            console.log('✅ Insert test passed!');
            // Cleanup
            await supabase.from('certificates').delete().eq('mst', testMST);
            console.log('   (Test row cleaned up)');
        }
    } catch (e) {
        console.log(`❌ Insert test error: ${e.message}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 SETUP CHECK COMPLETE');
    console.log('='.repeat(60));
}

async function checkColumns() {
    // Check if specific columns exist by querying them individually
    const cols = ['mst', 'serial', 'pdf_url', 'pdf_status', 'updated_at'];
    const missing = [];

    for (const col of cols) {
        try {
            const { error } = await supabase.from('certificates').select(col).limit(1);
            if (error && (error.message.includes(col) || error.message.includes('column'))) {
                missing.push(col);
                console.log(`   ❌ Column "${col}" - MISSING`);
            } else {
                console.log(`   ✅ Column "${col}" - OK`);
            }
        } catch (e) {
            missing.push(col);
        }
    }

    if (missing.length > 0) {
        console.log(`\n   Missing columns: ${missing.join(', ')}`);
        console.log('   Run this SQL:\n');
        printAlterTableSQL(missing);
    }
}

function printCreateTableSQL() {
    console.log(`
  CREATE TABLE IF NOT EXISTS certificates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mst TEXT NOT NULL,
    serial TEXT,
    company_name TEXT,
    pdf_url TEXT,
    pdf_status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );

  -- Create unique index on MST
  CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_mst ON certificates(mst);

  -- Disable RLS (for desktop tool compatibility)
  ALTER TABLE certificates DISABLE ROW LEVEL SECURITY;
    `);
}

function printAlterTableSQL(missing = ['pdf_status', 'updated_at']) {
    if (missing.includes('pdf_status')) {
        console.log(`  ALTER TABLE certificates ADD COLUMN IF NOT EXISTS pdf_status TEXT DEFAULT 'pending';`);
    }
    if (missing.includes('updated_at')) {
        console.log(`  ALTER TABLE certificates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();`);
    }
    console.log('');
}

function printDisableRLS() {
    console.log(`  ALTER TABLE certificates DISABLE ROW LEVEL SECURITY;`);
    console.log(`  ALTER TABLE customers DISABLE ROW LEVEL SECURITY;`);
    console.log('');
}

main().catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
});
