const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5001`;

const getHeaders = (uid) => {
  const headers = { 'Content-Type': 'application/json' };
  if (uid) {
    headers['x-user-uid'] = uid;
  }
  return headers;
};

export const api = {
  // Auth
  login: async (phone) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ phone })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }
    return await res.json();
  },
  
  adminLogin: async (phone, password) => {
    const res = await fetch(`${API_URL}/api/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Admin login failed');
    }
    return await res.json();
  },

  updateProfile: async (uid, profileData) => {
    const res = await fetch(`${API_URL}/api/users/profile`, {
      method: 'PUT',
      headers: getHeaders(uid),
      body: JSON.stringify(profileData)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update profile');
    }
    return await res.json();
  },

  getMe: async (uid) => {
    const res = await fetch(`${API_URL}/api/users/me`, {
      headers: getHeaders(uid)
    });
    if (!res.ok) return null;
    return await res.json();
  },

  sendVerificationEmail: async (uid) => {
    const res = await fetch(`${API_URL}/api/auth/send-verification`, {
      method: 'POST',
      headers: getHeaders(uid)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to send verification email');
    }
    return await res.json();
  },

  verifyEmail: async (uid, otp) => {
    const res = await fetch(`${API_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: getHeaders(uid),
      body: JSON.stringify({ otp })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to verify email');
    }
    return await res.json();
  },

  // Laborer Availability
  setAvailability: async (uid, date, status) => {
    const res = await fetch(`${API_URL}/api/laborers/availability`, {
      method: 'PUT',
      headers: getHeaders(uid),
      body: JSON.stringify({ date, status })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to set availability');
    }
    return await res.json();
  },

  getAvailability: async (uid) => {
    const res = await fetch(`${API_URL}/api/laborers/availability`, {
      headers: getHeaders(uid)
    });
    if (!res.ok) return { status: 'AVAILABLE' };
    return await res.json();
  },

  // Registered Laborers Directory
  getLaborers: async (search = '', filter = 'all') => {
    let url = `${API_URL}/api/laborers`;
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (filter === 'available') params.append('availability', 'Available');
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  },

  getLaborerByUid: async (uid) => {
    const res = await fetch(`${API_URL}/api/laborers/${uid}`);
    if (!res.ok) throw new Error('Laborer not found');
    return await res.json();
  },

  // Jobs & Feed
  createWorkAlert: async (uid, jobData) => {
    const res = await fetch(`${API_URL}/api/jobs`, {
      method: 'POST',
      headers: getHeaders(uid),
      body: JSON.stringify(jobData)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create work alert');
    }
    return await res.json();
  },

  getTomorrowJobs: async (uid) => {
    const res = await fetch(`${API_URL}/api/jobs/tomorrow`, {
      headers: getHeaders(uid)
    });
    if (!res.ok) return [];
    return await res.json();
  },

  acceptJob: async (uid, jobId) => {
    const res = await fetch(`${API_URL}/api/jobs/${jobId}/accept`, {
      method: 'POST',
      headers: getHeaders(uid)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to accept job');
    }
    return await res.json();
  },

  rejectJob: async (uid, jobId) => {
    const res = await fetch(`${API_URL}/api/jobs/${jobId}/reject`, {
      method: 'POST',
      headers: getHeaders(uid)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to reject job');
    }
    return await res.json();
  },

  getHirerJobs: async (uid) => {
    const res = await fetch(`${API_URL}/api/hirer/me/jobs`, {
      headers: getHeaders(uid)
    });
    if (!res.ok) return [];
    return await res.json();
  },

  // Direct Bookings
  sendBookingRequest: async (uid, bookingData) => {
    const res = await fetch(`${API_URL}/api/bookings`, {
      method: 'POST',
      headers: getHeaders(uid),
      body: JSON.stringify(bookingData)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to send booking request');
    }
    return await res.json();
  },

  getReceivedBookings: async (uid) => {
    const res = await fetch(`${API_URL}/api/bookings/received`, {
      headers: getHeaders(uid)
    });
    if (!res.ok) return [];
    return await res.json();
  },

  getMyBookings: async (uid) => {
    const res = await fetch(`${API_URL}/api/bookings/my-bookings`, {
      headers: getHeaders(uid)
    });
    if (!res.ok) return [];
    return await res.json();
  },

  acceptBooking: async (uid, bookingId) => {
    const res = await fetch(`${API_URL}/api/bookings/${bookingId}/accept`, {
      method: 'POST',
      headers: getHeaders(uid)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to accept booking');
    }
    return await res.json();
  },

  rejectBooking: async (uid, bookingId) => {
    const res = await fetch(`${API_URL}/api/bookings/${bookingId}/reject`, {
      method: 'POST',
      headers: getHeaders(uid)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to reject booking');
    }
    return await res.json();
  },

  // Notifications
  getNotifications: async (uid) => {
    const res = await fetch(`${API_URL}/api/notifications`, {
      headers: getHeaders(uid)
    });
    if (!res.ok) return [];
    return await res.json();
  },

  markNotificationRead: async (uid, notificationId) => {
    const res = await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers: getHeaders(uid)
    });
    if (!res.ok) return { success: false };
    return await res.json();
  },

  markAllNotificationsRead: async (uid) => {
    const res = await fetch(`${API_URL}/api/notifications/read-all`, {
      method: 'PUT',
      headers: getHeaders(uid)
    });
    if (!res.ok) return { success: false };
    return await res.json();
  },

  // ==========================
  // Admin & Owner Panel APIs
  // ==========================
  admin: {
    setupOwner: async (uid, secret) => {
      const res = await fetch(`${API_URL}/api/admin/setup-owner`, {
        method: 'POST',
        headers: getHeaders(uid),
        body: JSON.stringify({ secret })
      });
      if (!res.ok) throw new Error('Setup failed');
      return await res.json();
    },

    getDashboard: async (uid) => {
      const res = await fetch(`${API_URL}/api/admin/dashboard`, {
        headers: getHeaders(uid)
      });
      if (!res.ok) throw new Error('Not authorized');
      return await res.json();
    },

    getActiveUsers: async (uid) => {
      const res = await fetch(`${API_URL}/api/admin/active-users`, { headers: getHeaders(uid) });
      if (!res.ok) throw new Error('Failed to fetch active users');
      return await res.json();
    },

    getLoginActivity: async (uid) => {
      const res = await fetch(`${API_URL}/api/admin/login-activity`, { headers: getHeaders(uid) });
      if (!res.ok) throw new Error('Failed to fetch login activity');
      return await res.json();
    },

    getUsers: async (uid, role = '') => {
      const url = role ? `${API_URL}/api/admin/users?role=${role}` : `${API_URL}/api/admin/users`;
      const res = await fetch(url, { headers: getHeaders(uid) });
      if (!res.ok) throw new Error('Failed to fetch users');
      return await res.json();
    },

    updateUserStatus: async (uid, userId, status) => {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: getHeaders(uid),
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to update status');
      return await res.json();
    },

    deleteUser: async (uid, targetUid) => {
      const res = await fetch(`${API_URL}/api/admin/users/${targetUid}`, {
        method: 'DELETE',
        headers: getHeaders(uid)
      });
      if (!res.ok) throw new Error('Failed to delete user');
      return await res.json();
    },

    deleteJob: async (uid, jobId) => {
      const res = await fetch(`${API_URL}/api/admin/jobs/${jobId}`, {
        method: 'DELETE',
        headers: getHeaders(uid)
      });
      if (!res.ok) throw new Error('Failed to delete job');
      return await res.json();
    },

    deleteBooking: async (uid, bookingId) => {
      const res = await fetch(`${API_URL}/api/admin/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: getHeaders(uid)
      });
      if (!res.ok) throw new Error('Failed to delete booking');
      return await res.json();
    },

    getJobs: async (uid) => {
      const res = await fetch(`${API_URL}/api/admin/jobs`, { headers: getHeaders(uid) });
      if (!res.ok) throw new Error('Failed to fetch jobs');
      return await res.json();
    },

    getBookings: async (uid) => {
      const res = await fetch(`${API_URL}/api/admin/bookings`, { headers: getHeaders(uid) });
      if (!res.ok) throw new Error('Failed to fetch bookings');
      return await res.json();
    },

    getReports: async (uid) => {
      const res = await fetch(`${API_URL}/api/admin/reports`, { headers: getHeaders(uid) });
      if (!res.ok) throw new Error('Failed to fetch reports');
      return await res.json();
    },

    resolveReport: async (uid, reportId) => {
      const res = await fetch(`${API_URL}/api/admin/reports/${reportId}/resolve`, {
        method: 'PATCH',
        headers: getHeaders(uid)
      });
      if (!res.ok) throw new Error('Failed to resolve report');
      return await res.json();
    },

    getAuditLogs: async (uid) => {
      const res = await fetch(`${API_URL}/api/admin/audit-logs`, { headers: getHeaders(uid) });
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      return await res.json();
    },
    updateJob: async (uid, jobId, jobData) => {
      const res = await fetch(`${API_URL}/api/admin/jobs/${jobId}`, {
        method: 'PATCH',
        headers: getHeaders(uid),
        body: JSON.stringify(jobData)
      });
      if (!res.ok) throw new Error('Failed to update job');
      return await res.json();
    },
    getSettings: async (uid) => {
      const res = await fetch(`${API_URL}/api/admin/settings`, { headers: getHeaders(uid) });
      if (!res.ok) throw new Error('Failed to fetch settings');
      return await res.json();
    },
    updateSettings: async (uid, updates) => {
      const res = await fetch(`${API_URL}/api/admin/settings`, {
        method: 'PATCH',
        headers: getHeaders(uid),
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed to update settings');
      return await res.json();
    },
    getCMS: async (uid) => {
      const res = await fetch(`${API_URL}/api/admin/cms`, { headers: getHeaders(uid) });
      if (!res.ok) throw new Error('Failed to fetch CMS content');
      return await res.json();
    },
    createCMS: async (uid, contentData) => {
      const res = await fetch(`${API_URL}/api/admin/cms`, {
        method: 'POST',
        headers: getHeaders(uid),
        body: JSON.stringify(contentData)
      });
      if (!res.ok) throw new Error('Failed to create CMS content');
      return await res.json();
    },
    updateCMS: async (uid, id, contentData) => {
      const res = await fetch(`${API_URL}/api/admin/cms/${id}`, {
        method: 'PATCH',
        headers: getHeaders(uid),
        body: JSON.stringify(contentData)
      });
      if (!res.ok) throw new Error('Failed to update CMS content');
      return await res.json();
    },
    deleteCMS: async (uid, id) => {
      const res = await fetch(`${API_URL}/api/admin/cms/${id}`, {
        method: 'DELETE',
        headers: getHeaders(uid)
      });
      if (!res.ok) throw new Error('Failed to delete CMS content');
      return await res.json();
    },
    searchUsers: async (uid, query) => {
      const res = await fetch(`${API_URL}/api/admin/users/search?q=${encodeURIComponent(query)}`, {
        headers: getHeaders(uid)
      });
      if (!res.ok) return [];
      return await res.json();
    },
    sendNotification: async (uid, notificationData) => {
      const res = await fetch(`${API_URL}/api/admin/notifications`, {
        method: 'POST',
        headers: getHeaders(uid),
        body: JSON.stringify(notificationData)
      });
      if (!res.ok) throw new Error('Failed to send notification');
      return await res.json();
    }
  }
};
