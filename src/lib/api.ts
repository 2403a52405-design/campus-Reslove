let csrfTokenMemory: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfTokenMemory = token;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const method = (options.method || 'GET').toUpperCase();

  if (!(options.body instanceof FormData) && !headers.has('Content-Type') && method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  if (method !== 'GET' && csrfTokenMemory) {
    headers.set('X-CSRF-Token', csrfTokenMemory);
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const errBody = (await response.json()) as { error?: string };
      throw new Error(errBody.error || `Request failed with status ${response.status}`);
    }
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

export function formatDateTime(isoOrSql: string | null | undefined): string {
  if (!isoOrSql) return '—';
  const normalized = isoOrSql.includes('T') ? isoOrSql : isoOrSql.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return isoOrSql;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateShort(isoOrSql: string | null | undefined): string {
  if (!isoOrSql) return '—';
  const normalized = isoOrSql.includes('T') ? isoOrSql : isoOrSql.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return isoOrSql;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
