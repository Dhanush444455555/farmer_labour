/**
 * backend/routes/agent.js
 *
 * Express proxy — forwards /api/agent/* requests to the Python
 * agent-service (FastAPI, default port 8000).
 *
 * Mounting (in index.js):
 *   const agentRouter = require('./routes/agent');
 *   app.use('/api/agent', agentRouter);
 *
 * Routes proxied:
 *   POST /api/agent/post-job      → POST http://localhost:8000/agent/post-job
 *   POST /api/agent/find-job      → POST http://localhost:8000/agent/find-job
 *   POST /api/agent/admin-query   → POST http://localhost:8000/agent/admin-query
 *   DELETE /api/agent/session/:id → DELETE http://localhost:8000/agent/session/:id
 *   GET  /api/agent/health        → GET  http://localhost:8000/health
 *
 * Graceful fallback:
 *   If the Python service is unreachable (ECONNREFUSED / timeout),
 *   the proxy returns { fallback: true, message: "..." } with HTTP 200
 *   so the frontend can show the manual form instead of crashing.
 */

'use strict';

const express = require('express');
const router  = express.Router();

// ── Config ────────────────────────────────────────────────────────────────────
const AGENT_SERVICE_URL  = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
const PROXY_TIMEOUT_MS   = parseInt(process.env.AGENT_PROXY_TIMEOUT_MS || '15000', 10);

// Errors that indicate the Python service is down (not application errors)
const NETWORK_ERRORS = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH']);

/**
 * Detect if an error means the agent service is unreachable.
 * @param {Error} err
 * @returns {boolean}
 */
function isServiceDown(err) {
  if (err?.code && NETWORK_ERRORS.has(err.code)) return true;
  if (err?.name === 'AbortError') return true; // fetch timeout
  return false;
}

/**
 * Forward a request body + headers to the Python agent service.
 *
 * @param {string}  path        Path on the agent service (e.g. '/agent/post-job')
 * @param {string}  method      HTTP method
 * @param {object|null} body    Request body (will be JSON.stringify'd)
 * @param {string}  adminUid    Forwarded from x-user-uid header
 * @returns {Promise<{ok: boolean, status: number, data: object}>}
 */
async function callAgentService(path, method = 'POST', body = null, adminUid = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-From': 'node-backend',
        ...(adminUid ? { 'x-user-uid': adminUid } : {}),
      },
      signal: controller.signal,
    };
    if (body) opts.body = JSON.stringify(body);

    const response = await fetch(`${AGENT_SERVICE_URL}${path}`, opts);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Standard fallback response when the Python service is unreachable.
 * The frontend checks for `fallback: true` and shows the manual form.
 */
function fallbackResponse(res, context = 'agent') {
  return res.status(200).json({
    fallback: true,
    reply:    null,
    done:     false,
    data:     null,
    message:  `The AI assistant is temporarily unavailable. Please use the ${context} form instead.`,
  });
}

// ── Health check (used by frontend to detect agent availability) ───────────────

router.get('/health', async (req, res) => {
  try {
    const result = await callAgentService('/health', 'GET');
    return res.status(result.status).json(result.data);
  } catch (err) {
    if (isServiceDown(err)) {
      return res.status(503).json({ status: 'unavailable', message: 'Agent service is down.' });
    }
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── POST /api/agent/post-job ───────────────────────────────────────────────────

router.post('/post-job', async (req, res) => {
  const uid = req.headers['x-user-uid'];
  if (!uid) return res.status(401).json({ error: 'Missing x-user-uid header' });

  const payload = {
    session_id:  req.body.session_id  || `${uid}_job_posting`,
    message:     req.body.message     || '',
    language:    req.body.language    || 'en',
    uid,
    hirer_name:  req.body.hirer_name  || '',
    hirer_phone: req.body.hirer_phone || '',
  };

  if (!payload.message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const result = await callAgentService('/agent/post-job', 'POST', payload, uid);
    if (!result.ok) {
      const detail = result.data?.detail || result.data?.error || 'Agent error';
      return res.status(result.status).json({ error: detail });
    }
    return res.json(result.data);
  } catch (err) {
    if (isServiceDown(err)) return fallbackResponse(res, 'job posting');
    console.error('[agent-proxy] post-job error:', err.message);
    return res.status(500).json({ error: 'Proxy error', detail: err.message });
  }
});

// ── POST /api/agent/find-job ───────────────────────────────────────────────────

router.post('/find-job', async (req, res) => {
  const uid = req.headers['x-user-uid'];
  if (!uid) return res.status(401).json({ error: 'Missing x-user-uid header' });

  const payload = {
    session_id: req.body.session_id || `${uid}_job_search`,
    message:    req.body.message    || '',
    language:   req.body.language   || 'en',
    uid,
    gender:     req.body.gender   || 'Any',
    location:   req.body.location || '',
  };

  if (!payload.message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const result = await callAgentService('/agent/find-job', 'POST', payload, uid);
    if (!result.ok) {
      const detail = result.data?.detail || result.data?.error || 'Agent error';
      return res.status(result.status).json({ error: detail });
    }
    return res.json(result.data);
  } catch (err) {
    if (isServiceDown(err)) return fallbackResponse(res, 'job search');
    console.error('[agent-proxy] find-job error:', err.message);
    return res.status(500).json({ error: 'Proxy error', detail: err.message });
  }
});

// ── POST /api/agent/admin-query ───────────────────────────────────────────────

router.post('/admin-query', async (req, res) => {
  const uid = req.headers['x-user-uid'];
  if (!uid) return res.status(401).json({ error: 'Missing x-user-uid header' });

  const payload = {
    session_id: req.body.session_id || `${uid}_admin_query`,
    message:    req.body.message    || '',
    uid,
  };

  if (!payload.message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const result = await callAgentService('/agent/admin-query', 'POST', payload, uid);
    if (!result.ok) {
      const detail = result.data?.detail || result.data?.error || 'Agent error';
      return res.status(result.status).json({ error: detail });
    }
    return res.json(result.data);
  } catch (err) {
    if (isServiceDown(err)) return fallbackResponse(res, 'admin query');
    console.error('[agent-proxy] admin-query error:', err.message);
    return res.status(500).json({ error: 'Proxy error', detail: err.message });
  }
});

// ── DELETE /api/agent/session/:id ────────────────────────────────────────────

router.delete('/session/:sessionId', async (req, res) => {
  const uid = req.headers['x-user-uid'];
  const { sessionId } = req.params;

  try {
    const result = await callAgentService(
      `/agent/session/${encodeURIComponent(sessionId)}`,
      'DELETE',
      null,
      uid || ''
    );
    return res.status(result.ok ? 200 : result.status).json(result.data);
  } catch (err) {
    if (isServiceDown(err)) return res.json({ cleared: true, session_id: sessionId });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
