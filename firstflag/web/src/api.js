const KEY = "firstflag.session";

export const session = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* private mode */ } },
};

async function call(path, { method = "GET", body, headers = {} } = {}) {
  const s = session.get();
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(s?.token ? { authorization: `Bearer ${s.token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { session.clear(); throw new Error("Your session expired. Reload to start again."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  start: (name) => call("/api/session", { method: "POST", body: { name } }),
  me: () => call("/api/me"),
  missions: () => call("/api/missions"),
  submit: (missionId, flag) => call("/api/submit", { method: "POST", body: { missionId, flag } }),
  tutor: (payload) => call("/api/tutor", { method: "POST", body: payload }),
  proof: () => call("/api/proof"),
  instructor: (key) => call("/api/instructor", { headers: { "x-instructor-key": key } }),
};
