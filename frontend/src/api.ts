import { demoApi } from './demo/demoApi';
import { realApi } from './realApi';
import type { ApiClient } from './apiClient';

export { ApiError } from './apiClient';
export { getToken, setToken, clearToken } from './session';

/** Static GitHub Pages builds set VITE_DEMO_MODE=true; local/backend builds stay on the real API. */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export const api: ApiClient = DEMO_MODE ? demoApi : realApi;
