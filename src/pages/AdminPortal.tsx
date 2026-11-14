import {
  AlertTriangle,
  Download,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ChartCanvas } from '../components/ChartCanvas.tsx';
import { PriorityIndicator, StatusIndicator } from '../components/StatusVisuals.tsx';
import { apiRequest, formatDateShort, formatDateTime } from '../lib/api.ts';
import type {
  ActivityLog,
  Announcement,
  Category,
  Complaint,
  ComplaintPriority,
  FeedbackRecord,
} from '../types.ts';

interface AdminAnalytics {
  summary: {
    total_complaints: number;
    pending: number;
    in_progress: number;
    resolved: number;
    escalated_open: number;
    avg_resolution_hours: number | null;
    total_students: number;
    total_staff: number;
  };
  byCategory: Array<{ name: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  monthlyTrend: Array<{ month: string; submitted: number; resolved: number }>;
  staffPerformance: Array<{
    id: number;
    name: string;
    department: string;
    total_assigned: number;
    resolved_count: number;
    active_count: number;
    avg_hours: number | null;
    avg_rating: number | null;
  }>;
}

interface StudentRow {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: number;
  student_id: number;
  roll_number: string;
  department: string;
  academic_year: number;
  hostel_block: string;
  complaint_count: number;
}

interface StaffRow {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: number;
  staff_id: number;
  employee_code: string;
  department: string;
  specialization: string;
  availability_status: string;
  active_tasks: number;
  completed_tasks: number;
}

interface AdminPortalProps {
  section:
    | 'dashboard'
    | 'complaints'
    | 'assign'
    | 'students'
    | 'staff'
    | 'analytics'
    | 'governance';
  darkMode: boolean;
  onSelectComplaint: (id: number) => void;
  onNavigate: (section: string) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

const CHART_PALETTE = [
  '#2563eb',
  '#4f46e5',
  '#7c3aed',
  '#0284c7',
  '#0d9488',
  '#d97706',
  '#e11d48',
  '#475569',
];

export function AdminPortal({
  section,
  darkMode,
  onSelectComplaint,
  onNavigate,
  onToast,
}: AdminPortalProps) {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [feedbackList, setFeedbackList] = useState<FeedbackRecord[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [onlyEscalated, setOnlyEscalated] = useState(false);

  // Assign Modal
  const [assignModalTicket, setAssignModalTicket] = useState<Complaint | null>(null);
  const [assignStaffId, setAssignStaffId] = useState('');
  const [assignPriority, setAssignPriority] = useState<ComplaintPriority>('Medium');
  const [assignNote, setAssignNote] = useState('');

  // Add Staff Modal
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    employee_code: '',
    department: 'Electrical Maintenance',
    specialization: '',
  });

  // Governance forms
  const [newCat, setNewCat] = useState({ name: '', description: '', sla_hours: '24' });
  const [newAnn, setNewAnn] = useState({ title: '', content: '', audience: 'All', is_pinned: false });
  const [govTab, setGovTab] = useState<'categories' | 'announcements' | 'feedback' | 'logs'>('categories');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [anaRes, compRes, catRes, usrRes, annRes, fbRes, logRes] = await Promise.all([
        apiRequest<AdminAnalytics>('/analytics'),
        apiRequest<Complaint[]>('/complaints'),
        apiRequest<Category[]>('/categories'),
        apiRequest<{ students: StudentRow[]; staff: StaffRow[] }>('/admin/users'),
        apiRequest<Announcement[]>('/announcements'),
        apiRequest<FeedbackRecord[]>('/admin/feedback'),
        apiRequest<ActivityLog[]>('/admin/activity-logs'),
      ]);
      setAnalytics(anaRes);
      setComplaints(compRes);
      setCategories(catRes);
      setStudents(usrRes.students);
      setStaffList(usrRes.staff);
      setAnnouncements(annRes);
      setFeedbackList(fbRes);
      setLogs(logRes);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load admin workspace.', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleRunEscalation() {
    try {
      const res = await apiRequest<{ escalatedCount: number; escalatedCodes: string[] }>(
        '/complaints/escalate-check',
        { method: 'POST' }
      );
      if (res.escalatedCount > 0) {
        onToast(`Escalated ${res.escalatedCount} overdue ticket(s): ${res.escalatedCodes.join(', ')}`);
      } else {
        onToast('All active tickets are currently within their SLA windows.');
      }
      await loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Escalation sweep failed.', 'err');
    }
  }

