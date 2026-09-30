const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ssjfjplazcrfdwfozqvg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzamZqcGxhemNyZmR3Zm96cXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NDkyMzksImV4cCI6MjEwNjMyNTIzOX0.Yy7N372XKjko0s-zLMbg5mjjrPtXvsNa65odYa4SBBs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const team = [
  { name: 'AbdulHadi Fakhar', email: 'abdulhadi@ecomworksheet.com', pass: 'Hadi#2026!Work', role: 'ADMIN', id: 'MGR-1001', pos: 'Manager' },
  { name: 'Ali Hassan', email: 'alihassan@ecomworksheet.com', pass: 'Ali#2026!Boss', role: 'BOSS', id: 'BOSS-1001', pos: 'Boss / Executive' },
  { name: 'Rana Hasnain', email: 'ranahasnain@ecomworksheet.com', pass: 'Hasnain#2026!Boss', role: 'BOSS', id: 'BOSS-1002', pos: 'Boss / Executive' },
  { name: 'Rayan Shahid', email: 'rayan@ecomworksheet.com', pass: 'Rayan#2026!Ecom', role: 'EMPLOYEE', id: 'EMP-1001', pos: 'Team Member' },
  { name: 'Arsalan', email: 'arsalan@ecomworksheet.com', pass: 'Arsalan#2026!Ecom', role: 'EMPLOYEE', id: 'EMP-1002', pos: 'Team Member' },
  { name: 'Rana Ahad', email: 'ranaahad@ecomworksheet.com', pass: 'Ahad#2026!Ecom', role: 'EMPLOYEE', id: 'EMP-1003', pos: 'Team Member' },
  { name: 'Sir Maqbool', email: 'maqbool@ecomworksheet.com', pass: 'Maqbool#2026!Ecom', role: 'EMPLOYEE', id: 'EMP-1004', pos: 'Team Member' },
  { name: 'Mubashir', email: 'mubashir@ecomworksheet.com', pass: 'Mubashir#2026!Ecom', role: 'EMPLOYEE', id: 'EMP-1005', pos: 'Team Member' },
  { name: 'Sufyan', email: 'sufyan@ecomworksheet.com', pass: 'Sufyan#2026!Ecom', role: 'EMPLOYEE', id: 'EMP-1006', pos: 'Team Member' },
];

async function registerAll() {
  console.log('Registering team members into Supabase...\n');
  for (const member of team) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: member.email,
        password: member.pass,
        options: {
          data: {
            full_name: member.name,
            role: member.role,
            employee_id: member.id,
            position: member.pos,
          }
        }
      });
      if (error) {
        console.log(`[-] ${member.name} (${member.email}): ${error.message}`);
      } else {
        console.log(`[+] Registered ${member.name} (${member.email}) - User ID: ${data.user?.id}`);
      }
    } catch (err) {
      console.log(`[!] Error with ${member.name}:`, err.message);
    }
  }
}

registerAll();
