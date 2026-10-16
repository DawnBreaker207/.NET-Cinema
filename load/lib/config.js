// Shared config for all k6 scenarios.
// Override with env: k6 run -e BASE_URL=https://cinema.dawn.io.vn load/reads.js
export const BASE_URL = __ENV.BASE_URL || 'http://192.168.184.138:8082';
export const API = `${BASE_URL}/api/v1`;
export const VUS = parseInt(__ENV.VUS || '50', 10);
// Users to pre-register in setup() (pool shared round-robin by VUs).
// Keep SMALL (20): the shared auth limiter (10 burst) makes big pools take
// forever; users are interchangeable. Race uses its own RACE_VUS pool.
export const USERS = parseInt(__ENV.USERS || '20', 10);
export const HOLD_SEATS = parseInt(__ENV.HOLD_SEATS || '2', 10);
// Password for throwaway k6 users (matches RegisterRequest min length 6).
export const PASSWORD = 'Test123!';
// Demo accounts from migrations/seed/010003 (no registration needed).
export const DEMO_CUSTOMER = { email: 'customer@cinema.local', password: 'customer123' };
export const DEMO_ADMIN = { email: 'admin@cinema.local', password: 'admin123' };
// Unique throwaway email per run: k6 users are deleted by cleanup.sql afterwards.
export const testEmail = (tag, i) => `k6-${tag}-${Date.now()}-${i}@test.local`;
