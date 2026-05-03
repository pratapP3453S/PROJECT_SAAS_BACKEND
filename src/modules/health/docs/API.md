# Health API Reference

This document outlines the endpoints available in the **Health Module**. These endpoints are entirely public and primarily utilized for system readiness and liveness checks (e.g., via Kubernetes or Docker load-balancers). For global API standards such as Response Formats, please refer to the [Root API Guide](../../../../docs/API.md).

> **Public Access:** These endpoints require absolutely no authentication (`@Public()`).

---

## 1. System Liveness Check (Ping)

A lightweight liveness check. It always returns `200` to indicate if the Node process is running. No external dependencies or databases are verified.

**Endpoint:** `GET /health/ping`

### Response (200 OK)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "pong",
  "data": {
    "status": "ok",
    "timestamp": "2024-01-01T00:00:00.000Z",
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

**Success Response (200 OK):**
```json
{
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
```

**Failure Response (503 Service Unavailable):**
```json
{
  "status": "error",
  "info": {
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" }
  },
  "error": {
    "database": { "status": "down", "message": "Connection timeout" }
  },
  "details": {
    "database": { "status": "down", "message": "Connection timeout" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" }
  }
}
```
