// =============================================
// supabaseUpload.js — Supabase Storage + DB Operations
// Handles PDF upload and certificate record management
// =============================================
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load .env from project root  
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const STORAGE_BUCKET = 'certificates';

// =============================================
// SUPABASE CLIENT (Service Role bypasses RLS)
// =============================================
let supabase = null;

function getClient() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

        if (!url || !key) {
            throw new Error('SUPABASE_URL or SUPABASE_KEY not configured in .env');
        }

        supabase = createClient(url, key);
        console.log(`[Upload] Supabase initialized (${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE ROLE' : 'ANON KEY'})`);
    }
    return supabase;
}

// =============================================
// LOGGING
// =============================================
function log(step, status, detail = '') {
    const ts = new Date().toISOString().substring(11, 19);
    const icon = status === 'OK' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️';
    console.log(`[${ts}] [Upload] ${icon} ${step}${detail ? ': ' + detail : ''}`);
}

// =============================================
// UPLOAD PDF TO SUPABASE STORAGE
// =============================================
async function uploadPdf(mst, serial, fileBuffer) {
    const client = getClient();
    const mstClean = String(mst).trim();
    const serialClean = String(serial || 'cert').trim();
    const storagePath = `${mstClean}/${serialClean}.pdf`;

    log('UPLOAD', 'INFO', `${STORAGE_BUCKET}/${storagePath} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);

    const { error } = await client.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: true
        });

    if (error) {
        // Provide clear error for missing bucket
        if (error.message.includes('not found') || error.message.includes('Bucket')) {
            throw new Error(`Bucket "${STORAGE_BUCKET}" không tồn tại. Vui lòng tạo trong Supabase Dashboard.`);
        }
        throw new Error(`Storage upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = client.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

    log('UPLOAD', 'OK', publicUrl);
    return publicUrl;
}

// =============================================
// UPDATE CERTIFICATES TABLE
// =============================================
async function updateDatabase(mst, serial, publicUrl) {
    const client = getClient();
    const mstClean = String(mst).trim();

    // Check if record exists
    const { data: existing } = await client
        .from('certificates')
        .select('id')
        .eq('mst', mstClean)
        .limit(1);

    if (existing && existing.length > 0) {
        const { error } = await client
            .from('certificates')
            .update({
                serial: String(serial || '').trim(),
                pdf_url: publicUrl,
                pdf_status: 'ready',
                updated_at: new Date().toISOString()
            })
            .eq('mst', mstClean);

        if (error) throw new Error(`DB update failed: ${error.message}`);
        log('DB UPDATE (certificates)', 'OK', 'pdf_status = ready');
    } else {
        const { error } = await client
            .from('certificates')
            .insert({
                mst: mstClean,
                serial: String(serial || '').trim(),
                pdf_url: publicUrl,
                pdf_status: 'ready',
                updated_at: new Date().toISOString()
            });

        if (error) throw new Error(`DB insert failed: ${error.message}`);
        log('DB INSERT (certificates)', 'OK', 'pdf_status = ready');
    }
}

// =============================================
// UPDATE CUSTOMERS TABLE (Non-critical sync)
// =============================================
async function updateCustomerRecord(mst, publicUrl, companyName, email, phone, diaChi) {
    const client = getClient();
    const mstClean = String(mst).trim();

    try {
        const { data: existing } = await client
            .from('customers')
            .select('id')
            .eq('mst', mstClean)
            .limit(1);

        if (existing && existing.length > 0) {
            await client
                .from('customers')
                .update({
                    pdf_url: publicUrl,
                    company_name: companyName || '',
                    email: email || '',
                    phone: phone || '',
                    status: 'active'
                })
                .eq('mst', mstClean);
        } else {
            await client
                .from('customers')
                .insert({
                    mst: mstClean,
                    company_name: companyName || '',
                    email: email || '',
                    phone: phone || '',
                    pdf_url: publicUrl,
                    status: 'active',
                    notes: diaChi ? `Địa chỉ: ${diaChi}` : '',
                    created_at: new Date().toISOString()
                });
        }
        log('DB UPDATE (customers)', 'OK', 'Synced pdf_url');
    } catch (err) {
        // Non-critical — certificates table is the source of truth
        log('DB UPDATE (customers)', 'FAIL', `${err.message} (non-critical)`);
    }
}

// =============================================
// MARK CERTIFICATE AS NOT FOUND
// =============================================
async function markNotFound(mst, serial) {
    const client = getClient();
    const mstClean = String(mst).trim();

    try {
        const { data: existing } = await client
            .from('certificates')
            .select('id')
            .eq('mst', mstClean)
            .limit(1);

        if (existing && existing.length > 0) {
            await client
                .from('certificates')
                .update({
                    pdf_status: 'not_found',
                    serial: String(serial || '').trim(),
                    updated_at: new Date().toISOString()
                })
                .eq('mst', mstClean);
        } else {
            await client
                .from('certificates')
                .insert({
                    mst: mstClean,
                    serial: String(serial || '').trim(),
                    pdf_status: 'not_found',
                    updated_at: new Date().toISOString()
                });
        }
        log('MARK NOT_FOUND', 'OK', `${mstClean}`);
    } catch (err) {
        log('MARK NOT_FOUND', 'FAIL', err.message);
    }
}

module.exports = { uploadPdf, updateDatabase, updateCustomerRecord, markNotFound };
