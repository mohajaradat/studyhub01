/* ============================================================
   StudyHub API Client
   ============================================================ */

const API_BASE = 'http://localhost:5000/api';

/* ============================================================
   Token Management
   ============================================================ */
let accessToken = localStorage.getItem('accessToken') || null;
let refreshToken = localStorage.getItem('refreshToken') || null;
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

export const auth = {
  setTokens(access, refresh) {
    accessToken = access;
    refreshToken = refresh;
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
  },
  setUser(user) {
    currentUser = user;
    localStorage.setItem('currentUser', JSON.stringify(user));
  },
  getUser() { return currentUser; },
  getToken() { return accessToken; },
  isLoggedIn() { return !!accessToken; },
  logout() {
    accessToken = null;
    refreshToken = null;
    currentUser = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUser');
  },
};

/* ============================================================
   Core Fetch Wrapper
   ============================================================ */
async function apiCall(endpoint, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  // إذا ليس FormData، أضف Content-Type
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // إضافة التوكن إذا موجود
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // تحويل الكائن إلى JSON
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // إذا التوكن منتهي → سجّل خروج
  if (response.status === 401) {
    auth.logout();
    throw new Error('انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.');
  }

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.message || 'خطأ في الطلب');
    error.details = data.details;
    error.status = response.status;
    throw error;
  }

  return data.data !== undefined ? data.data : data;
}

/* ============================================================
   API Endpoints
   ============================================================ */

/* ---------- Auth ---------- */
export const authApi = {
  signup: (payload) => apiCall('/auth/signup', { method: 'POST', body: payload }),
  login: (email, password) => apiCall('/auth/login', { method: 'POST', body: { email, password } }),
  google: (idToken) => apiCall('/auth/google', { method: 'POST', body: { idToken } }),
  forgotPassword: (email) => apiCall('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token, newPassword) =>
    apiCall('/auth/reset-password', { method: 'POST', body: { token, newPassword } }),
};

/* ---------- User ---------- */
export const userApi = {
  getMyProfile: () => apiCall('/user/me'),
  updateProfile: (data, file) => {
    const form = new FormData();
    if (data.firstName) form.append('firstName', data.firstName);
    if (data.lastName) form.append('lastName', data.lastName);
    if (data.bio) form.append('bio', data.bio);
    if (file) form.append('profilePic', file);
    return apiCall('/user/profile', { method: 'PUT', body: form });
  },
  saveAcademicInfo: (data) => apiCall('/user/academic-info', { method: 'POST', body: data }),
  searchUsers: (q) => apiCall(`/user/search?q=${encodeURIComponent(q || '')}`),
  getPublicProfile: (id) => apiCall(`/user/${id}/public`),
};

/* ---------- Dashboard ---------- */
export const dashboardApi = {
  get: () => apiCall('/dashboard'),
};

/* ---------- Courses ---------- */
export const courseApi = {
  enroll: (courses) => apiCall('/courses/enroll', { method: 'POST', body: { courses } }),
  getMyCourses: (status) =>
    apiCall(`/courses/my-courses${status ? `?status=${status}` : ''}`),
  getDetails: (id) => apiCall(`/courses/${id}`),
  getParticipants: (id) => apiCall(`/courses/${id}/participants`),
};

/* ---------- Assignments ---------- */
export const assignmentApi = {
  getMyAssignments: (filter) =>
    apiCall(`/assignments/my-assignments${filter && filter !== 'all' ? `?filter=${filter}` : ''}`),
  getPending: () => apiCall('/assignments/pending'),
  submit: (assignmentId, { submissionText, file }) => {
    const form = new FormData();
    if (submissionText) form.append('submissionText', submissionText);
    if (file) form.append('file', file);
    return apiCall(`/assignments/${assignmentId}/submit`, { method: 'POST', body: form });
  },
};

/* ---------- Projects ---------- */
export const projectApi = {
  getMyProjects: (status) =>
    apiCall(`/projects/my-projects${status ? `?status=${status}` : ''}`),
  search: (q, limit = 20) =>
    apiCall(`/projects/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  create: (data, file) => {
    const form = new FormData();
    form.append('title', data.title);
    form.append('description', data.description);
    form.append('isPrivate', data.isPrivate ? 'true' : 'false');
    form.append('showInfo', data.showInfo !== false ? 'true' : 'false');
    if (file) form.append('file', file);
    return apiCall('/projects', { method: 'POST', body: form });
  },
  analyze: (title, description) =>
    apiCall('/projects/analyze-and-recommend', { method: 'POST', body: { title, description } }),
};

/* ---------- Friends ---------- */
export const friendApi = {
  list: () => apiCall('/friends'),
  getRequests: () => apiCall('/friends/requests'),
  sendRequest: (userId) => apiCall(`/friends/request/${userId}`, { method: 'POST' }),
  respond: (friendshipId, action) =>
    apiCall(`/friends/respond/${friendshipId}`, { method: 'POST', body: { action } }),
  interact: (userId) => apiCall(`/friends/interact/${userId}`, { method: 'POST' }),
};

/* ---------- Notifications ---------- */
export const notificationApi = {
  list: (unreadOnly = false) =>
    apiCall(`/notifications${unreadOnly ? '?unread=true' : ''}`),
  markAllRead: () => apiCall('/notifications/mark-all-read', { method: 'PUT' }),
};

/* ---------- Analytics ---------- */
export const analyticsApi = {
  get: () => apiCall('/analytics'),
};

/* ---------- Settings ---------- */
export const settingApi = {
  get: () => apiCall('/settings'),
  update: (data) => apiCall('/settings', { method: 'PUT', body: data }),
  listIntegrations: () => apiCall('/settings/integrations'),
  toggleIntegration: (appName, isConnected) =>
    apiCall('/settings/integrations/toggle', {
      method: 'POST',
      body: { appName, isConnected },
    }),
};