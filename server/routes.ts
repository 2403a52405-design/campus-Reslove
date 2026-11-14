import crypto from 'crypto';
import express, { Router } from 'express';
import fs from 'fs';
import JSZip from 'jszip';
import multer from 'multer';
import path from 'path';
import {
  attachSession,
  clearSessionCookie,
  loadUserProfile,
  requireAuth,
  requireRole,
  setSessionCookie,
  verifyCsrf,
  type AuthedRequest,
} from './auth.ts';
import { db, hashPassword, verifyPassword } from './db.ts';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.jpg';
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Only JPG, PNG, and WEBP image files under 5 MB are permitted.'));
      return;
    }
    cb(null, true);
  },
});

function logActivity(
  userId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  details: string
): void {
  db.prepare(
    'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, action, entityType, entityId, details);
}

function createNotification(
  userId: number,
  complaintId: number | null,
  title: string,
  message: string,
  type: 'info' | 'assignment' | 'status' | 'escalation' | 'announcement'
): void {
  db.prepare(
    'INSERT INTO notifications (user_id, complaint_id, title, message, type) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, complaintId, title, message, type);
}

function generateComplaintCode(): string {
  const year = new Date().getFullYear();
  const row = db
    .prepare('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM complaints')
    .get() as { next_id: number };
  const padded = String(row.next_id).padStart(4, '0');
  return `CMP-${year}-${padded}`;
}

export function runEscalationEngine(triggeredByUserId: number | null): { escalatedCount: number; escalatedCodes: string[] } {
  const overdueRows = db
    .prepare(
      `SELECT c.id, c.complaint_code, c.title, c.priority, cat.sla_hours,
              ROUND((julianday('now') - julianday(c.created_at)) * 24, 1) as elapsed_hours
       FROM complaints c
       JOIN complaint_categories cat ON c.category_id = cat.id
       WHERE c.status NOT IN ('Resolved', 'Closed')
         AND c.is_escalated = 0
         AND ((julianday('now') - julianday(c.created_at)) * 24) >
             CASE WHEN c.priority = 'Critical' THEN MIN(cat.sla_hours, 12)
                  WHEN c.priority = 'High' THEN MIN(cat.sla_hours, 24)
                  ELSE cat.sla_hours END`
    )
    .all() as Array<{
    id: number;
    complaint_code: string;
    title: string;
    priority: string;
    sla_hours: number;
    elapsed_hours: number;
  }>;

  if (overdueRows.length === 0) {
    return { escalatedCount: 0, escalatedCodes: [] };
  }

  const adminUsers = db
    .prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1")
    .all() as Array<{ id: number }>;

  const updateStmt = db.prepare(
    "UPDATE complaints SET is_escalated = 1, escalated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  );

  const tx = db.transaction(() => {
    for (const row of overdueRows) {
      updateStmt.run(row.id);
      for (const admin of adminUsers) {
        createNotification(
          admin.id,
          row.id,
          `SLA Escalation Alert: ${row.complaint_code}`,
          `Ticket "${row.title}" (${row.priority}) has been open for ${row.elapsed_hours}h and exceeded SLA (${row.sla_hours}h).`,
          'escalation'
        );
      }
      logActivity(
        triggeredByUserId,
        'ESCALATION_TRIGGERED',
        'complaint',
        row.id,
        `${row.complaint_code} escalated after ${row.elapsed_hours}h.`
      );
    }
  });
  tx();

  return {
    escalatedCount: overdueRows.length,
    escalatedCodes: overdueRows.map((r) => r.complaint_code),
  };
}

export function createApiRouter(): Router {
  const router = express.Router();
  router.use(attachSession);
  router.use(verifyCsrf);

  // =========================================================================
  // PUBLIC ENDPOINTS (Landing Page, Announcements, Contact)
  // =========================================================================
  router.get('/public/stats', (_req, res) => {
    const totals = db
      .prepare(
        `SELECT
           COUNT(*) as total_complaints,
           SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved_complaints,
           SUM(CASE WHEN status NOT IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as active_complaints,
           ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at) - julianday(created_at)) * 24 END), 1) as avg_resolution_hours
         FROM complaints`
      )
      .get() as Record<string, number | null>;

    const userTotals = db
      .prepare(
        `SELECT
           SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) as total_students,
           SUM(CASE WHEN role = 'staff' THEN 1 ELSE 0 END) as total_staff
         FROM users WHERE is_active = 1`
      )
      .get() as Record<string, number>;

    const avgRating = db
      .prepare('SELECT ROUND(AVG(rating), 2) as avg_rating, COUNT(*) as rating_count FROM feedback')
      .get() as { avg_rating: number | null; rating_count: number };

    const byCategory = db
      .prepare(
        `SELECT cat.name, COUNT(c.id) as count
         FROM complaint_categories cat
         LEFT JOIN complaints c ON c.category_id = cat.id
         WHERE cat.is_active = 1
         GROUP BY cat.id
         ORDER BY count DESC, cat.name ASC`
      )
      .all();

    const announcements = db
      .prepare(
        `SELECT a.id, a.title, a.content, a.audience, a.is_pinned, a.created_at, u.full_name as author_name
         FROM announcements a
         JOIN admins ad ON a.admin_id = ad.id
         JOIN users u ON ad.user_id = u.id
         WHERE a.audience IN ('All', 'Students')
         ORDER BY a.is_pinned DESC, a.created_at DESC
         LIMIT 4`
      )
      .all();

    res.json({
      ...totals,
      ...userTotals,
      avg_rating: avgRating.avg_rating ?? 4.6,
      rating_count: avgRating.rating_count,
      byCategory,
      announcements,
    });
  });

  router.post('/public/contact', (req, res) => {
    const { name, email, subject, message } = req.body ?? {};
    if (
      typeof name !== 'string' ||
      name.trim().length < 2 ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof subject !== 'string' ||
      subject.trim().length < 3 ||
      typeof message !== 'string' ||
      message.trim().length < 10
    ) {
      res.status(400).json({ error: 'Please provide a valid name, email, subject, and message (min 10 chars).' });
      return;
    }

    db.prepare('INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)').run(
      name.trim(),
      email.trim().toLowerCase(),
      subject.trim(),
      message.trim()
    );
    res.status(201).json({ message: 'Inquiry recorded by the Campus Help Desk.' });
  });

  router.get('/public/download-project', async (_req, res) => {
    try {
      const zip = new JSZip();
      const rootDir = process.cwd();
      const ignoredNames = new Set([
        'node_modules',
        '.git',
        'dist',
        'data',
        'uploads',
        '.aistudio',
        'bun.lock',
      ]);

      const addDirToZip = (currentDir: string, relBase: string) => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (ignoredNames.has(entry.name)) continue;
          const fullPath = path.join(currentDir, entry.name);
          const relPath = relBase ? `${relBase}/${entry.name}` : `campusresolve-project/${entry.name}`;
          if (entry.isDirectory()) {
            addDirToZip(fullPath, relPath);
          } else if (entry.isFile()) {
            const content = fs.readFileSync(fullPath);
            zip.file(relPath, content);
          }
        }
      };

      addDirToZip(rootDir, '');
      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        platform: 'DOS',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', 'attachment; filename="campusresolve-project.zip"');
      res.send(buffer);
    } catch {
      res.status(500).json({ error: 'Failed to generate project archive.' });
    }
  });

  // =========================================================================
  // AUTHENTICATION & PROFILE ENDPOINTS
  // =========================================================================
  router.get('/auth/me', (req: AuthedRequest, res) => {
    if (!req.user) {
      res.json({ user: null, csrfToken: null });
      return;
    }
    const csrfToken = (req as AuthedRequest & { csrfToken?: string }).csrfToken ?? null;
    res.json({ user: req.user, csrfToken });
  });

  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const row = db
      .prepare('SELECT id, password_hash, role, is_active FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email.trim()) as
      | { id: number; password_hash: string; role: 'student' | 'staff' | 'admin'; is_active: number }
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid campus email or password.' });
      return;
    }
    if (!row.is_active) {
      res.status(403).json({ error: 'Your account has been suspended. Contact the Campus Administrator.' });
      return;
    }

    const csrfToken = setSessionCookie(req, res, row.id, row.role);
    const user = loadUserProfile(row.id);
    logActivity(row.id, 'USER_LOGIN', 'user', row.id, `Signed in as ${row.role}.`);
    res.json({ user, csrfToken });
  });

  router.post('/auth/register', (req, res) => {
    const { full_name, email, password, phone, roll_number, department, academic_year, hostel_block } =
      req.body ?? {};

    if (
      typeof full_name !== 'string' ||
      full_name.trim().length < 2 ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' ||
      password.length < 6 ||
      typeof roll_number !== 'string' ||
      roll_number.trim().length < 3 ||
      typeof department !== 'string' ||
      department.trim().length < 2
    ) {
      res.status(400).json({
        error: 'All required fields (full name, valid email, password >= 6 chars, roll number, department) must be provided.',
      });
      return;
    }

    const existingEmail = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email.trim());
    if (existingEmail) {
      res.status(409).json({ error: 'An account with this campus email already exists.' });
      return;
    }

    const existingRoll = db
      .prepare('SELECT id FROM students WHERE UPPER(roll_number) = UPPER(?)')
      .get(roll_number.trim());
    if (existingRoll) {
      res.status(409).json({ error: 'This student roll number is already registered.' });
      return;
    }

    const yearNum = Math.min(5, Math.max(1, Number(academic_year) || 1));
    const passwordHash = hashPassword(password);

    const tx = db.transaction(() => {
      const uRes = db
        .prepare('INSERT INTO users (full_name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)')
        .run(full_name.trim(), email.trim().toLowerCase(), passwordHash, 'student', phone?.trim() || null);
      const userId = Number(uRes.lastInsertRowid);

      db.prepare(
        'INSERT INTO students (user_id, roll_number, department, academic_year, hostel_block) VALUES (?, ?, ?, ?, ?)'
      ).run(
        userId,
        roll_number.trim().toUpperCase(),
        department.trim(),
        yearNum,
        hostel_block?.trim() || 'Day Scholar'
      );

      logActivity(userId, 'STUDENT_REGISTERED', 'student', userId, `Registered roll ${roll_number.trim().toUpperCase()}.`);
      return userId;
    });

    const userId = tx();
    const csrfToken = setSessionCookie(req, res, userId, 'student');
    const user = loadUserProfile(userId);
    res.status(201).json({ user, csrfToken });
  });

  router.post('/auth/logout', (req: AuthedRequest, res) => {
    if (req.user) {
      logActivity(req.user.id, 'USER_LOGOUT', 'user', req.user.id, 'Signed out.');
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  router.put('/auth/profile', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { full_name, phone, department, academic_year, hostel_block, availability_status, new_password } =
      req.body ?? {};

    if (typeof full_name !== 'string' || full_name.trim().length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }

    if (new_password !== undefined && new_password !== '') {
      if (typeof new_password !== 'string' || new_password.length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters.' });
        return;
      }
      db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
        hashPassword(new_password),
        user.id
      );
    }

    db.prepare("UPDATE users SET full_name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?").run(
      full_name.trim(),
      typeof phone === 'string' ? phone.trim() : user.phone,
      user.id
    );

    if (user.role === 'student') {
      db.prepare(
        'UPDATE students SET department = ?, academic_year = ?, hostel_block = ? WHERE user_id = ?'
      ).run(
        typeof department === 'string' && department.trim() ? department.trim() : user.department,
        Number(academic_year) || user.academic_year || 1,
        typeof hostel_block === 'string' && hostel_block.trim() ? hostel_block.trim() : user.hostel_block,
        user.id
      );
    } else if (user.role === 'staff' && ['Available', 'Busy', 'Off Duty'].includes(availability_status)) {
      db.prepare('UPDATE staff SET availability_status = ? WHERE user_id = ?').run(
        availability_status,
        user.id
      );
    }

    const updated = loadUserProfile(user.id);
    res.json({ user: updated });
  });

  // =========================================================================
  // CATEGORIES ENDPOINTS
  // =========================================================================
  router.get('/categories', (_req, res) => {
    const rows = db
      .prepare('SELECT id, name, description, sla_hours, is_active FROM complaint_categories ORDER BY id ASC')
      .all();
    res.json(rows);
  });

  router.post('/categories', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const { name, description, sla_hours } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length < 3) {
      res.status(400).json({ error: 'Category name is required.' });
      return;
    }
    const existing = db
      .prepare('SELECT id FROM complaint_categories WHERE LOWER(name) = LOWER(?)')
      .get(name.trim());
    if (existing) {
      res.status(409).json({ error: 'A category with this name already exists.' });
      return;
    }

    const sla = Math.max(4, Math.min(168, Number(sla_hours) || 24));
    const result = db
      .prepare('INSERT INTO complaint_categories (name, description, sla_hours) VALUES (?, ?, ?)')
      .run(name.trim(), typeof description === 'string' ? description.trim() : '', sla);

    logActivity(req.user!.id, 'CATEGORY_CREATED', 'category', Number(result.lastInsertRowid), `Added ${name.trim()}`);
    res.status(201).json({
      id: Number(result.lastInsertRowid),
      name: name.trim(),
      description: description?.trim() ?? '',
      sla_hours: sla,
      is_active: 1,
    });
  });

  router.delete('/categories/:id', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const catId = Number(req.params.id);
    const inUse = db
      .prepare('SELECT COUNT(*) as c FROM complaints WHERE category_id = ?')
      .get(catId) as { c: number };
    if (inUse.c > 0) {
      db.prepare('UPDATE complaint_categories SET is_active = 0 WHERE id = ?').run(catId);
      res.json({ message: 'Category archived because historical complaints reference it.' });
      return;
    }
    db.prepare('DELETE FROM complaint_categories WHERE id = ?').run(catId);
    res.json({ message: 'Category deleted.' });
  });

  // =========================================================================
  // COMPLAINTS ENDPOINTS (Role-Scoped, Upload, Tracking, Reopen, Feedback)
  // =========================================================================
  router.get('/complaints', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { search, status, category_id, priority, escalated } = req.query;

    const where: string[] = [];
    const params: unknown[] = [];

    if (user.role === 'student') {
      where.push('c.student_id = ?');
      params.push(user.student_id);
    } else if (user.role === 'staff') {
      where.push('c.assigned_staff_id = ?');
      params.push(user.staff_id);
    }

    if (typeof search === 'string' && search.trim()) {
      where.push('(c.complaint_code LIKE ? OR c.title LIKE ? OR c.location LIKE ? OR su.full_name LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    if (typeof status === 'string' && status && status !== 'All') {
      where.push('c.status = ?');
      params.push(status);
    }
    if (typeof category_id === 'string' && category_id && category_id !== 'All') {
      where.push('c.category_id = ?');
      params.push(Number(category_id));
    }
    if (typeof priority === 'string' && priority && priority !== 'All') {
      where.push('c.priority = ?');
      params.push(priority);
    }
    if (escalated === 'true') {
      where.push('c.is_escalated = 1');
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `SELECT c.*,
                cat.name as category_name,
                cat.sla_hours as category_sla_hours,
                st.roll_number as student_roll,
                st.department as student_department,
                su.full_name as student_name,
                su.email as student_email,
                sf.employee_code as staff_code,
                sf.department as staff_department,
                sfu.full_name as staff_name,
                fb.rating as feedback_rating,
                fb.comments as feedback_comments
         FROM complaints c
         JOIN complaint_categories cat ON c.category_id = cat.id
         JOIN students st ON c.student_id = st.id
         JOIN users su ON st.user_id = su.id
         LEFT JOIN staff sf ON c.assigned_staff_id = sf.id
         LEFT JOIN users sfu ON sf.user_id = sfu.id
         LEFT JOIN feedback fb ON fb.complaint_id = c.id
         ${whereSql}
         ORDER BY c.is_escalated DESC, c.created_at DESC`
      )
      .all(...params);

    res.json(rows);
  });

  router.post(
    '/complaints',
    requireAuth,
    requireRole('student'),
    (req: AuthedRequest, res, next) => {
      upload.single('image')(req, res, (err) => {
        if (err) {
          res.status(400).json({ error: err.message || 'Image upload failed.' });
          return;
        }
        next();
      });
    },
    (req: AuthedRequest, res) => {
      const user = req.user!;
      const { category_id, title, description, location, priority } = req.body ?? {};

      if (
        !category_id ||
        typeof title !== 'string' ||
        title.trim().length < 4 ||
        typeof description !== 'string' ||
        description.trim().length < 10 ||
        typeof location !== 'string' ||
        location.trim().length < 2
      ) {
        res.status(400).json({
          error: 'Please complete category, title (min 4 chars), location, and description (min 10 chars).',
        });
        return;
      }

      const validPriority = ['Low', 'Medium', 'High', 'Critical'].includes(priority) ? priority : 'Medium';
      const cat = db
        .prepare('SELECT id, name FROM complaint_categories WHERE id = ? AND is_active = 1')
        .get(Number(category_id)) as { id: number; name: string } | undefined;

      if (!cat) {
        res.status(400).json({ error: 'Selected complaint category does not exist.' });
        return;
      }

      const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
      const code = generateComplaintCode();

      const tx = db.transaction(() => {
        const result = db
          .prepare(
            `INSERT INTO complaints (
               complaint_code, student_id, category_id, title, description, location, priority, status, image_path
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Submitted', ?)`
          )
          .run(
            code,
            user.student_id,
            cat.id,
            title.trim(),
            description.trim(),
            location.trim(),
            validPriority,
            imagePath
          );

        const complaintId = Number(result.lastInsertRowid);

        db.prepare(
          'INSERT INTO complaint_updates (complaint_id, updated_by_user_id, status_from, status_to, comment) VALUES (?, ?, NULL, ?, ?)'
        ).run(complaintId, user.id, 'Submitted', `Complaint logged by ${user.full_name} for ${location.trim()}.`);

        const admins = db
          .prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1")
          .all() as Array<{ id: number }>;
        for (const adm of admins) {
          createNotification(
            adm.id,
            complaintId,
            `New Complaint: ${code}`,
            `${user.full_name} submitted "${title.trim()}" (${validPriority} · ${cat.name}).`,
            'info'
          );
        }

        logActivity(user.id, 'COMPLAINT_SUBMITTED', 'complaint', complaintId, `${code} submitted.`);
        return complaintId;
      });

      const complaintId = tx();
      const created = db
        .prepare(
          `SELECT c.*, cat.name as category_name
           FROM complaints c
           JOIN complaint_categories cat ON c.category_id = cat.id
           WHERE c.id = ?`
        )
        .get(complaintId);

      res.status(201).json(created);
    }
  );

  router.get('/complaints/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const complaintId = Number(req.params.id);

    const complaint = db
      .prepare(
        `SELECT c.*,
                cat.name as category_name,
                cat.sla_hours as category_sla_hours,
                st.roll_number as student_roll,
                st.department as student_department,
                st.academic_year as student_year,
                st.hostel_block as student_hostel,
                su.full_name as student_name,
                su.email as student_email,
                su.phone as student_phone,
                sf.employee_code as staff_code,
                sf.department as staff_department,
                sf.specialization as staff_specialization,
                sfu.full_name as staff_name,
                sfu.email as staff_email,
                sfu.phone as staff_phone
         FROM complaints c
         JOIN complaint_categories cat ON c.category_id = cat.id
         JOIN students st ON c.student_id = st.id
         JOIN users su ON st.user_id = su.id
         LEFT JOIN staff sf ON c.assigned_staff_id = sf.id
         LEFT JOIN users sfu ON sf.user_id = sfu.id
         WHERE c.id = ?`
      )
      .get(complaintId) as Record<string, unknown> | undefined;

    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    if (user.role === 'student' && complaint.student_id !== user.student_id) {
      res.status(403).json({ error: 'Access denied to another student’s complaint.' });
      return;
    }
    if (user.role === 'staff' && complaint.assigned_staff_id !== user.staff_id) {
      res.status(403).json({ error: 'Access denied: this complaint is not assigned to you.' });
      return;
    }

    const updates = db
      .prepare(
        `SELECT cu.*, u.full_name as updated_by_name, u.role as updated_by_role
         FROM complaint_updates cu
         JOIN users u ON cu.updated_by_user_id = u.id
         WHERE cu.complaint_id = ?
         ORDER BY cu.created_at ASC, cu.id ASC`
      )
      .all(complaintId);

    const assignments = db
      .prepare(
        `SELECT ca.*, sfu.full_name as staff_name, sf.department as staff_department, adu.full_name as admin_name
         FROM complaint_assignments ca
         JOIN staff sf ON ca.staff_id = sf.id
         JOIN users sfu ON sf.user_id = sfu.id
         JOIN admins ad ON ca.assigned_by_admin_id = ad.id
         JOIN users adu ON ad.user_id = adu.id
         WHERE ca.complaint_id = ?
         ORDER BY ca.assigned_at DESC`
      )
      .all(complaintId);

    const feedback = db
      .prepare('SELECT * FROM feedback WHERE complaint_id = ?')
      .get(complaintId) ?? null;

    res.json({ complaint, updates, assignments, feedback });
  });

  router.post('/complaints/:id/assign', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const user = req.user!;
    const complaintId = Number(req.params.id);
    const { staff_id, priority, notes } = req.body ?? {};

    const complaint = db
      .prepare(
        `SELECT c.*, st.user_id as student_user_id
         FROM complaints c
         JOIN students st ON c.student_id = st.id
         WHERE c.id = ?`
      )
      .get(complaintId) as { id: number; complaint_code: string; status: string; priority: string; student_user_id: number } | undefined;

    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const staffMember = db
      .prepare(
        `SELECT sf.id, sf.user_id, sf.department, u.full_name
         FROM staff sf
         JOIN users u ON sf.user_id = u.id
         WHERE sf.id = ? AND u.is_active = 1`
      )
      .get(Number(staff_id)) as { id: number; user_id: number; department: string; full_name: string } | undefined;

    if (!staffMember) {
      res.status(400).json({ error: 'Selected staff member is invalid or inactive.' });
      return;
    }

    const nextPriority = ['Low', 'Medium', 'High', 'Critical'].includes(priority)
      ? priority
      : complaint.priority;

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE complaints
         SET assigned_staff_id = ?, priority = ?, status = 'Assigned', updated_at = datetime('now')
         WHERE id = ?`
      ).run(staffMember.id, nextPriority, complaintId);

      db.prepare(
        'INSERT INTO complaint_assignments (complaint_id, staff_id, assigned_by_admin_id, notes) VALUES (?, ?, ?, ?)'
      ).run(complaintId, staffMember.id, user.admin_id, typeof notes === 'string' ? notes.trim() : null);

      const commentText =
        typeof notes === 'string' && notes.trim()
          ? `Assigned to ${staffMember.full_name} (${staffMember.department}). Note: ${notes.trim()}`
          : `Assigned to ${staffMember.full_name} (${staffMember.department}).`;

      db.prepare(
        'INSERT INTO complaint_updates (complaint_id, updated_by_user_id, status_from, status_to, comment) VALUES (?, ?, ?, ?, ?)'
      ).run(complaintId, user.id, complaint.status, 'Assigned', commentText);

      createNotification(
        staffMember.user_id,
        complaintId,
        `New Assignment: ${complaint.complaint_code}`,
        `You have been assigned ticket ${complaint.complaint_code} (${nextPriority} priority).`,
        'assignment'
      );

      createNotification(
        complaint.student_user_id,
        complaintId,
        `Staff Assigned: ${complaint.complaint_code}`,
        `${staffMember.full_name} (${staffMember.department}) has been assigned to your complaint.`,
        'status'
      );

      logActivity(
        user.id,
        'COMPLAINT_ASSIGNED',
        'complaint',
        complaintId,
        `Assigned ${complaint.complaint_code} to ${staffMember.full_name}.`
      );
    });
    tx();

    res.json({ message: `Assigned to ${staffMember.full_name}.` });
  });

  router.patch(
    '/complaints/:id/status',
    requireAuth,
    requireRole('staff', 'admin'),
    (req: AuthedRequest, res, next) => {
      upload.single('resolution_image')(req, res, (err) => {
        if (err) {
          res.status(400).json({ error: err.message || 'Resolution image upload failed.' });
          return;
        }
        next();
      });
    },
    (req: AuthedRequest, res) => {
      const user = req.user!;
      const complaintId = Number(req.params.id);
      const { status, comment, priority } = req.body ?? {};

      const validStatuses = ['Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Closed'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: 'Invalid target complaint status.' });
        return;
      }

      const complaint = db
        .prepare(
          `SELECT c.*, st.user_id as student_user_id
           FROM complaints c
           JOIN students st ON c.student_id = st.id
           WHERE c.id = ?`
        )
        .get(complaintId) as
        | {
            id: number;
            complaint_code: string;
            status: string;
            priority: string;
            assigned_staff_id: number | null;
            student_user_id: number;
            resolution_image_path: string | null;
            resolution_notes: string | null;
          }
        | undefined;

      if (!complaint) {
        res.status(404).json({ error: 'Complaint not found.' });
        return;
      }

      if (user.role === 'staff' && complaint.assigned_staff_id !== user.staff_id) {
        res.status(403).json({ error: 'You can only update complaints assigned to you.' });
        return;
      }

      const proofPath = req.file ? `/uploads/${req.file.filename}` : complaint.resolution_image_path;
      const noteText =
        typeof comment === 'string' && comment.trim()
          ? comment.trim()
          : `Status updated from ${complaint.status} to ${status}.`;

      const nextPriority =
        user.role === 'admin' && ['Low', 'Medium', 'High', 'Critical'].includes(priority)
          ? priority
          : complaint.priority;

      const resolvedAtSql =
        status === 'Resolved' || status === 'Closed' ? "datetime('now')" : 'resolved_at';
      const escalationResetSql = status === 'Resolved' || status === 'Closed' ? '0' : 'is_escalated';

      const tx = db.transaction(() => {
        db.prepare(
          `UPDATE complaints
           SET status = ?,
               priority = ?,
               resolution_image_path = ?,
               resolution_notes = CASE WHEN ? IN ('Resolved', 'Closed') THEN ? ELSE resolution_notes END,
               resolved_at = ${resolvedAtSql},
               is_escalated = ${escalationResetSql},
               updated_at = datetime('now')
           WHERE id = ?`
        ).run(status, nextPriority, proofPath, status, noteText, complaintId);

        db.prepare(
          'INSERT INTO complaint_updates (complaint_id, updated_by_user_id, status_from, status_to, comment, attachment_path) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(complaintId, user.id, complaint.status, status, noteText, req.file ? proofPath : null);

        createNotification(
          complaint.student_user_id,
          complaintId,
          `Status Update: ${complaint.complaint_code}`,
          `Your complaint is now "${status}". ${noteText}`,
          'status'
        );

        logActivity(
          user.id,
          'STATUS_UPDATED',
          'complaint',
          complaintId,
          `${complaint.complaint_code} changed ${complaint.status} -> ${status}.`
        );
      });
      tx();

      res.json({ message: `Status updated to ${status}.` });
    }
  );

  router.post('/complaints/:id/reopen', requireAuth, requireRole('student'), (req: AuthedRequest, res) => {
    const user = req.user!;
    const complaintId = Number(req.params.id);
    const { reason } = req.body ?? {};

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({ error: 'Please explain why the issue requires reopening (min 5 characters).' });
      return;
    }

    const complaint = db
      .prepare(
        `SELECT c.*, sf.user_id as staff_user_id
         FROM complaints c
         LEFT JOIN staff sf ON c.assigned_staff_id = sf.id
         WHERE c.id = ?`
      )
      .get(complaintId) as
      | {
          id: number;
          complaint_code: string;
          student_id: number;
          status: string;
          staff_user_id: number | null;
        }
      | undefined;

    if (!complaint || complaint.student_id !== user.student_id) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    if (!['Resolved', 'Closed'].includes(complaint.status)) {
      res.status(400).json({ error: 'Only Resolved or Closed complaints can be reopened.' });
      return;
    }

    const tx = db.transaction(() => {
      db.prepare(
        "UPDATE complaints SET status = 'Reopened', resolved_at = NULL, updated_at = datetime('now') WHERE id = ?"
      ).run(complaintId);

      db.prepare(
        'INSERT INTO complaint_updates (complaint_id, updated_by_user_id, status_from, status_to, comment) VALUES (?, ?, ?, ?, ?)'
      ).run(complaintId, user.id, complaint.status, 'Reopened', `Reopened by student: ${reason.trim()}`);

      if (complaint.staff_user_id) {
        createNotification(
          complaint.staff_user_id,
          complaintId,
          `Ticket Reopened: ${complaint.complaint_code}`,
          `${user.full_name} reopened this ticket: "${reason.trim()}"`,
          'status'
        );
      }

      const admins = db
        .prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1")
        .all() as Array<{ id: number }>;
      for (const adm of admins) {
        createNotification(
          adm.id,
          complaintId,
          `Ticket Reopened: ${complaint.complaint_code}`,
          `${user.full_name} reopened ${complaint.complaint_code}.`,
          'status'
        );
      }

      logActivity(user.id, 'COMPLAINT_REOPENED', 'complaint', complaintId, `${complaint.complaint_code} reopened.`);
    });
    tx();

    res.json({ message: 'Complaint reopened and escalated to the assigned team.' });
  });

  router.post('/complaints/:id/feedback', requireAuth, requireRole('student'), (req: AuthedRequest, res) => {
    const user = req.user!;
    const complaintId = Number(req.params.id);
    const { rating, comments } = req.body ?? {};
    const ratingNum = Number(rating);

    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
      return;
    }

    const complaint = db
      .prepare('SELECT id, student_id, status, complaint_code FROM complaints WHERE id = ?')
      .get(complaintId) as { id: number; student_id: number; status: string; complaint_code: string } | undefined;

    if (!complaint || complaint.student_id !== user.student_id) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    if (!['Resolved', 'Closed'].includes(complaint.status)) {
      res.status(400).json({ error: 'Feedback can only be submitted after a complaint is Resolved or Closed.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM feedback WHERE complaint_id = ?').get(complaintId);
    if (existing) {
      res.status(409).json({ error: 'Feedback has already been recorded for this complaint.' });
      return;
    }

    const tx = db.transaction(() => {
      db.prepare('INSERT INTO feedback (complaint_id, student_id, rating, comments) VALUES (?, ?, ?, ?)').run(
        complaintId,
        user.student_id,
        ratingNum,
        typeof comments === 'string' ? comments.trim() : null
      );

      if (complaint.status === 'Resolved') {
        db.prepare("UPDATE complaints SET status = 'Closed', updated_at = datetime('now') WHERE id = ?").run(
          complaintId
        );
        db.prepare(
          'INSERT INTO complaint_updates (complaint_id, updated_by_user_id, status_from, status_to, comment) VALUES (?, ?, ?, ?, ?)'
        ).run(
          complaintId,
          user.id,
          'Resolved',
          'Closed',
          `Student submitted ${ratingNum}/5 rating and closed ticket.`
        );
      }
      logActivity(user.id, 'FEEDBACK_SUBMITTED', 'complaint', complaintId, `Rated ${ratingNum}/5.`);
    });
    tx();

    res.status(201).json({ message: 'Thank you for rating the campus resolution.' });
  });

  router.post('/complaints/escalate-check', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const result = runEscalationEngine(req.user!.id);
    res.json(result);
  });

  // =========================================================================
  // ANALYTICS & CSV EXPORT ENDPOINTS
  // =========================================================================
  router.get('/analytics', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;

    if (user.role === 'student') {
      const summary = db
        .prepare(
          `SELECT
             COUNT(*) as total,
             SUM(CASE WHEN status IN ('Submitted', 'Under Review') THEN 1 ELSE 0 END) as pending,
             SUM(CASE WHEN status IN ('Assigned', 'In Progress', 'Reopened') THEN 1 ELSE 0 END) as in_progress,
             SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved
           FROM complaints
           WHERE student_id = ?`
        )
        .get(user.student_id);

      const byCategory = db
        .prepare(
          `SELECT cat.name, COUNT(c.id) as count
           FROM complaints c
           JOIN complaint_categories cat ON c.category_id = cat.id
           WHERE c.student_id = ?
           GROUP BY cat.id
           ORDER BY count DESC`
        )
        .all(user.student_id);

      res.json({ role: 'student', summary, byCategory });
      return;
    }

    if (user.role === 'staff') {
      const summary = db
        .prepare(
          `SELECT
             COUNT(*) as total_assigned,
             SUM(CASE WHEN status = 'Assigned' THEN 1 ELSE 0 END) as new_assignments,
             SUM(CASE WHEN status IN ('In Progress', 'Reopened') THEN 1 ELSE 0 END) as in_progress,
             SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as completed,
             ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at) - julianday(created_at)) * 24 END), 1) as avg_hours
           FROM complaints
           WHERE assigned_staff_id = ?`
        )
        .get(user.staff_id);

      const byStatus = db
        .prepare(
          `SELECT status, COUNT(*) as count
           FROM complaints
           WHERE assigned_staff_id = ?
           GROUP BY status`
        )
        .all(user.staff_id);

      const byCategory = db
        .prepare(
          `SELECT cat.name, COUNT(c.id) as count
           FROM complaints c
           JOIN complaint_categories cat ON c.category_id = cat.id
           WHERE c.assigned_staff_id = ?
           GROUP BY cat.id
           ORDER BY count DESC`
        )
        .all(user.staff_id);

      res.json({ role: 'staff', summary, byStatus, byCategory });
      return;
    }

    // Admin full analytics
    const summary = db
      .prepare(
        `SELECT
           COUNT(*) as total_complaints,
           SUM(CASE WHEN status IN ('Submitted', 'Under Review') THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status IN ('Assigned', 'In Progress', 'Reopened') THEN 1 ELSE 0 END) as in_progress,
           SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved,
           SUM(CASE WHEN is_escalated = 1 AND status NOT IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as escalated_open,
           ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at) - julianday(created_at)) * 24 END), 1) as avg_resolution_hours
         FROM complaints`
      )
      .get();

    const userCounts = db
      .prepare(
        `SELECT
           SUM(CASE WHEN role = 'student' AND is_active = 1 THEN 1 ELSE 0 END) as total_students,
           SUM(CASE WHEN role = 'staff' AND is_active = 1 THEN 1 ELSE 0 END) as total_staff
         FROM users`
      )
      .get();

    const byCategory = db
      .prepare(
        `SELECT cat.name, COUNT(c.id) as count
         FROM complaint_categories cat
         LEFT JOIN complaints c ON c.category_id = cat.id
         WHERE cat.is_active = 1
         GROUP BY cat.id
         HAVING count > 0
         ORDER BY count DESC`
      )
      .all();

    const byStatus = db
      .prepare('SELECT status, COUNT(*) as count FROM complaints GROUP BY status ORDER BY count DESC')
      .all();

    const byPriority = db
      .prepare('SELECT priority, COUNT(*) as count FROM complaints GROUP BY priority')
      .all();

    const monthlyTrend = db
      .prepare(
        `SELECT strftime('%Y-%m', created_at) as month,
                COUNT(*) as submitted,
                SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved
         FROM complaints
         GROUP BY strftime('%Y-%m', created_at)
         ORDER BY month ASC`
      )
      .all();

    const staffPerformance = db
      .prepare(
        `SELECT sf.id, u.full_name as name, sf.department,
                COUNT(c.id) as total_assigned,
                SUM(CASE WHEN c.status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved_count,
                SUM(CASE WHEN c.status NOT IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as active_count,
                ROUND(AVG(CASE WHEN c.resolved_at IS NOT NULL THEN (julianday(c.resolved_at) - julianday(c.created_at)) * 24 END), 1) as avg_hours,
                ROUND(AVG(fb.rating), 2) as avg_rating
         FROM staff sf
         JOIN users u ON sf.user_id = u.id
         LEFT JOIN complaints c ON c.assigned_staff_id = sf.id
         LEFT JOIN feedback fb ON fb.complaint_id = c.id
         WHERE u.is_active = 1
         GROUP BY sf.id
         ORDER BY resolved_count DESC`
      )
      .all();

    res.json({
      role: 'admin',
      summary: { ...(summary as object), ...(userCounts as object) },
      byCategory,
      byStatus,
      byPriority,
      monthlyTrend,
      staffPerformance,
    });
  });

  router.get('/reports/export.csv', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const { status, category_id, priority } = req.query;
    const where: string[] = [];
    const params: unknown[] = [];

    if (typeof status === 'string' && status && status !== 'All') {
      where.push('c.status = ?');
      params.push(status);
    }
    if (typeof category_id === 'string' && category_id && category_id !== 'All') {
      where.push('c.category_id = ?');
      params.push(Number(category_id));
    }
    if (typeof priority === 'string' && priority && priority !== 'All') {
      where.push('c.priority = ?');
      params.push(priority);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT c.complaint_code, c.title, cat.name as category, c.location, c.priority, c.status,
                c.is_escalated, su.full_name as student_name, st.roll_number,
                COALESCE(sfu.full_name, 'Unassigned') as assigned_staff,
                c.created_at, COALESCE(c.resolved_at, '') as resolved_at,
                COALESCE(fb.rating, '') as rating
         FROM complaints c
         JOIN complaint_categories cat ON c.category_id = cat.id
         JOIN students st ON c.student_id = st.id
         JOIN users su ON st.user_id = su.id
         LEFT JOIN staff sf ON c.assigned_staff_id = sf.id
         LEFT JOIN users sfu ON sf.user_id = sfu.id
         LEFT JOIN feedback fb ON fb.complaint_id = c.id
         ${whereSql}
         ORDER BY c.created_at DESC`
      )
      .all(...params) as Array<Record<string, unknown>>;

    const headers = [
      'Complaint ID',
      'Title',
      'Category',
      'Location',
      'Priority',
      'Status',
      'Escalated',
      'Student Name',
      'Roll Number',
      'Assigned Staff',
      'Submitted At',
      'Resolved At',
      'Feedback Rating',
    ];

    const escapeCsv = (val: unknown) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.complaint_code,
          r.title,
          r.category,
          r.location,
          r.priority,
          r.status,
          r.is_escalated ? 'Yes' : 'No',
          r.student_name,
          r.roll_number,
          r.assigned_staff,
          r.created_at,
          r.resolved_at,
          r.rating,
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ];

    logActivity(req.user!.id, 'CSV_REPORT_EXPORTED', 'report', null, `Exported ${rows.length} complaint rows.`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="campus-complaints-report.csv"');
    res.send(csvLines.join('\n'));
  });

  // =========================================================================
  // ADMIN USER & STAFF MANAGEMENT
  // =========================================================================
  router.get('/admin/users', requireAuth, requireRole('admin'), (_req, res) => {
    const students = db
      .prepare(
        `SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.created_at,
                st.id as student_id, st.roll_number, st.department, st.academic_year, st.hostel_block,
                (SELECT COUNT(*) FROM complaints c WHERE c.student_id = st.id) as complaint_count
         FROM users u
         JOIN students st ON st.user_id = u.id
         ORDER BY u.created_at DESC`
      )
      .all();

    const staff = db
      .prepare(
        `SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.created_at,
                sf.id as staff_id, sf.employee_code, sf.department, sf.specialization, sf.availability_status,
                (SELECT COUNT(*) FROM complaints c WHERE c.assigned_staff_id = sf.id AND c.status NOT IN ('Resolved', 'Closed')) as active_tasks,
                (SELECT COUNT(*) FROM complaints c WHERE c.assigned_staff_id = sf.id AND c.status IN ('Resolved', 'Closed')) as completed_tasks
         FROM users u
         JOIN staff sf ON sf.user_id = u.id
         ORDER BY sf.employee_code ASC`
      )
      .all();

    res.json({ students, staff });
  });

  router.post('/admin/staff', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const { full_name, email, password, phone, employee_code, department, specialization } = req.body ?? {};
    if (
      typeof full_name !== 'string' ||
      full_name.trim().length < 2 ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' ||
      password.length < 6 ||
      typeof employee_code !== 'string' ||
      employee_code.trim().length < 3 ||
      typeof department !== 'string' ||
      department.trim().length < 2 ||
      typeof specialization !== 'string' ||
      specialization.trim().length < 2
    ) {
      res.status(400).json({ error: 'All staff fields and a password of at least 6 characters are required.' });
      return;
    }

    const dupEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (dupEmail) {
      res.status(409).json({ error: 'Email already registered.' });
      return;
    }
    const dupCode = db
      .prepare('SELECT id FROM staff WHERE UPPER(employee_code) = UPPER(?)')
      .get(employee_code.trim());
    if (dupCode) {
      res.status(409).json({ error: 'Employee code already exists.' });
      return;
    }

    const tx = db.transaction(() => {
      const uRes = db
        .prepare('INSERT INTO users (full_name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)')
        .run(full_name.trim(), email.trim().toLowerCase(), hashPassword(password), 'staff', phone?.trim() || null);
      const userId = Number(uRes.lastInsertRowid);

      const sRes = db
        .prepare(
          'INSERT INTO staff (user_id, employee_code, department, specialization) VALUES (?, ?, ?, ?)'
        )
        .run(userId, employee_code.trim().toUpperCase(), department.trim(), specialization.trim());

      logActivity(
        req.user!.id,
        'STAFF_CREATED',
        'staff',
        Number(sRes.lastInsertRowid),
        `Created staff ${full_name.trim()} (${employee_code.trim().toUpperCase()}).`
      );
      return Number(sRes.lastInsertRowid);
    });

    const staffId = tx();
    res.status(201).json({ id: staffId, message: 'Staff account created.' });
  });

  router.patch('/admin/users/:id/toggle', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const targetId = Number(req.params.id);
    if (targetId === req.user!.id) {
      res.status(400).json({ error: 'You cannot deactivate your own administrator account.' });
      return;
    }
    const target = db.prepare('SELECT id, full_name, is_active FROM users WHERE id = ?').get(targetId) as
      | { id: number; full_name: string; is_active: number }
      | undefined;
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const nextState = target.is_active ? 0 : 1;
    db.prepare("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(
      nextState,
      targetId
    );
    logActivity(
      req.user!.id,
      nextState ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
      'user',
      targetId,
      `${target.full_name} set to ${nextState ? 'active' : 'suspended'}.`
    );
    res.json({ is_active: nextState });
  });

  // =========================================================================
  // ANNOUNCEMENTS, FEEDBACK, LOGS, NOTIFICATIONS
  // =========================================================================
  router.get('/announcements', requireAuth, (req: AuthedRequest, res) => {
    const role = req.user!.role;
    const audienceFilter =
      role === 'admin'
        ? ''
        : role === 'student'
        ? "WHERE a.audience IN ('All', 'Students')"
        : "WHERE a.audience IN ('All', 'Staff')";

    const rows = db
      .prepare(
        `SELECT a.*, u.full_name as author_name
         FROM announcements a
         JOIN admins ad ON a.admin_id = ad.id
         JOIN users u ON ad.user_id = u.id
         ${audienceFilter}
         ORDER BY a.is_pinned DESC, a.created_at DESC`
      )
      .all();
    res.json(rows);
  });

  router.post('/announcements', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const { title, content, audience, is_pinned } = req.body ?? {};
    if (typeof title !== 'string' || title.trim().length < 4 || typeof content !== 'string' || content.trim().length < 10) {
      res.status(400).json({ error: 'Announcement title and content (min 10 chars) are required.' });
      return;
    }
    const validAudience = ['All', 'Students', 'Staff'].includes(audience) ? audience : 'All';
    const pinned = is_pinned ? 1 : 0;

    const tx = db.transaction(() => {
      const resInsert = db
        .prepare('INSERT INTO announcements (admin_id, title, content, audience, is_pinned) VALUES (?, ?, ?, ?, ?)')
        .run(req.user!.admin_id, title.trim(), content.trim(), validAudience, pinned);
      const id = Number(resInsert.lastInsertRowid);

      const roleCondition =
        validAudience === 'Students'
          ? "role = 'student'"
          : validAudience === 'Staff'
          ? "role = 'staff'"
          : "role IN ('student', 'staff')";

      const recipients = db
        .prepare(`SELECT id FROM users WHERE ${roleCondition} AND is_active = 1`)
        .all() as Array<{ id: number }>;

      for (const r of recipients) {
        createNotification(r.id, null, `Announcement: ${title.trim()}`, content.trim(), 'announcement');
      }

      logActivity(req.user!.id, 'ANNOUNCEMENT_PUBLISHED', 'announcement', id, title.trim());
      return id;
    });

    const id = tx();
    res.status(201).json({ id, message: 'Announcement published.' });
  });

  router.delete('/announcements/:id', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM announcements WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  router.get('/admin/feedback', requireAuth, requireRole('admin'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT fb.*, c.complaint_code, c.title as complaint_title, cat.name as category_name,
                su.full_name as student_name, st.roll_number,
                COALESCE(sfu.full_name, 'Unassigned') as staff_name
         FROM feedback fb
         JOIN complaints c ON fb.complaint_id = c.id
         JOIN complaint_categories cat ON c.category_id = cat.id
         JOIN students st ON fb.student_id = st.id
         JOIN users su ON st.user_id = su.id
         LEFT JOIN staff sf ON c.assigned_staff_id = sf.id
         LEFT JOIN users sfu ON sf.user_id = sfu.id
         ORDER BY fb.created_at DESC`
      )
      .all();
    res.json(rows);
  });

  router.get('/admin/activity-logs', requireAuth, requireRole('admin'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT al.*, COALESCE(u.full_name, 'System') as user_name, COALESCE(u.role, 'system') as user_role
         FROM activity_logs al
         LEFT JOIN users u ON al.user_id = u.id
         ORDER BY al.created_at DESC, al.id DESC
         LIMIT 60`
      )
      .all();
    res.json(rows);
  });

  router.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT n.*, c.complaint_code
         FROM notifications n
         LEFT JOIN complaints c ON n.complaint_id = c.id
         WHERE n.user_id = ?
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT 50`
      )
      .all(req.user!.id);
    const unreadRow = db
      .prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(req.user!.id) as { c: number };
    res.json({ notifications: rows, unreadCount: unreadRow.c });
  });

  router.patch('/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
    res.json({ ok: true });
  });

  router.patch('/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(
      Number(req.params.id),
      req.user!.id
    );
    res.json({ ok: true });
  });

  return router;
}
