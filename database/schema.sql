-- ============================================================================
-- Smart Campus Complaint & Service Management System
-- Normalized Relational Database Schema (MySQL 8.0+)
-- Database Name: smart_campus_db
-- ============================================================================

CREATE DATABASE IF NOT EXISTS smart_campus_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_campus_db;

-- 1. Core Users Table (Authentication & Role Dispatch)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'staff', 'admin') NOT NULL DEFAULT 'student',
  phone VARCHAR(25) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_active (is_active)
) ENGINE=InnoDB;

-- 2. Students Profile Table
CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  roll_number VARCHAR(40) NOT NULL UNIQUE,
  department VARCHAR(100) NOT NULL,
  academic_year TINYINT NOT NULL DEFAULT 1,
  hostel_block VARCHAR(80) DEFAULT 'Day Scholar',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. Staff Profile Table
CREATE TABLE IF NOT EXISTS staff (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  employee_code VARCHAR(40) NOT NULL UNIQUE,
  department VARCHAR(100) NOT NULL,
  specialization VARCHAR(120) NOT NULL,
  availability_status ENUM('Available', 'Busy', 'Off Duty') NOT NULL DEFAULT 'Available',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Admins Profile Table
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  admin_code VARCHAR(40) NOT NULL UNIQUE,
  designation VARCHAR(120) NOT NULL DEFAULT 'Campus Operations Administrator',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admins_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. Complaint Categories Table
CREATE TABLE IF NOT EXISTS complaint_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) DEFAULT NULL,
  sla_hours INT NOT NULL DEFAULT 24,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 6. Complaints Core Table
CREATE TABLE IF NOT EXISTS complaints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_code VARCHAR(32) NOT NULL UNIQUE,
  student_id INT NOT NULL,
  category_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(150) NOT NULL,
  priority ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL DEFAULT 'Medium',
  status ENUM(
    'Submitted',
    'Under Review',
    'Assigned',
    'In Progress',
    'Resolved',
    'Closed',
    'Reopened'
  ) NOT NULL DEFAULT 'Submitted',
  image_path VARCHAR(255) DEFAULT NULL,
  resolution_image_path VARCHAR(255) DEFAULT NULL,
  resolution_notes TEXT DEFAULT NULL,
  assigned_staff_id INT DEFAULT NULL,
  is_escalated TINYINT(1) NOT NULL DEFAULT 0,
  escalated_at TIMESTAMP NULL DEFAULT NULL,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_complaints_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_complaints_category FOREIGN KEY (category_id) REFERENCES complaint_categories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_complaints_staff FOREIGN KEY (assigned_staff_id) REFERENCES staff(id) ON DELETE SET NULL,
  INDEX idx_complaints_status (status),
  INDEX idx_complaints_priority (priority),
  INDEX idx_complaints_created (created_at),
  INDEX idx_complaints_student (student_id),
  INDEX idx_complaints_staff (assigned_staff_id)
) ENGINE=InnoDB;

-- 7. Complaint Assignments Audit Table
CREATE TABLE IF NOT EXISTS complaint_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL,
  staff_id INT NOT NULL,
  assigned_by_admin_id INT NOT NULL,
  notes VARCHAR(255) DEFAULT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assign_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  CONSTRAINT fk_assign_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  CONSTRAINT fk_assign_admin FOREIGN KEY (assigned_by_admin_id) REFERENCES admins(id) ON DELETE CASCADE,
  INDEX idx_assign_complaint (complaint_id)
) ENGINE=InnoDB;

-- 8. Complaint Timeline Updates Table
CREATE TABLE IF NOT EXISTS complaint_updates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL,
  updated_by_user_id INT NOT NULL,
  status_from VARCHAR(40) DEFAULT NULL,
  status_to VARCHAR(40) NOT NULL,
  comment TEXT NOT NULL,
  attachment_path VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_updates_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  CONSTRAINT fk_updates_user FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_updates_complaint (complaint_id)
) ENGINE=InnoDB;

-- 9. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  complaint_id INT DEFAULT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('info', 'assignment', 'status', 'escalation', 'announcement') NOT NULL DEFAULT 'info',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  INDEX idx_notif_user_read (user_id, is_read)
) ENGINE=InnoDB;

-- 10. Student Feedback & Ratings Table
CREATE TABLE IF NOT EXISTS feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL UNIQUE,
  student_id INT NOT NULL,
  rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_feedback_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 11. Campus Announcements Table
CREATE TABLE IF NOT EXISTS announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  content TEXT NOT NULL,
  audience ENUM('All', 'Students', 'Staff') NOT NULL DEFAULT 'All',
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_announce_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 12. System Activity Audit Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id INT DEFAULT NULL,
  details TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_logs_created (created_at)
) ENGINE=InnoDB;

-- Initial Complaint Categories Seed
INSERT INTO complaint_categories (name, description, sla_hours) VALUES
  ('Electrical Problems', 'Power outages, faulty lighting, ceiling fans, switches, and breaker trips', 24),
  ('Water Supply Issues', 'Drinking water coolers, pipeline leaks, low pressure, and overhead tank issues', 12),
  ('Classroom Maintenance', 'Projectors, smart boards, desks, chairs, whiteboards, and AC units', 48),
  ('Hostel Problems', 'Dormitory fixtures, room locks, mess equipment, and hot water heaters', 24),
  ('Library Services', 'Reading hall seating, AC, lighting, book terminals, and quiet-zone upkeep', 48),
  ('Wi-Fi and Internet Issues', 'Campus Wi-Fi dead zones, access point failures, and LAN port outages', 12),
  ('Laboratory Equipment', 'Workstation hardware, lab instruments, oscilloscopes, and power benches', 36),
  ('Washroom Maintenance', 'Plumbing leaks, flush valves, exhaust fans, and hygiene supplies', 12),
  ('Transportation Issues', 'Campus shuttle delays, route timing, and bus stop shelter upkeep', 24),
  ('Cleaning and Sanitation', 'Corridor sweeping, waste collection, pest control, and courtyard upkeep', 24),
  ('Other Campus Issues', 'General campus infrastructure, signage, parking, or security lighting', 72);
