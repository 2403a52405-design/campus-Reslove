import { Plus, Search, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PriorityIndicator, StatusIndicator } from '../components/StatusVisuals.tsx';
import { apiRequest, formatDateShort } from '../lib/api.ts';
import type { Announcement, Category, Complaint, ComplaintPriority, UserProfile } from '../types.ts';

interface StudentPortalProps {
  section: 'dashboard' | 'submit' | 'complaints';
  user: UserProfile;
  onNavigate: (section: string) => void;
  onSelectComplaint: (id: number) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

const CAMPUS_LOCATIONS = [
  'Academic Block A',
  'Academic Block B',
  'Centre for Engineering & Technology',
  'Central Library',
  'Hostel Block A',
  'Hostel Block B',
  'Hostel Block C',
  'Mechanical Workshop',
  'Student Union Cafeteria',
  'South Gate Shuttle Bay',
];

export function StudentPortal({
  section,
  user,
  onNavigate,
  onSelectComplaint,
  onToast,
}: StudentPortalProps) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, in_progress: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Submit form state
  const [form, setForm] = useState({
    category_id: '',
    title: '',
    building: 'Academic Block A',
    roomDetail: '',
    priority: 'Medium' as ComplaintPriority,
    description: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cList, cats, statsRes, annRes] = await Promise.all([
        apiRequest<Complaint[]>('/complaints'),
        apiRequest<Category[]>('/categories'),
        apiRequest<{ summary: { total: number; pending: number; in_progress: number; resolved: number } }>(
          '/analytics'
        ),
        apiRequest<Announcement[]>('/announcements'),
      ]);
      setComplaints(cList);
      setCategories(cats.filter((c) => c.is_active));
      setSummary(statsRes.summary);
      setAnnouncements(annRes);
      if (cats.length > 0 && !form.category_id) {
        setForm((p) => ({ ...p, category_id: String(cats[0].id) }));
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load student data.', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast, form.category_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleFileChange(file: File | null) {
    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      onToast('Only JPG, PNG, or WEBP images are allowed.', 'err');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onToast('Image file must be under 5 MB.', 'err');
      return;
    }
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }

  async function handleSubmitComplaint(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const locationStr = form.roomDetail.trim()
        ? `${form.building} · ${form.roomDetail.trim()}`
        : form.building;
      const fd = new FormData();
      fd.append('category_id', form.category_id);
      fd.append('title', form.title);
      fd.append('location', locationStr);
      fd.append('priority', form.priority);
      fd.append('description', form.description);
      if (imageFile) {
        fd.append('image', imageFile);
      }

      const created = await apiRequest<{ id: number; complaint_code: string }>('/complaints', {
        method: 'POST',
        body: fd,
      });
      onToast(`Complaint ${created.complaint_code} submitted successfully.`);
      setForm((p) => ({ ...p, title: '', roomDetail: '', description: '' }));
      setImageFile(null);
      setImagePreview(null);
      await loadData();
      onSelectComplaint(created.id);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not submit complaint.', 'err');
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = complaints.filter((c) => {
    if (statusFilter !== 'All' && c.status !== statusFilter) return false;
    if (categoryFilter !== 'All' && String(c.category_id) !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.complaint_code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (section === 'submit') {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">
            Submit a Campus Complaint
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Provide accurate building location and optional photo evidence for faster dispatch.
          </p>
        </div>

        <form
          onSubmit={handleSubmitComplaint}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Complaint Category
              </label>
              <select
                required
                value={form.category_id}
                onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} (SLA {cat.sla_hours}h)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Priority Level
              </label>
              <select
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as ComplaintPriority }))}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                <option value="Low">Low — Cosmetic / Non-urgent</option>
                <option value="Medium">Medium — Standard disruption</option>
                <option value="High">High — Affects classes or labs</option>
                <option value="Critical">Critical — Safety / Essential utility outage</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Complaint Title
            </label>
            <input
              type="text"
              required
              minLength={4}
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Overhead projector flickering in Lecture Hall 204"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Campus Building / Zone
              </label>
              <select
                value={form.building}
                onChange={(e) => setForm((p) => ({ ...p, building: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                {CAMPUS_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Floor / Room / Wing Details
              </label>
              <input
                type="text"
                value={form.roomDetail}
                onChange={(e) => setForm((p) => ({ ...p, roomDetail: e.target.value }))}
                placeholder="e.g. Floor 2 · Room 204"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Detailed Description
            </label>
            <textarea
              rows={4}
              required
              minLength={10}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Explain what happened, since when, and any safety hazards..."
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Upload Photo Evidence (Optional · JPG, PNG, WEBP up to 5 MB)
            </label>
            {imagePreview ? (
              <div className="relative w-full sm:w-72 h-44 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleFileChange(null)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-950/75 text-white hover:bg-slate-950 cursor-pointer"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500 transition-colors">
                <Upload className="h-5 w-5 text-slate-400 mb-2" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Click to attach an issue photo
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Validated JPG, PNG, or WEBP up to 5 MB
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Submitting Ticket...' : 'Submit Complaint'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('complaints')}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (section === 'complaints') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">My Complaints</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Track live status updates, assigned technicians, and submit feedback.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('submit')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>New Complaint</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, title, or building..."
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
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-sm text-slate-500">Loading your complaints...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No complaints match the current filters.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('submit')}
                className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
              >
                Submit Your First Complaint
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Issue & Location</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Assigned Staff</th>
                    <th className="py-3 px-4 text-right">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => onSelectComplaint(c.id)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                        {c.complaint_code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white line-clamp-1">{c.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{c.location}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {c.category_name}
                      </td>
                      <td className="py-3 px-4">
                        <PriorityIndicator priority={c.priority} escalated={Boolean(c.is_escalated)} />
                      </td>
                      <td className="py-3 px-4">
                        <StatusIndicator status={c.status} />
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {c.staff_name || 'Pending assignment'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDateShort(c.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default: Student Dashboard Overview
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">
            Welcome, {user.full_name}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            <span className="font-mono">{user.roll_number}</span> · {user.department} · {user.hostel_block}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('submit')}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>Submit Complaint</span>
        </button>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Submitted</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-slate-950 dark:text-white">
            {summary.total}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending Review</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
            {summary.pending}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">In Progress</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {summary.in_progress}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Resolved & Closed</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {summary.resolved}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-950 dark:text-white font-display">
              Recent Complaints & Live Tracking
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('complaints')}
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>
          {complaints.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No complaints submitted yet. Click Submit Complaint to report an issue.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {complaints.slice(0, 5).map((c) => (
                <div
                  key={c.id}
                  onClick={() => onSelectComplaint(c.id)}
                  className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/30 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                        {c.complaint_code}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{c.category_name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.location}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{c.title}</div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <PriorityIndicator priority={c.priority} escalated={Boolean(c.is_escalated)} />
                    <StatusIndicator status={c.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
            Campus Announcements
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {announcements.slice(0, 4).map((ann) => (
              <div key={ann.id} className="py-3 first:pt-0 last:pb-0">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  {formatDateShort(ann.created_at)}
                  {ann.is_pinned ? ' · Pinned' : ''}
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{ann.title}</div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{ann.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
