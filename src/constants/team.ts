import type { Employee } from '../types/database.types';

// The official operational team (Manager + 6 Employees)
// Note: Ali Hassan and Rana Hasnain (Bosses) are completely ANONYMOUS observers
// and are intentionally omitted from all visible team rosters, task assignments, and drop targets.
export const OFFICIAL_TEAM: Omit<Employee, 'created_at' | 'updated_at'>[] = [
  {
    id: 'emp_mgr_abdulhadi',
    employee_id: 'MGR-1001',
    full_name: 'AbdulHadi Fakhar',
    email: 'abdulhadi@ecomworksheet.com',
    position: 'Manager',
    status: 'Active',
    joining_date: '2026-01-01',
    phone: null,
    profile_picture: null,
    role: 'ADMIN'
  },
  {
    id: 'emp_1001_rayan',
    employee_id: 'EMP-1001',
    full_name: 'Rayan Shahid',
    email: 'rayan@ecomworksheet.com',
    position: 'Team Member',
    status: 'Active',
    joining_date: '2026-01-01',
    phone: null,
    profile_picture: null,
    role: 'EMPLOYEE'
  },
  {
    id: 'emp_1002_arsalan',
    employee_id: 'EMP-1002',
    full_name: 'Arsalan',
    email: 'arsalan@ecomworksheet.com',
    position: 'Team Member',
    status: 'Active',
    joining_date: '2026-01-01',
    phone: null,
    profile_picture: null,
    role: 'EMPLOYEE'
  },
  {
    id: 'emp_1003_ahad',
    employee_id: 'EMP-1003',
    full_name: 'Rana Ahad',
    email: 'ranaahad@ecomworksheet.com',
    position: 'Team Member',
    status: 'Active',
    joining_date: '2026-01-01',
    phone: null,
    profile_picture: null,
    role: 'EMPLOYEE'
  },
  {
    id: 'emp_1004_maqbool',
    employee_id: 'EMP-1004',
    full_name: 'Sir Maqbool',
    email: 'maqbool@ecomworksheet.com',
    position: 'Team Member',
    status: 'Active',
    joining_date: '2026-01-01',
    phone: null,
    profile_picture: null,
    role: 'EMPLOYEE'
  },
  {
    id: 'emp_1005_mubashir',
    employee_id: 'EMP-1005',
    full_name: 'Mubashir',
    email: 'mubashir@ecomworksheet.com',
    position: 'Team Member',
    status: 'Active',
    joining_date: '2026-01-01',
    phone: null,
    profile_picture: null,
    role: 'EMPLOYEE'
  },
  {
    id: 'emp_1006_sufyan',
    employee_id: 'EMP-1006',
    full_name: 'Sufyan',
    email: 'sufyan@ecomworksheet.com',
    position: 'Team Member',
    status: 'Active',
    joining_date: '2026-01-01',
    phone: null,
    profile_picture: null,
    role: 'EMPLOYEE'
  }
];

// Helper to filter out anonymous bosses from any employee list
export const filterAnonymousBosses = (employees: Employee[]): Employee[] => {
  return employees.filter(e => {
    // Hide Boss role completely
    if (e.role === 'BOSS') return false;
    // Hide by known boss emails/names if role is missing or misconfigured
    const lowerEmail = (e.email || '').toLowerCase();
    const lowerName = (e.full_name || '').toLowerCase();
    if (lowerEmail.includes('alihassan') || lowerEmail.includes('ranahasnain')) return false;
    if (lowerName.includes('ali hassan') || lowerName.includes('rana hasnain')) return false;
    return true;
  });
};
