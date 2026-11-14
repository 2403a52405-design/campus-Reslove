import { CheckCircle2, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ChartCanvas } from '../components/ChartCanvas.tsx';
import { PriorityIndicator, StatusIndicator } from '../components/StatusVisuals.tsx';
import { apiRequest, formatDateShort } from '../lib/api.ts';
import type { Announcement, Complaint, UserProfile } from '../types.ts';

interface StaffAnalytics {
  summary: {
    total_assigned: number;
    new_assignments: number;
    in_progress: number;
    completed: number;
    avg_hours: number | null;
  };
  byStatus: Array<{ status: string; count: number }>;
  byCategory: Array<{ name: string; count: number }>;
}

interface StaffPortalProps {
  section: 'dashboard' | 'assigned';
  user: UserProfile;
  darkMode: boolean;
  onSelectComplaint: (id: number) => void;
  onNavigate: (section: string) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function StaffPortal({
  section,
  user,
  darkMode,
  onSelectComplaint,
  onNavigate,
  onToast,
}: StaffPortalProps) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [analytics, setAnalytics] = useState<StaffAnalytics | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'completed'>('all');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [compRes, anaRes, annRes] = await Promise.all([
        apiRequest<Complaint[]>('/complaints'),
        apiRequest<StaffAnalytics>('/analytics'),
        apiRequest<Announcement[]>('/announcements'),
      ]);
      setComplaints(compRes);
      setAnalytics(anaRes);
      setAnnouncements(annRes);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load staff tasks.', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function quickAccept(complaintId: number) {
    try {
      const fd = new FormData();
      fd.append('status', 'In Progress');
      fd.append('comment', `${user.full_name} accepted assignment and started inspection.`);
      await apiRequest(`/complaints/${complaintId}/status`, {
        method: 'PATCH',
        body: fd,
      });
      onToast('Ticket moved to In Progress.');
      await loadData();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update status.', 'err');
    }
  }

  const filtered = complaints.filter((c) => {
    if (filterTab === 'active' && ['Resolved', 'Closed'].includes(c.status)) return false;
    if (filterTab === 'completed' && !['Resolved', 'Closed'].includes(c.status)) return false;
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

  if (section === 'assigned') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">
              Assigned Work Queue
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Accept assignments, update repair progress, and upload resolution proof photos.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
            {(
              [
                ['all', 'All Assigned'],
                ['active', 'Active'],
                ['completed', 'Completed'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilterTab(k)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  filterTab === k
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assigned tickets by ID, title, or building..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-sm text-slate-500">Loading assigned tickets...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No assigned tickets in this view.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Issue & Location</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td
                        onClick={() => onSelectComplaint(c.id)}
                        className="py-3 px-4 font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 cursor-pointer whitespace-nowrap"
                      >
                        {c.complaint_code}
                      </td>
                      <td onClick={() => onSelectComplaint(c.id)} className="py-3 px-4 cursor-pointer">
                        <div className="font-semibold text-slate-900 dark:text-white">{c.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {c.category_name} · {c.location}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {c.student_name}
                      </td>
                      <td className="py-3 px-4">
                        <PriorityIndicator priority={c.priority} escalated={Boolean(c.is_escalated)} />
                      </td>
                      <td className="py-3 px-4">
                        <StatusIndicator status={c.status} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {(c.status === 'Assigned' || c.status === 'Reopened') && (
                          <button
                            type="button"
                            onClick={() => quickAccept(c.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded mr-2 cursor-pointer"
                          >
                            Start Work
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectComplaint(c.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Update
                        </button>
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

  const s = analytics?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">
            Staff Operations — {user.full_name}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            <span className="font-mono">{user.employee_code}</span> · {user.department} · {user.specialization}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('assigned')}
          className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
        >
          Open Work Queue
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Assigned</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums">{s?.total_assigned ?? 0}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">New Assignments</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
            {s?.new_assignments ?? 0}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">In Progress</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {s?.in_progress ?? 0}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Completed Tasks</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {s?.completed ?? 0}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Avg Resolution</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
            {s?.avg_hours !== null && s?.avg_hours !== undefined ? `${s.avg_hours}h` : '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
            Task Completion Breakdown
          </h2>
          {analytics && analytics.byStatus.length > 0 ? (
            <ChartCanvas
              type="doughnut"
              darkMode={darkMode}
              height={240}
              labels={analytics.byStatus.map((b) => b.status)}
              datasets={[
                {
                  label: 'Tasks',
                  data: analytics.byStatus.map((b) => b.count),
                  backgroundColor: ['#2563eb', '#d97706', '#16a34a', '#64748b', '#e11d48'],
                },
              ]}
            />
          ) : (
            <div className="h-[240px] flex items-center justify-center text-sm text-slate-500">
              No assigned tasks recorded yet.
            </div>
          )}
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
            Active Queue & Staff Bulletins
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {complaints
              .filter((c) => !['Resolved', 'Closed'].includes(c.status))
              .slice(0, 4)
              .map((c) => (
                <div
                  key={c.id}
                  onClick={() => onSelectComplaint(c.id)}
                  className="py-3 first:pt-0 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/30 px-2 -mx-2 rounded"
                >
                  <div>
                    <div className="text-xs font-mono text-blue-700 dark:text-blue-400">
                      {c.complaint_code} · {c.location}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{c.title}</div>
                  </div>
                  <StatusIndicator status={c.status} />
                </div>
              ))}
            {complaints.filter((c) => !['Resolved', 'Closed'].includes(c.status)).length === 0 && (
              <div className="py-4 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>All your assigned tickets are currently resolved.</span>
              </div>
            )}
          </div>
          {announcements.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Latest Staff Notice · {formatDateShort(announcements[0].created_at)}
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{announcements[0].title}</div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{announcements[0].content}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
