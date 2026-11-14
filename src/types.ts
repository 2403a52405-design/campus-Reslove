export type UserRole = 'student' | 'staff' | 'admin';

export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export type ComplaintStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Assigned'
  | 'In Progress'
  | 'Resolved'
  | 'Closed'
  | 'Reopened';

export interface UserProfile {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  is_active: number;
  student_id?: number;
  roll_number?: string;
  department?: string;
  academic_year?: number;
  hostel_block?: string;
  staff_id?: number;
  employee_code?: string;
  specialization?: string;
  availability_status?: 'Available' | 'Busy' | 'Off Duty';
  admin_id?: number;
  admin_code?: string;
  designation?: string;
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  sla_hours: number;
  is_active: number;
}

export interface Complaint {
  id: number;
  complaint_code: string;
  student_id: number;
  category_id: number;
  category_name: string;
  category_sla_hours: number;
  title: string;
  description: string;
  location: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  image_path: string | null;
  resolution_image_path: string | null;
  resolution_notes: string | null;
  assigned_staff_id: number | null;
  is_escalated: number;
  escalated_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  student_name: string;
  student_roll: string;
  student_department: string;
  student_email?: string;
  student_phone?: string | null;
  student_year?: number;
  student_hostel?: string;
  staff_name: string | null;
  staff_code: string | null;
  staff_department: string | null;
  staff_specialization?: string | null;
  staff_email?: string | null;
  staff_phone?: string | null;
  feedback_rating?: number | null;
  feedback_comments?: string | null;
}

export interface ComplaintUpdate {
  id: number;
  complaint_id: number;
  updated_by_user_id: number;
  updated_by_name: string;
  updated_by_role: UserRole;
  status_from: string | null;
  status_to: string;
  comment: string;
  attachment_path: string | null;
  created_at: string;
}

export interface ComplaintAssignment {
  id: number;
  complaint_id: number;
  staff_id: number;
  staff_name: string;
  staff_department: string;
  admin_name: string;
  notes: string | null;
  assigned_at: string;
}

export interface FeedbackRecord {
  id: number;
  complaint_id: number;
  student_id: number;
  rating: number;
  comments: string | null;
  created_at: string;
  complaint_code?: string;
  complaint_title?: string;
  category_name?: string;
  student_name?: string;
  roll_number?: string;
  staff_name?: string;
}

export interface Announcement {
  id: number;
  admin_id: number;
  title: string;
  content: string;
  audience: 'All' | 'Students' | 'Staff';
  is_pinned: number;
  created_at: string;
  author_name: string;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  complaint_id: number | null;
  complaint_code: string | null;
  title: string;
  message: string;
  type: 'info' | 'assignment' | 'status' | 'escalation' | 'announcement';
  is_read: number;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  user_id: number | null;
  user_name: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: string | null;
  created_at: string;
}

export interface PublicStats {
  total_complaints: number;
  resolved_complaints: number;
  active_complaints: number;
  avg_resolution_hours: number | null;
  total_students: number;
  total_staff: number;
  avg_rating: number;
  rating_count: number;
  byCategory: Array<{ name: string; count: number }>;
  announcements: Announcement[];
}
