const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

export async function get(path, options = {}) {
  return request(path, {
    ...options,
    method: "GET",
  });
}

export async function post(path, body, options = {}) {
  return request(path, {
    ...options,
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await parseJsonSafe(response);
  const message =
    payload?.message ||
    payload?.error ||
    `Request failed (HTTP ${response.status})`;

  if (!response.ok) {
    throw new Error(message);
  }

  if (isApiEnvelope(payload)) {
    return payload.data;
  }

  return payload;
}

function isApiEnvelope(payload) {
  return Boolean(payload && typeof payload === "object" && "code" in payload && "data" in payload);
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
