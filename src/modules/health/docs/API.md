# Health API Reference

This document outlines the endpoints available in the **Health Module**. These endpoints are entirely public and primarily utilized for system readiness and liveness checks (e.g., via Kubernetes or Docker load-balancers). For global API standards such as Response Formats, please refer to the [Root API Guide](../../../../docs/API.md).

> **Public Access:** These endpoints require absolutely no authentication (`@Public()`).
>
> **Diagnostic envelope.** Like every other route, health responses pass through
> the global `ResponseInterceptor` and ship with the standard `request`,
> `timing`, `server` envelope alongside `data`. For probes that only check
> liveness (k8s `livenessProbe`, ALB target-group health), simply ignore those
> fields. For oncall debugging, `request.requestId` lets you correlate a probe
> with the exact request in the access log.

---

## 1. System Liveness Check (Ping)

A lightweight liveness check. It always returns `200` to indicate if the Node process is running. No external dependencies or databases are verified.

**Endpoint:** `GET /health/ping`

### Response (200 OK)
> Plus the standard `request` / `timing` / `server` / `timestamp` / `path` envelope.
```json
{
  "success": true,
  "statusCode": 200,
  "message": "pong",
  "data": {
    "status": "ok",
    "timestamp": "2026-05-10T22:41:03.182Z",
    "uptime": 3600.5,
    "version": "1.0.0"
  }
}
```

---

## 2. Composite Health Check

A comprehensive health check that probes connected resources. Returns `200` only if all configured indicators pass; `503 Service Unavailable` if any individual component fails.

**Indicators Evaluated:**
- **database:** Confirms valid Prisma/PostgreSQL connectivity.
- **memory_heap:** Asserts V8 heap memory remains below 150 MB.
- **memory_rss:** Asserts total Resident Set Size is below 300 MB.

**Endpoint:** `GET /health`

### Response Format (From `@nestjs/terminus`)

The Terminus result is wrapped inside `data` by the global `ResponseInterceptor`,
so the shape on the wire matches the rest of the API. The `request` / `timing` /
`server` envelope is omitted from the examples below for brevity but is always
present.

**Success Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation successful",
  "data": {
    "status": "ok",
    "info": {
      "database": { "status": "up" },
      "memory_heap": { "status": "up" },
      "memory_rss": { "status": "up" }
    },
    "error": {},
    "details": {
      "database": { "status": "up" },
      "memory_heap": { "status": "up" },
      "memory_rss": { "status": "up" }
    }
  }
}
```

**Failure Response (503 Service Unavailable):**

When Terminus returns a non-2xx status, NestJS throws and the response is shaped
by `AllExceptionsFilter` — so it follows the standard error envelope (with
`success: false`, `error.*`, plus the same `request` / `timing` / `server`
envelope). The Terminus payload is preserved under `error.details`.

```json
{
  "success": false,
  "statusCode": 503,
  "error": {
    "name": "ServiceUnavailableError",
    "code": "ERR_HTTP_503",
    "message": "Service Unavailable Exception",
    "details": "{\"status\":\"error\",\"info\":{...},\"error\":{\"database\":{\"status\":\"down\",\"message\":\"Connection timeout\"}},\"details\":{...}}"
  }
}
```
