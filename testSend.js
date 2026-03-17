const emailService = require('./services/emailService');
const supabase = require('./services/supabaseClient');
require('dotenv').config();

async function testSend() {
    console.log("Fetching latest campaign...");
    const { data: campaigns, error: campErr } = await supabase.from('campaigns').select('*').order('createdAt', { ascending: false }).limit(1);
    if (campErr || !campaigns.length) return console.error("No campaigns found", campErr);

    const campaign = campaigns[0];
    console.log("Campaign recipients:", campaign.recipients);

    console.log("Fetching sender...");
    const { data: sender, error: senderErr } = await supabase.from('senders').select('*').eq('id', campaign.senderAccountId).single();
    if (senderErr || !sender) return console.error("No sender found", senderErr);

    console.log("Testing email send...");
    
    try {
        await emailService.sendBulkEmails(campaign, sender, (updatedCampaign) => {
            console.log("Update received:", updatedCampaign.status, "Success:", updatedCampaign.successCount, "Error:", updatedCampaign.errorCount);
        });
    } catch (err) {
        console.error("FATAL ERROR during sendBulkEmails:", err);
    }

    console.log("Done.");
}

testSend();
