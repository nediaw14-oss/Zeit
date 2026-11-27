/* Supabase-Verbindung für Plattenzuschnitt (öffentlicher Schlüssel – Zugriff ist per Row Level Security geschützt) */
window.SUPA_URL='https://otumisjdoxjzfyyuuklj.supabase.co';
window.SUPA_KEY='sb_publishable_kHSjy42yEPk8NmpKYzjVHQ_iZQEanRk';
window.sb=window.supabase?window.supabase.createClient(window.SUPA_URL,window.SUPA_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
window.pageUrl=p=>new URL(p,location.href).href;