  async function handleConfirmAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignModalTicket || !assignStaffId) return;
    try {
      const res = await apiRequest<{ message: string }>(`/complaints/${assignModalTicket.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          staff_id: Number(assignStaffId),
          priority: assignPriority,
          notes: assignNote,
        }),
      });
      onToast(res.message);
      setAssignModalTicket(null);
      setAssignNote('');
      await loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Assignment failed.', 'err');
    }
  }

  async function handleToggleUser(userId: number) {
    try {
      await apiRequest(`/admin/users/${userId}/toggle`, { method: 'PATCH' });
      onToast('User account status updated.');
      await loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update user status.', 'err');
    }
  }

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest('/admin/staff', {
        method: 'POST',
        body: JSON.stringify(newStaff),
      });
      onToast('Staff account created successfully.');
      setShowAddStaff(false);
      setNewStaff({
        full_name: '',
        email: '',
        password: '',
        phone: '',
        employee_code: '',
        department: 'Electrical Maintenance',
        specialization: '',
      });
      await loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not create staff member.', 'err');
    }
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest('/categories', {
        method: 'POST',
        body: JSON.stringify({ ...newCat, sla_hours: Number(newCat.sla_hours) }),
      });
      onToast('Complaint category added.');
      setNewCat({ name: '', description: '', sla_hours: '24' });
      await loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to create category.', 'err');
    }
  }

  async function handleDeleteCategory(id: number) {
    try {
      const res = await apiRequest<{ message: string }>(`/categories/${id}`, { method: 'DELETE' });
      onToast(res.message);
      await loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Delete failed.', 'err');
    }
  }

  async function handlePublishAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest('/announcements', {
        method: 'POST',
        body: JSON.stringify(newAnn),
      });
      onToast('Announcement published and users notified.');
      setNewAnn({ title: '', content: '', audience: 'All', is_pinned: false });
      await loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not publish announcement.', 'err');
    }
  }

  async function handleDeleteAnnouncement(id: number) {
    try {
      await apiRequest(`/announcements/${id}`, { method: 'DELETE' });
      onToast('Announcement removed.');
      await loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Delete failed.', 'err');
    }
  }

  function handleExportCsv() {
    const params = new URLSearchParams();
    if (statusFilter !== 'All') params.set('status', statusFilter);
    if (categoryFilter !== 'All') params.set('category_id', categoryFilter);
    if (priorityFilter !== 'All') params.set('priority', priorityFilter);
    window.location.href = `/api/reports/export.csv?${params.toString()}`;
    onToast('Downloading filtered CSV report...');
  }

  const filteredComplaints = complaints.filter((c) => {
    if (statusFilter !== 'All' && c.status !== statusFilter) return false;
    if (categoryFilter !== 'All' && String(c.category_id) !== categoryFilter) return false;
    if (priorityFilter !== 'All' && c.priority !== priorityFilter) return false;
    if (onlyEscalated && !c.is_escalated) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.complaint_code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.student_name.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const assignModal = assignModalTicket ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-950 dark:text-white font-display">
              Assign Specialist Staff
            </h3>
            <p className="text-xs font-mono text-blue-700 dark:text-blue-400 mt-0.5">
              {assignModalTicket.complaint_code} · {assignModalTicket.category_name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAssignModalTicket(null)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleConfirmAssign} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Staff Member
            </label>
            <select
              required
              value={assignStaffId}
              onChange={(e) => setAssignStaffId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            >
              <option value="">Choose staff...</option>
              {staffList
                .filter((s) => s.is_active)
                .map((s) => (
                  <option key={s.staff_id} value={s.staff_id}>
                    {s.full_name} ({s.department} · {s.active_tasks} open)
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Priority
            </label>
            <select
              value={assignPriority}
              onChange={(e) => setAssignPriority(e.target.value as ComplaintPriority)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Assignment Note
            </label>
            <input
              type="text"
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
              placeholder="Optional instructions..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAssignModalTicket(null)}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              Confirm Dispatch
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  // SECTION: ADMIN DASHBOARD
  if (section === 'dashboard') {
    const s = analytics?.summary;
    return (
      <div className="space-y-6">
        {assignModal}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">
              Campus Operations Control
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Live overview across {s?.total_students ?? 0} students and {s?.total_staff ?? 0} service staff
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleRunEscalation}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Run SLA Escalation Check</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Tickets', val: s?.total_complaints ?? 0, tone: 'text-slate-950 dark:text-white' },
            { label: 'Pending Triage', val: s?.pending ?? 0, tone: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'In Progress', val: s?.in_progress ?? 0, tone: 'text-amber-600 dark:text-amber-400' },
            { label: 'Resolved', val: s?.resolved ?? 0, tone: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'SLA Overdue', val: s?.escalated_open ?? 0, tone: 'text-rose-600 dark:text-rose-400' },
            { label: 'Avg Resolution', val: `${s?.avg_resolution_hours ?? 0}h`, tone: 'text-blue-700 dark:text-blue-400' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
            >
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</div>
              <div className={`mt-2 text-2xl font-bold font-mono tabular-nums ${kpi.tone}`}>{kpi.val}</div>
            </div>
          ))}
        </div>

        {/* Real Chart.js Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
              Monthly Complaint Trends (Submitted vs Resolved)
            </h2>
            {analytics && analytics.monthlyTrend.length > 0 ? (
              <ChartCanvas
                type="line"
                darkMode={darkMode}
                height={260}
                labels={analytics.monthlyTrend.map((m) => m.month)}
                datasets={[
                  {
                    label: 'Submitted',
                    data: analytics.monthlyTrend.map((m) => m.submitted),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.14)',
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: 'Resolved / Closed',
                    data: analytics.monthlyTrend.map((m) => m.resolved),
                    borderColor: '#16a34a',
                    backgroundColor: 'rgba(22, 163, 74, 0.1)',
                    fill: true,
                    tension: 0.3,
                  },
                ]}
              />
            ) : (
              <div className="h-[260px] flex items-center justify-center text-sm text-slate-500">
                Loading trend data...
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
              Distribution by Category
            </h2>
            {analytics && analytics.byCategory.length > 0 ? (
              <ChartCanvas
                type="doughnut"
                darkMode={darkMode}
                height={260}
                labels={analytics.byCategory.map((c) => c.name)}
                datasets={[
                  {
                    label: 'Complaints',
                    data: analytics.byCategory.map((c) => c.count),
                    backgroundColor: CHART_PALETTE,
                  },
                ]}
              />
            ) : (
              <div className="h-[260px] flex items-center justify-center text-sm text-slate-500">
                Loading category breakdown...
              </div>
            )}
          </div>
        </div>

        {/* Staff Performance & Actionable Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
              Staff Resolution Performance
            </h2>
            {analytics && analytics.staffPerformance.length > 0 ? (
              <ChartCanvas
                type="bar"
                darkMode={darkMode}
                height={240}
                labels={analytics.staffPerformance.map((sp) => sp.name)}
                datasets={[
                  {
                    label: 'Resolved Tasks',
                    data: analytics.staffPerformance.map((sp) => sp.resolved_count),
                    backgroundColor: '#16a34a',
                    borderRadius: 4,
                  },
                  {
                    label: 'Active Tasks',
                    data: analytics.staffPerformance.map((sp) => sp.active_count),
                    backgroundColor: '#7c3aed',
                    borderRadius: 4,
                  },
                ]}
              />
            ) : null}
          </div>

          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-950 dark:text-white font-display">
                Tickets Requiring Attention
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('complaints')}
                className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Manage All
              </button>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {complaints
                .filter((c) => ['Submitted', 'Under Review', 'Reopened'].includes(c.status) || c.is_escalated)
                .slice(0, 5)
                .map((c) => (
                  <div key={c.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div
                      onClick={() => onSelectComplaint(c.id)}
                      className="min-w-0 cursor-pointer"
                    >
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                          {c.complaint_code}
                        </span>
                        <span className="mx-1.5">·</span>
                        <span>{c.category_name}</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{c.title}</div>
                      <div className="mt-1 flex items-center gap-3">
                        <PriorityIndicator priority={c.priority} escalated={Boolean(c.is_escalated)} />
                        <StatusIndicator status={c.status} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAssignModalTicket(c);
                        setAssignPriority(c.priority);
                        setAssignStaffId(c.assigned_staff_id ? String(c.assigned_staff_id) : '');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 rounded-lg hover:bg-blue-100 cursor-pointer shrink-0"
                    >
                      Assign
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SECTION: MANAGE COMPLAINTS
  if (section === 'complaints') {
    return (
      <div className="space-y-6">
        {assignModal}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">Manage Complaints</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Search, filter, assign specialists, and export campus service records.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download CSV Report</span>
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, title, student, location..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
          >
            <option value="All">All Statuses</option>
            <option value="Submitted">Submitted</option>
            <option value="Under Review">Under Review</option>
            <option value="Assigned">Assigned</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
            <option value="Reopened">Reopened</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
          >
            <option value="All">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
          >
            <option value="All">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer px-2">
            <input
              type="checkbox"
              checked={onlyEscalated}
              onChange={(e) => setOnlyEscalated(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Escalated Only</span>
          </label>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-sm text-slate-500">Loading complaints...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Complaint</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Assigned Staff</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {filteredComplaints.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td
                        onClick={() => onSelectComplaint(c.id)}
                        className="py-3 px-4 font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 cursor-pointer whitespace-nowrap"
                      >
                        {c.complaint_code}
                      </td>
                      <td onClick={() => onSelectComplaint(c.id)} className="py-3 px-4 cursor-pointer">
                        <div className="font-semibold text-slate-900 dark:text-white line-clamp-1">{c.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {c.category_name} · {c.location}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        <div>{c.student_name}</div>
                        <div className="font-mono text-slate-400">{c.student_roll}</div>
                      </td>
                      <td className="py-3 px-4">
                        <PriorityIndicator priority={c.priority} escalated={Boolean(c.is_escalated)} />
                      </td>
                      <td className="py-3 px-4">
                        <StatusIndicator status={c.status} />
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {c.staff_name || 'Unassigned'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setAssignModalTicket(c);
                            setAssignPriority(c.priority);
                            setAssignStaffId(c.assigned_staff_id ? String(c.assigned_staff_id) : '');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded mr-2 cursor-pointer"
                        >
                          Assign
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectComplaint(c.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredComplaints.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                        No complaints match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // SECTION: ASSIGN STAFF QUEUE
  if (section === 'assign') {
    const queue = complaints.filter((c) => !c.assigned_staff_id || c.status === 'Reopened' || c.status === 'Under Review');
    return (
      <div className="space-y-6">
        {assignModal}
        <div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">
            Dispatch & Staff Assignment Queue
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Assign unassigned or reopened complaints while balancing technician workload.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
              Unassigned & Reopened Queue ({queue.length})
            </h2>
            {queue.length === 0 ? (
              <p className="text-sm text-slate-500 py-6">All incoming complaints have been assigned to staff.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {queue.map((c) => (
                  <div key={c.id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                    <div onClick={() => onSelectComplaint(c.id)} className="cursor-pointer">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                          {c.complaint_code}
                        </span>
                        <span>·</span>
                        <span>{c.category_name}</span>
                        <span>·</span>
                        <span>{formatDateShort(c.created_at)}</span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{c.title}</div>
                      <div className="mt-1 flex items-center gap-3">
                        <PriorityIndicator priority={c.priority} escalated={Boolean(c.is_escalated)} />
                        <StatusIndicator status={c.status} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAssignModalTicket(c);
                        setAssignPriority(c.priority);
                        setAssignStaffId(c.assigned_staff_id ? String(c.assigned_staff_id) : '');
                      }}
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer shrink-0"
                    >
                      Assign Staff
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
              Live Staff Workload
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {staffList.map((sf) => (
                <div key={sf.staff_id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{sf.full_name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {sf.department} · {sf.availability_status}
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <div className="font-bold text-blue-700 dark:text-blue-400">{sf.active_tasks} active</div>
                    <div className="text-slate-400">{sf.completed_tasks} done</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SECTION: MANAGE STUDENTS
  if (section === 'students') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">Manage Students</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Registered campus student accounts and complaint submission counts.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Roll No.</th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Hostel / Residence</th>
                  <th className="py-3 px-4 text-right">Complaints</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {students.map((st) => (
                  <tr key={st.id}>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
                      {st.roll_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{st.full_name}</div>
                      <div className="text-xs text-slate-500">{st.email}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {st.department} (Yr {st.academic_year})
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">{st.hostel_block}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold">{st.complaint_count}</td>
                    <td className="py-3 px-4 text-xs font-semibold">
                      <span className={st.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}>
                        {st.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleUser(st.id)}
                        className="px-3 py-1 text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {st.is_active ? 'Suspend' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // SECTION: MANAGE STAFF
  if (section === 'staff') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">Manage Service Staff</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Onboard campus engineers, monitor active tasks, and control account status.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddStaff(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>Add Staff Member</span>
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Department & Specialization</th>
                  <th className="py-3 px-4">Availability</th>
                  <th className="py-3 px-4 text-right">Active</th>
                  <th className="py-3 px-4 text-right">Completed</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {staffList.map((sf) => (
                  <tr key={sf.id}>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                      {sf.employee_code}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{sf.full_name}</div>
                      <div className="text-xs text-slate-500">{sf.email}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                      <div className="font-semibold">{sf.department}</div>
                      <div className="text-slate-400">{sf.specialization}</div>
                    </td>
                    <td className="py-3 px-4 text-xs">{sf.availability_status}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-amber-600">{sf.active_tasks}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600">
                      {sf.completed_tasks}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleUser(sf.id)}
                        className="px-3 py-1 text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {sf.is_active ? 'Suspend' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showAddStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-950 dark:text-white font-display">
                  Register Campus Staff Member
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddStaff(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleCreateStaff} className="mt-4 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Full Name"
                    value={newStaff.full_name}
                    onChange={(e) => setNewStaff((p) => ({ ...p, full_name: e.target.value }))}
                    className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Employee Code (e.g. STF-105)"
                    value={newStaff.employee_code}
                    onChange={(e) => setNewStaff((p) => ({ ...p, employee_code: e.target.value }))}
                    className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="email"
                    required
                    placeholder="Staff Email"
                    value={newStaff.email}
                    onChange={(e) => setNewStaff((p) => ({ ...p, email: e.target.value }))}
                    className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Password (min 6 chars)"
                    value={newStaff.password}
                    onChange={(e) => setNewStaff((p) => ({ ...p, password: e.target.value }))}
                    className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Department"
                    value={newStaff.department}
                    onChange={(e) => setNewStaff((p) => ({ ...p, department: e.target.value }))}
                    className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Specialization"
                    value={newStaff.specialization}
                    onChange={(e) => setNewStaff((p) => ({ ...p, specialization: e.target.value }))}
                    className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddStaff(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                  >
                    Create Staff Account
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // SECTION: ANALYTICS & REPORTS
  if (section === 'analytics') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">
              Analytics & Service Quality Reports
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Real-time Chart.js metrics queried directly from campus database tables.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Export Full CSV Report</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
              Complaints by Status
            </h2>
            {analytics && (
              <ChartCanvas
                type="bar"
                darkMode={darkMode}
                height={260}
                labels={analytics.byStatus.map((b) => b.status)}
                datasets={[
                  {
                    label: 'Tickets',
                    data: analytics.byStatus.map((b) => b.count),
                    backgroundColor: '#4f46e5',
                    borderRadius: 4,
                  },
                ]}
              />
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
              Complaints by Priority
            </h2>
            {analytics && (
              <ChartCanvas
                type="pie"
                darkMode={darkMode}
                height={260}
                labels={analytics.byPriority.map((p) => p.priority)}
                datasets={[
                  {
                    label: 'Priority Count',
                    data: analytics.byPriority.map((p) => p.count),
                    backgroundColor: ['#64748b', '#2563eb', '#d97706', '#e11d48'],
                  },
                ]}
              />
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
            Staff Performance Leaderboard
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3">Staff Member</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3 text-right">Assigned</th>
                  <th className="py-2.5 px-3 text-right">Resolved</th>
                  <th className="py-2.5 px-3 text-right">Avg Resolution</th>
                  <th className="py-2.5 px-3 text-right">Avg Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {(analytics?.staffPerformance ?? []).map((sp) => (
                  <tr key={sp.id}>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{sp.name}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-500 dark:text-slate-400">{sp.department}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{sp.total_assigned}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">
                      {sp.resolved_count}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {sp.avg_hours !== null ? `${sp.avg_hours}h` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {sp.avg_rating !== null ? `${sp.avg_rating} / 5` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // SECTION: CATEGORIES, ANNOUNCEMENTS, FEEDBACK, LOGS
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">
            Categories, Announcements & Audit Logs
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Configure SLA thresholds, publish campus bulletins, and review student feedback & activity logs.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          {(
            [
              ['categories', 'Categories'],
              ['announcements', 'Announcements'],
              ['feedback', 'Feedback'],
              ['logs', 'Activity Logs'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setGovTab(id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                govTab === id
                  ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {govTab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
              Add Complaint Category
            </h2>
            <form onSubmit={handleAddCategory} className="space-y-3.5">
              <input
                type="text"
                required
                placeholder="Category Name"
                value={newCat.name}
                onChange={(e) => setNewCat((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                placeholder="Description"
                value={newCat.description}
                onChange={(e) => setNewCat((p) => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  SLA Target (Hours)
                </label>
                <input
                  type="number"
                  min={4}
                  max={168}
                  value={newCat.sla_hours}
                  onChange={(e) => setNewCat((p) => ({ ...p, sla_hours: e.target.value }))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Category</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
              Active Categories ({categories.filter((c) => c.is_active).length})
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {categories
                .filter((c) => c.is_active)
                .map((cat) => (
                  <div key={cat.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {cat.name}{' '}
                        <span className="font-mono text-xs font-normal text-blue-700 dark:text-blue-400">
                          · SLA {cat.sla_hours}h
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{cat.description}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                      aria-label={`Archive ${cat.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {govTab === 'announcements' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
              Publish Campus Announcement
            </h2>
            <form onSubmit={handlePublishAnnouncement} className="space-y-3.5">
              <input
                type="text"
                required
                minLength={4}
                placeholder="Announcement Title"
                value={newAnn.title}
                onChange={(e) => setNewAnn((p) => ({ ...p, title: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <textarea
                rows={4}
                required
                minLength={10}
                placeholder="Bulletin details..."
                value={newAnn.content}
                onChange={(e) => setNewAnn((p) => ({ ...p, content: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <div className="flex items-center justify-between gap-3">
                <select
                  value={newAnn.audience}
                  onChange={(e) => setNewAnn((p) => ({ ...p, audience: e.target.value }))}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="All">Audience: All Users</option>
                  <option value="Students">Students Only</option>
                  <option value="Staff">Staff Only</option>
                </select>
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAnn.is_pinned}
                    onChange={(e) => setNewAnn((p) => ({ ...p, is_pinned: e.target.checked }))}
                  />
                  <span>Pin Notice</span>
                </label>
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                Publish Announcement
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
              Published Announcements
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {announcements.map((a) => (
                <div key={a.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {a.audience} · {formatDateShort(a.created_at)}
                      {a.is_pinned ? ' · Pinned' : ''}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">{a.title}</div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{a.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAnnouncement(a.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {govTab === 'feedback' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
            Student Ratings & Service Feedback ({feedbackList.length})
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {feedbackList.map((fb) => (
              <div key={fb.id} className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                      {fb.complaint_code}
                    </span>
                    <span className="mx-1.5">·</span>
                    <span>{fb.student_name} ({fb.roll_number})</span>
                    <span className="mx-1.5">·</span>
                    <span>Staff: {fb.staff_name}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    {fb.complaint_title}
                  </div>
                  {fb.comments && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">“{fb.comments}”</p>
                  )}
                </div>
                <div className="font-mono text-sm font-bold text-amber-600 dark:text-amber-400 shrink-0">
                  {fb.rating} / 5 ★
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {govTab === 'logs' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
            System Activity Audit Log
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {logs.map((log) => (
              <div key={log.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-400 mr-2">
                    {log.action}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white mr-2">{log.user_name}</span>
                  <span className="text-slate-600 dark:text-slate-300">{log.details}</span>
                </div>
                <span className="font-mono text-slate-400">{formatDateTime(log.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
