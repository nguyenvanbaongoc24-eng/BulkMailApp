const { adminClient: supabase } = require('../services/supabaseClient');

async function checkUser() {
    try {
        console.log('--- Checking User in Supabase Auth ---');
        const { data: { users }, error } = await supabase.auth.admin.listUsers();
        if (error) throw error;
        
        const target = 'ngocnguyennacencomm@gmail.com';
        const user = users.find(u => u.email === target);
        
        if (user) {
            console.log('User Found:', {
                id: user.id,
                email: user.email,
                confirmed_at: user.email_confirmed_at,
                last_sign_in_at: user.last_sign_in_at
            });
        } else {
            console.log('User NOT found in database.');
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
}

checkUser();
