export function success(data, message = "ok", code = 0) {
  return {
    code,
    message,
    data,
  };
}

export function failure(message = "Request failed", code = 500, data = null) {
  return {
    code,
    message,
    data,
  };
}
