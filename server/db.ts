import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'smart_campus.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'staff', 'admin')) DEFAULT 'student',
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      roll_number TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      academic_year INTEGER NOT NULL DEFAULT 1,
      hostel_block TEXT DEFAULT 'Day Scholar',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      employee_code TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      specialization TEXT NOT NULL,
      availability_status TEXT NOT NULL CHECK (availability_status IN ('Available', 'Busy', 'Off Duty')) DEFAULT 'Available',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      admin_code TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL DEFAULT 'Campus Operations Administrator',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS complaint_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      sla_hours INTEGER NOT NULL DEFAULT 24,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_code TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')) DEFAULT 'Medium',
      status TEXT NOT NULL CHECK (status IN (
        'Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Closed', 'Reopened'
      )) DEFAULT 'Submitted',
      image_path TEXT,
      resolution_image_path TEXT,
      resolution_notes TEXT,
      assigned_staff_id INTEGER,
      is_escalated INTEGER NOT NULL DEFAULT 0,
      escalated_at TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES complaint_categories(id) ON DELETE RESTRICT,
      FOREIGN KEY (assigned_staff_id) REFERENCES staff(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS complaint_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      staff_id INTEGER NOT NULL,
      assigned_by_admin_id INTEGER NOT NULL,
      notes TEXT,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
      FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_by_admin_id) REFERENCES admins(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS complaint_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      updated_by_user_id INTEGER NOT NULL,
      status_from TEXT,
      status_to TEXT NOT NULL,
      comment TEXT NOT NULL,
      attachment_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      complaint_id INTEGER,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('info', 'assignment', 'status', 'escalation', 'announcement')) DEFAULT 'info',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL UNIQUE,
      student_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comments TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      audience TEXT NOT NULL CHECK (audience IN ('All', 'Students', 'Staff')) DEFAULT 'All',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_priority ON complaints(priority);
    CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
  `);

  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount === 0) {
    seedInitialData();
  }
}

function seedInitialData(): void {
  const seedTx = db.transaction(() => {
    const categories = [
      ['Electrical Problems', 'Power outages, faulty lighting, ceiling fans, switches, and breaker trips', 24],
      ['Water Supply Issues', 'Drinking water coolers, pipeline leaks, low pressure, and overhead tank issues', 12],
      ['Classroom Maintenance', 'Projectors, smart boards, desks, chairs, whiteboards, and AC units', 48],
      ['Hostel Problems', 'Dormitory fixtures, room locks, mess equipment, and hot water heaters', 24],
      ['Library Services', 'Reading hall seating, AC, lighting, book terminals, and quiet-zone upkeep', 48],
      ['Wi-Fi and Internet Issues', 'Campus Wi-Fi dead zones, access point failures, and LAN port outages', 12],
      ['Laboratory Equipment', 'Workstation hardware, lab instruments, oscilloscopes, and power benches', 36],
      ['Washroom Maintenance', 'Plumbing leaks, flush valves, exhaust fans, and hygiene supplies', 12],
      ['Transportation Issues', 'Campus shuttle delays, route timing, and bus stop shelter upkeep', 24],
      ['Cleaning and Sanitation', 'Corridor sweeping, waste collection, pest control, and courtyard upkeep', 24],
      ['Other Campus Issues', 'General campus infrastructure, signage, parking, or security lighting', 72],
    ] as const;

    const insertCat = db.prepare(
      'INSERT INTO complaint_categories (name, description, sla_hours) VALUES (?, ?, ?)'
    );
    const catIds: Record<string, number> = {};
    for (const [name, desc, sla] of categories) {
      const res = insertCat.run(name, desc, sla);
      catIds[name] = Number(res.lastInsertRowid);
    }

    const insertUser = db.prepare(
      'INSERT INTO users (full_name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)'
    );

    // Admin
    const adminHash = hashPassword('Admin@123');
    const adminUserId = Number(
      insertUser.run('Dr. Arvind Menon', 'admin@campus.edu', adminHash, 'admin', '+91 98490 11200').lastInsertRowid
    );
    const adminId = Number(
      db.prepare('INSERT INTO admins (user_id, admin_code, designation) VALUES (?, ?, ?)').run(
        adminUserId,
        'ADM-001',
        'Chief Campus Operations Officer'
      ).lastInsertRowid
    );

    // Staff members
    const staffHash = hashPassword('Staff@123');
    const staffSeeds = [
      ['Rajesh Kumar', 'rajesh.elec@campus.edu', '+91 98490 22101', 'STF-101', 'Electrical Maintenance', 'Power Distribution & HVAC'],
      ['Priya Nair', 'priya.it@campus.edu', '+91 98490 22102', 'STF-102', 'Campus IT & Networking', 'Wi-Fi Access Points & Lab Systems'],
      ['Vikram Sharma', 'vikram.civil@campus.edu', '+91 98490 22103', 'STF-103', 'Civil & Plumbing Works', 'Water Supply & Sanitation'],
      ['Ananya Verma', 'ananya.hostel@campus.edu', '+91 98490 22104', 'STF-104', 'Campus Facilities', 'Hostel, Classroom & Transport Ops'],
    ] as const;

    const staffIds: number[] = [];
    const staffUserIds: number[] = [];
    for (const [name, email, phone, code, dept, spec] of staffSeeds) {
      const uid = Number(insertUser.run(name, email, staffHash, 'staff', phone).lastInsertRowid);
      staffUserIds.push(uid);
      const sid = Number(
        db.prepare(
          'INSERT INTO staff (user_id, employee_code, department, specialization, availability_status) VALUES (?, ?, ?, ?, ?)'
        ).run(uid, code, dept, spec, 'Available').lastInsertRowid
      );
      staffIds.push(sid);
    }

    // Students
    const studentHash = hashPassword('Student@123');
    const studentSeeds = [
      ['Aarav Patel', 'aarav.24cs@campus.edu', '+91 98490 33101', 'BT23CSE042', 'Computer Science & Engineering', 3, 'Hostel Block C - Room 314'],
      ['Meera Iyer', 'meera.24ec@campus.edu', '+91 98490 33102', 'BT23ECE018', 'Electronics & Communication', 3, 'Hostel Block A - Room 208'],
      ['Rohan Das', 'rohan.25me@campus.edu', '+91 98490 33103', 'BT24MEC091', 'Mechanical Engineering', 2, 'Day Scholar'],
    ] as const;

    const studentIds: number[] = [];
    const studentUserIds: number[] = [];
    for (const [name, email, phone, roll, dept, year, hostel] of studentSeeds) {
      const uid = Number(insertUser.run(name, email, studentHash, 'student', phone).lastInsertRowid);
      studentUserIds.push(uid);
      const stId = Number(
        db.prepare(
          'INSERT INTO students (user_id, roll_number, department, academic_year, hostel_block) VALUES (?, ?, ?, ?, ?)'
        ).run(uid, roll, dept, year, hostel).lastInsertRowid
      );
      studentIds.push(stId);
    }

    // Complaints across the last 6 months & all 7 statuses
    const now = new Date();
    const hoursAgo = (h: number) => {
      const d = new Date(now.getTime() - h * 3600 * 1000);
      return d.toISOString().slice(0, 19).replace('T', ' ');
    };
    const daysAgo = (days: number) => hoursAgo(days * 24);

    interface SeedComplaint {
      code: string;
      studentIdx: number;
      category: string;
      title: string;
      description: string;
      location: string;
      priority: 'Low' | 'Medium' | 'High' | 'Critical';
      status: 'Submitted' | 'Under Review' | 'Assigned' | 'In Progress' | 'Resolved' | 'Closed' | 'Reopened';
      staffIdx: number | null;
      createdAt: string;
      resolvedAt: string | null;
      resolutionNotes: string | null;
      escalated?: number;
      rating?: number;
      feedbackComment?: string;
    }

    const complaintSeeds: SeedComplaint[] = [
      {
        code: 'CMP-2026-0001',
        studentIdx: 0,
        category: 'Wi-Fi and Internet Issues',
        title: 'Intermittent Wi-Fi dropouts in CS Block 3rd Floor',
        description: 'Eduroam and CampusNet SSIDs disconnect every 15 minutes in Lecture Hall 302 and adjacent study corridor.',
        location: 'Academic Block B · Floor 3',
        priority: 'High',
        status: 'Closed',
        staffIdx: 1,
        createdAt: daysAgo(155),
        resolvedAt: daysAgo(154),
        resolutionNotes: 'Replaced faulty Cisco access point AP-B3-04 and updated controller firmware.',
        rating: 5,
        feedbackComment: 'Signal strength is now stable throughout afternoon labs.',
      },
      {
        code: 'CMP-2026-0002',
        studentIdx: 1,
        category: 'Electrical Problems',
        title: 'Flickering LED panels in VLSI Design Lab',
        description: 'Three overhead LED fixtures above bench rows 2 and 3 flicker continuously, causing eye strain during PCB inspection.',
        location: 'ECE Building · Lab 204',
        priority: 'Medium',
        status: 'Closed',
        staffIdx: 0,
        createdAt: daysAgo(128),
        resolvedAt: daysAgo(127),
        resolutionNotes: 'Replaced two defective LED driver ballasts and tested voltage stability.',
        rating: 4,
        feedbackComment: 'Fixed promptly the next morning.',
      },
      {
        code: 'CMP-2026-0003',
        studentIdx: 2,
        category: 'Water Supply Issues',
        title: 'RO water cooler dispenser leaking near Workshop Bay',
        description: 'Drinking water cooler outside Mechanical Workshop is dripping continuously onto the walkway.',
        location: 'Mechanical Workshop · Ground Floor',
        priority: 'High',
        status: 'Closed',
        staffIdx: 2,
        createdAt: daysAgo(98),
        resolvedAt: daysAgo(97),
        resolutionNotes: 'Replaced worn inlet solenoid valve and sanitized drip tray.',
        rating: 5,
        feedbackComment: 'No more water pooling outside the workshop.',
      },
      {
        code: 'CMP-2026-0004',
        studentIdx: 0,
        category: 'Library Services',
        title: 'Silent reading zone HVAC cooling insufficient',
        description: 'North wing of Central Library reading hall remains warm above 27C during afternoon exam prep hours.',
        location: 'Central Library · Level 2 North Wing',
        priority: 'Medium',
        status: 'Resolved',
        staffIdx: 0,
        createdAt: daysAgo(66),
        resolvedAt: daysAgo(65),
        resolutionNotes: 'Cleaned return air filters and calibrated zone damper actuator.',
        rating: 4,
        feedbackComment: 'Temperature returned to normal within 24 hours.',
      },
      {
        code: 'CMP-2026-0005',
        studentIdx: 1,
        category: 'Laboratory Equipment',
        title: 'Oscilloscope channel B probe calibration drift',
        description: 'Bench 07 digital storage oscilloscope shows 18% amplitude attenuation on Channel B.',
        location: 'Signals & Systems Lab · Room 109',
        priority: 'High',
        status: 'Closed',
        staffIdx: 1,
        createdAt: daysAgo(45),
        resolvedAt: daysAgo(44),
        resolutionNotes: 'Replaced BNC probe assembly and ran self-calibration test.',
        rating: 5,
        feedbackComment: 'Lab session continued smoothly.',
      },
      {
        code: 'CMP-2026-0006',
        studentIdx: 2,
        category: 'Transportation Issues',
        title: 'Morning 8:15 AM Campus Shuttle Route B delayed',
        description: 'Shuttle bus from South Gate Station arrived 22 minutes late three times this week.',
        location: 'South Gate Shuttle Bay',
        priority: 'Medium',
        status: 'Resolved',
        staffIdx: 3,
        createdAt: daysAgo(32),
        resolvedAt: daysAgo(31),
        resolutionNotes: 'Reassigned backup coach to 8:15 AM slot and updated dispatch schedule.',
        rating: 4,
        feedbackComment: 'Schedule has been punctual since Monday.',
      },
      {
        code: 'CMP-2026-0007',
        studentIdx: 0,
        category: 'Hostel Problems',
        title: 'Solar hot water supply unavailable in Block C Wing 2',
        description: 'Hot water outlet pressure dropped to zero in showers on 3rd floor Block C since yesterday evening.',
        location: 'Hostel Block C · Floor 3',
        priority: 'High',
        status: 'In Progress',
        staffIdx: 2,
        createdAt: hoursAgo(18),
        resolvedAt: null,
        resolutionNotes: 'Technician inspecting rooftop manifold valve and booster pump relay.',
      },
      {
        code: 'CMP-2026-0008',
        studentIdx: 1,
        category: 'Washroom Maintenance',
        title: 'Broken flush valve and water seepage in Block A Washroom',
        description: 'Second stall flush handle is jammed causing continuous water flow and wet flooring.',
        location: 'Academic Block A · Floor 2 West',
        priority: 'Critical',
        status: 'Assigned',
        staffIdx: 2,
        createdAt: hoursAgo(20),
        resolvedAt: null,
        resolutionNotes: null,
        escalated: 1,
      },
      {
        code: 'CMP-2026-0009',
        studentIdx: 0,
        category: 'Classroom Maintenance',
        title: 'HDMI projector port loose in Seminar Hall 201',
        description: 'Lectern HDMI cable drops video signal whenever moved slightly during presentations.',
        location: 'Centre for Engineering · Room 201',
        priority: 'Medium',
        status: 'Under Review',
        staffIdx: null,
        createdAt: hoursAgo(10),
        resolvedAt: null,
        resolutionNotes: null,
      },
      {
        code: 'CMP-2026-0010',
        studentIdx: 2,
        category: 'Cleaning and Sanitation',
        title: 'Overflowing waste bins near Cafeteria East Patio',
        description: 'Recycling and general bins outside the cafeteria patio need midday clearing before lunch rush.',
        location: 'Student Union Cafeteria · East Patio',
        priority: 'Low',
        status: 'Submitted',
        staffIdx: null,
        createdAt: hoursAgo(4),
        resolvedAt: null,
        resolutionNotes: null,
      },
      {
        code: 'CMP-2026-0011',
        studentIdx: 1,
        category: 'Wi-Fi and Internet Issues',
        title: 'Packet loss persists in Hostel Block A study lounge',
        description: 'Issue marked resolved earlier still drops Zoom audio every few minutes during evening hours.',
        location: 'Hostel Block A · Ground Study Lounge',
        priority: 'High',
        status: 'Reopened',
        staffIdx: 1,
        createdAt: daysAgo(5),
        resolvedAt: null,
        resolutionNotes: 'Reopened by student for RF channel interference check.',
      },
    ];

    const insertComplaint = db.prepare(`
      INSERT INTO complaints (
        complaint_code, student_id, category_id, title, description, location,
        priority, status, assigned_staff_id, is_escalated, escalated_at,
        resolution_notes, resolved_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAssignment = db.prepare(`
      INSERT INTO complaint_assignments (complaint_id, staff_id, assigned_by_admin_id, notes, assigned_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertUpdate = db.prepare(`
      INSERT INTO complaint_updates (complaint_id, updated_by_user_id, status_from, status_to, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertFeedback = db.prepare(`
      INSERT INTO feedback (complaint_id, student_id, rating, comments, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const c of complaintSeeds) {
      const stId = studentIds[c.studentIdx];
      const stUserId = studentUserIds[c.studentIdx];
      const staffId = c.staffIdx !== null ? staffIds[c.staffIdx] : null;
      const staffUserId = c.staffIdx !== null ? staffUserIds[c.staffIdx] : null;
      const escalatedAt = c.escalated ? hoursAgo(2) : null;

      const cRes = insertComplaint.run(
        c.code,
        stId,
        catIds[c.category],
        c.title,
        c.description,
        c.location,
        c.priority,
        c.status,
        staffId,
        c.escalated ?? 0,
        escalatedAt,
        c.resolutionNotes,
        c.resolvedAt,
        c.createdAt,
        c.resolvedAt ?? c.createdAt
      );
      const complaintId = Number(cRes.lastInsertRowid);

      // Initial submission timeline event
      insertUpdate.run(
        complaintId,
        stUserId,
        null,
        'Submitted',
        `Complaint logged by student at ${c.location}.`,
        c.createdAt
      );

      if (c.status !== 'Submitted') {
        insertUpdate.run(
          complaintId,
          adminUserId,
          'Submitted',
          'Under Review',
          'Reviewed by Campus Operations Desk.',
          c.createdAt
        );
      }

      if (staffId && staffUserId) {
        insertAssignment.run(
          complaintId,
          staffId,
          adminId,
          `Dispatched to ${staffSeeds[c.staffIdx!][4]} team.`,
          c.createdAt
        );
        insertUpdate.run(
          complaintId,
          adminUserId,
          'Under Review',
          'Assigned',
          `Assigned to ${staffSeeds[c.staffIdx!][0]} (${staffSeeds[c.staffIdx!][4]}).`,
          c.createdAt
        );
      }

      if (['In Progress', 'Resolved', 'Closed', 'Reopened'].includes(c.status) && staffUserId) {
        insertUpdate.run(
          complaintId,
          staffUserId,
          'Assigned',
          'In Progress',
          'Technician arrived on site and initiated diagnostic inspection.',
          c.createdAt
        );
      }

      if (['Resolved', 'Closed', 'Reopened'].includes(c.status) && staffUserId) {
        insertUpdate.run(
          complaintId,
          staffUserId,
          'In Progress',
          'Resolved',
          c.resolutionNotes || 'Issue resolved and verified on site.',
          c.resolvedAt ?? c.createdAt
        );
      }

      if (c.status === 'Closed') {
        insertUpdate.run(
          complaintId,
          stUserId,
          'Resolved',
          'Closed',
          'Student confirmed resolution and closed ticket.',
          c.resolvedAt ?? c.createdAt
        );
      }

      if (c.status === 'Reopened') {
        insertUpdate.run(
          complaintId,
          stUserId,
          'Resolved',
          'Reopened',
          'Student reopened ticket: packet loss still occurs during peak evening load.',
          hoursAgo(14)
        );
      }

      if (c.rating) {
        insertFeedback.run(
          complaintId,
          stId,
          c.rating,
          c.feedbackComment ?? null,
          c.resolvedAt ?? c.createdAt
        );
      }
    }

    // Announcements
    const insertAnnouncement = db.prepare(`
      INSERT INTO announcements (admin_id, title, content, audience, is_pinned, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertAnnouncement.run(
      adminId,
      'Scheduled Substation Maintenance — Academic Block B',
      'Planned electrical transformer inspection on Sunday 07:00 AM to 09:00 AM. Backup generators will remain active for computer labs.',
      'All',
      1,
      daysAgo(2)
    );
    insertAnnouncement.run(
      adminId,
      'Campus Wi-Fi 6E Upgrade Completed in Central Library',
      'Twelve new high-density Wi-Fi 6E access points are now operational across Levels 1 and 2 of the Central Library.',
      'Students',
      0,
      daysAgo(5)
    );
    insertAnnouncement.run(
      adminId,
      'SLA Escalation Policy Reminder for Maintenance Teams',
      'Critical water and electrical tickets carry a 12-hour SLA window. Upload resolution proof photos before marking tickets Resolved.',
      'Staff',
      0,
      daysAgo(7)
    );

    // Notifications
    const insertNotif = db.prepare(`
      INSERT INTO notifications (user_id, complaint_id, title, message, type, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertNotif.run(
      studentUserIds[0],
      7,
      'Staff In Progress: CMP-2026-0007',
      'Vikram Sharma is inspecting the Block C rooftop manifold valve for your hot water complaint.',
      'status',
      0,
      hoursAgo(6)
    );
    insertNotif.run(
      adminUserId,
      8,
      'SLA Escalation Alert: CMP-2026-0008',
      'Critical washroom maintenance ticket in Academic Block A exceeded its 12h SLA threshold.',
      'escalation',
      0,
      hoursAgo(2)
    );
    insertNotif.run(
      staffUserIds[2],
      8,
      'New Critical Assignment: CMP-2026-0008',
      'You have been assigned a Critical plumbing ticket in Academic Block A · Floor 2 West.',
      'assignment',
      0,
      hoursAgo(19)
    );
    insertNotif.run(
      staffUserIds[1],
      11,
      'Ticket Reopened: CMP-2026-0011',
      'Meera Iyer reopened CMP-2026-0011 due to evening packet loss in Hostel Block A.',
      'status',
      0,
      hoursAgo(14)
    );

    // Activity logs
    const insertLog = db.prepare(`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertLog.run(adminUserId, 'SYSTEM_INITIALIZED', 'system', null, 'Smart Campus database seeded with 11 categories and operational records.', daysAgo(7));
    insertLog.run(adminUserId, 'ESCALATION_TRIGGERED', 'complaint', 8, 'CMP-2026-0008 flagged as overdue under 12h Critical SLA.', hoursAgo(2));
  });

  seedTx();
}
