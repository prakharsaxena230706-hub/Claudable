require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
console.log('URL:', process.env.SUPABASE_URL);
console.log('SERVICE_KEY starts:', process.env.SUPABASE_SERVICE_KEY?.slice(0,40));
sb.auth.getUser('faketoken').then(({data,error}) => {
  console.log('Supabase error msg:', error?.message);
  console.log('Supabase connection working:', !!error);
}).catch(e => console.error('Supabase crashed:', e.message));
