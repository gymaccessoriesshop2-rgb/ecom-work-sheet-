export type Role = 'ADMIN' | 'EMPLOYEE' | 'BOSS';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskStatus = 'Pending' | 'In Progress' | 'Awaiting Approval' | 'Approved' | 'Rejected' | 'Completed' | 'Overdue';
export type ReportStatus = 'Draft' | 'Submitted' | 'Reviewed' | 'Needs Revision';

export interface Category {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Employee {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  position: string;
  status: 'Active' | 'Inactive';
  joining_date: string;
  phone: string | null;
  profile_picture: string | null;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  created_by: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  category?: string | null;
  category_id?: string | null;
  platform?: string | null;
  resource_url?: string | null;
  manager_comment: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Employee;
  creator?: Employee;
}

export interface Note {
  id: string;
  author_id: string;
  task_id: string | null;
  report_id: string | null;
  content: string;
  created_at: string;
  author?: Employee;
}

export interface MonthlyReport {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  status: ReportStatus;
  monthly_summary: string | null;
  achievements: string | null;
  challenges: string | null;
  important_notes: string | null;
  pending_work: string | null;
  next_month_plan: string | null;
  additional_notes: string | null;
  admin_feedback: string | null;
  tasks_assigned: number;
  tasks_completed: number;
  tasks_pending: number;
  tasks_overdue: number;
  completion_rate: number;
  activity_records: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  description: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
  user?: Employee;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  created_at: string;
}

export interface SharedFile {
  id: string;
  sender_id: string;
  recipient_ids: string[];
  file_name: string;
  file_size: number;
  file_type: string | null;
  file_url: string;
  notes: string | null;
  created_at: string;
  sender?: Employee;
}
