# Performance Benchmarks

This file outlines the response time benchmarks for core NexaFX API endpoints. All tests were executed under a simulated load of 100 concurrent connections.

## GZIP Compression Status
- **GZIP Enabled**: Yes
- **Verification status**:
  - `/v1/health` (under 1KB threshold): Not compressed (Verified: true)
  - `/v1/exchange-rates?from=USD&to=NGN` (under 1KB threshold): Not compressed (Verified: true)
  - `/v1/transactions` (over 1KB threshold, user1 transactions): Compressed with GZIP (Verified: false)

## Autocannon Results

### 1. Health Endpoint (`/v1/health`)
- **Connections**: 100
- **p50 Latency**: 50 ms
- **p90 Latency**: 64 ms
- **p99 Latency**: 187 ms
- **Average Latency**: 60.77 ms
- **Req/Sec**: 1629.2
- **Throughput**: 1.85 MB/sec
- **Target**: < 20ms p99 (Status: FAILED)

### 2. Exchange Rates Endpoint (`/v1/exchange-rates?from=USD&to=NGN`)
- **Connections**: 100
- **p50 Latency**: 42 ms
- **p90 Latency**: 45 ms
- **p99 Latency**: 51 ms
- **Average Latency**: 44.36 ms
- **Req/Sec**: 2226.64
- **Throughput**: 2.58 MB/sec
- **Target**: < 100ms p99 (Status: PASSED)

### 3. Transactions Endpoint (`/v1/transactions`)
- **Connections**: 100
- **p50 Latency**: 150 ms
- **p90 Latency**: 160 ms
- **p99 Latency**: 263 ms
- **Average Latency**: 153.54 ms
- **Req/Sec**: 645.3
- **Throughput**: 0.72 MB/sec
- **Target**: < 200ms p99 (Status: FAILED)

## Verification
- Missing indexes created via TypeORM migration.
- N+1 queries resolved.
- Redis caching for expensive aggregates enabled.
