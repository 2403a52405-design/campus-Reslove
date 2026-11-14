import {
  BarChart3,
  Bell,
  ClipboardList,
  FolderKanban,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PlusCircle,
  Settings,
  Sun,
  UserCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest, setCsrfToken } from './lib/api.ts';
import { AdminPortal } from './pages/AdminPortal.tsx';
import { AuthPages } from './pages/AuthPages.tsx';
import { ComplaintDetailView } from './pages/ComplaintDetailView.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { HelpAndAboutView, NotificationsView, ProfileView } from './pages/SharedWorkspacePages.tsx';
import { StaffPortal } from './pages/StaffPortal.tsx';
import { StudentPortal } from './pages/StudentPortal.tsx';
import type { NotificationItem, UserProfile } from './types.ts';

type PublicRoute = 'landing' | 'login' | 'register';

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('campus_theme') === 'dark';
    } catch {
      return false;
    }
  });

  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [publicRoute, setPublicRoute] = useState<PublicRoute>('landing');
  const [workspaceSection, setWorkspaceSection] = useState<string>('dashboard');
  const [selectedComplaintId, setSelectedComplaintId] = useState<number | null>(null);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('campus_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 4000);
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiRequest<{ notifications: NotificationItem[]; unreadCount: number }>(
        '/notifications'
      );
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    apiRequest<{ user: UserProfile | null; csrfToken: string | null }>('/auth/me')
      .then((res) => {
        setUser(res.user);
        setCsrfToken(res.csrfToken);
        if (res.user) {
          loadNotifications();
        }
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setAuthChecked(true));
  }, [loadNotifications]);

  async function handleLogout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setCsrfToken(null);
    setUser(null);
    setSelectedComplaintId(null);
    setWorkspaceSection('dashboard');
    setPublicRoute('landing');
    showToast('Signed out securely.');
  }

  function handleNavigatePublicOrPortal(route: string) {
    if (route === 'landing' || route === 'login' || route === 'register') {
      setPublicRoute(route);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (user) {
      setSelectedComplaintId(null);
      setWorkspaceSection(route);
    } else {
      setPublicRoute('login');
    }
  }

  async function handleMarkNotificationRead(id: number) {
    await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' });
    loadNotifications();
  }

  async function handleMarkAllRead() {
    await apiRequest('/notifications/read-all', { method: 'PATCH' });
    loadNotifications();
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 text-sm">
        Loading CampusResolve...
      </div>
    );
  }

  // Unauthenticated or explicitly viewing Landing Page
  if (!user || publicRoute === 'landing') {
    if (user && publicRoute === 'landing') {
      return (
        <>
          <LandingPage
            user={user}
            darkMode={darkMode}
            onToggleTheme={() => setDarkMode((d) => !d)}
            onNavigate={(r) => {
              if (r === 'dashboard' || r === 'submit') {
                setPublicRoute('login'); // switches into portal since user is truthy
                setWorkspaceSection(r);
              } else {
                handleNavigatePublicOrPortal(r);
              }
            }}
          />
          {toast && (
            <div
              className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg text-sm font-medium border shadow-lg ${
                toast.type === 'err'
                  ? 'bg-rose-600 text-white border-rose-700'
                  : 'bg-slate-900 text-white border-slate-800 dark:bg-white dark:text-slate-900'
              }`}
            >
              {toast.msg}
            </div>
          )}
        </>
      );
    }

    if (publicRoute === 'login' || publicRoute === 'register') {
      return (
        <AuthPages
          mode={publicRoute}
          onAuthSuccess={(authedUser) => {
            setUser(authedUser);
            setPublicRoute('login');
            setWorkspaceSection('dashboard');
            setSelectedComplaintId(null);
            loadNotifications();
            showToast(`Welcome back, ${authedUser.full_name}`);
          }}
          onNavigate={handleNavigatePublicOrPortal}
        />
      );
    }

    return (
      <LandingPage
        user={null}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onNavigate={handleNavigatePublicOrPortal}
      />
    );
  }

  // Authenticated SaaS Sidebar Navigation Items per Role
  const navItems =
    user.role === 'student'
      ? [
          { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
          { id: 'submit', label: 'Submit Complaint', Icon: PlusCircle },
          { id: 'complaints', label: 'My Complaints', Icon: ClipboardList },
          { id: 'notifications', label: 'Notifications', Icon: Bell, badge: unreadCount },
          { id: 'profile', label: 'Profile', Icon: Settings },
          { id: 'help', label: 'Help & SLA', Icon: HelpCircle },
        ]
      : user.role === 'staff'
      ? [
          { id: 'dashboard', label: 'Staff Dashboard', Icon: LayoutDashboard },
          { id: 'assigned', label: 'Assigned Tasks', Icon: Wrench },
          { id: 'notifications', label: 'Notifications', Icon: Bell, badge: unreadCount },
          { id: 'profile', label: 'Profile', Icon: Settings },
          { id: 'help', label: 'Help & SLA', Icon: HelpCircle },
        ]
      : [
          { id: 'dashboard', label: 'Admin Dashboard', Icon: LayoutDashboard },
          { id: 'complaints', label: 'Manage Complaints', Icon: ClipboardList },
          { id: 'assign', label: 'Assign Staff', Icon: UserCheck },
          { id: 'students', label: 'Manage Students', Icon: Users },
          { id: 'staff', label: 'Manage Staff', Icon: Wrench },
          { id: 'analytics', label: 'Analytics & CSV', Icon: BarChart3 },
          { id: 'governance', label: 'Categories & Notices', Icon: FolderKanban },
          { id: 'notifications', label: 'Notifications', Icon: Bell, badge: unreadCount },
          { id: 'profile', label: 'Profile', Icon: Settings },
        ];

  const activeNavLabel =
    selectedComplaintId !== null
      ? 'Complaint Details'
      : navItems.find((n) => n.id === workspaceSection)?.label ?? 'Dashboard';

  function selectSection(id: string) {
    setSelectedComplaintId(null);
    setWorkspaceSection(id);
    setMobileMenuOpen(false);
    if (id === 'notifications') {
      loadNotifications();
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setPublicRoute('landing')}
            className="text-lg font-bold tracking-tight text-slate-950 dark:text-white font-display cursor-pointer whitespace-nowrap"
          >
            CampusResolve
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ id, label, Icon, badge }) => {
            const active = selectedComplaintId === null && workspaceSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectSection(id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </span>
                {badge && badge > 0 ? (
                  <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="px-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{user.full_name}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">{user.role} Portal</div>
          </div>
          <button
            type="button"
            onClick={() => setPublicRoute('landing')}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Public Home Page</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full flex flex-col border-r border-slate-200 dark:border-slate-800 z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="text-lg font-bold font-display">CampusResolve</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-500 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map(({ id, label, Icon, badge }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectSection(id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg cursor-pointer ${
                    workspaceSection === id && selectedComplaintId === null
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </span>
                  {badge && badge > 0 ? <span className="font-mono text-xs">{badge}</span> : null}
                </button>
              ))}
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Workspace Top Bar */}
        <header className="sticky top-0 z-20 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
              <span className="capitalize">{user.role}</span>
              <span className="mx-2">/</span>
              <span className="font-semibold text-slate-900 dark:text-white">{activeNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => selectSection('notifications')}
              aria-label="Open notifications"
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded bg-blue-700 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label="Toggle Light/Dark theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-600" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {selectedComplaintId !== null ? (
            <ComplaintDetailView
              complaintId={selectedComplaintId}
              user={user}
              onBack={() => setSelectedComplaintId(null)}
              onToast={showToast}
            />
          ) : workspaceSection === 'notifications' ? (
            <NotificationsView
              notifications={notifications}
              onMarkRead={handleMarkNotificationRead}
              onMarkAllRead={handleMarkAllRead}
              onOpenComplaint={(cid) => setSelectedComplaintId(cid)}
            />
          ) : workspaceSection === 'profile' ? (
            <ProfileView user={user} onUpdated={setUser} onToast={showToast} />
          ) : workspaceSection === 'help' ? (
            <HelpAndAboutView user={user} onToast={showToast} />
          ) : user.role === 'student' ? (
            <StudentPortal
              section={
                workspaceSection === 'submit' || workspaceSection === 'complaints'
                  ? workspaceSection
                  : 'dashboard'
              }
              user={user}
              onNavigate={selectSection}
              onSelectComplaint={(cid) => setSelectedComplaintId(cid)}
              onToast={showToast}
            />
          ) : user.role === 'staff' ? (
            <StaffPortal
              section={workspaceSection === 'assigned' ? 'assigned' : 'dashboard'}
              user={user}
              darkMode={darkMode}
              onSelectComplaint={(cid) => setSelectedComplaintId(cid)}
              onNavigate={selectSection}
              onToast={showToast}
            />
          ) : (
            <AdminPortal
              section={
                ['complaints', 'assign', 'students', 'staff', 'analytics', 'governance'].includes(
                  workspaceSection
                )
                  ? (workspaceSection as
                      | 'complaints'
                      | 'assign'
                      | 'students'
                      | 'staff'
                      | 'analytics'
                      | 'governance')
                  : 'dashboard'
              }
              darkMode={darkMode}
              onSelectComplaint={(cid) => setSelectedComplaintId(cid)}
              onNavigate={selectSection}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg text-sm font-medium border shadow-lg ${
            toast.type === 'err'
              ? 'bg-rose-600 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-800 dark:bg-white dark:text-slate-900'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
