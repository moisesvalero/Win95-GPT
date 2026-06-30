interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
	const now = Date.now();
	const entry = store.get(ip);

	if (!entry || now > entry.resetAt) {
		store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
		return { allowed: true, remaining: MAX_REQUESTS - 1, resetIn: WINDOW_MS };
	}

	entry.count++;
	const remaining = MAX_REQUESTS - entry.count;
	const resetIn = entry.resetAt - now;

	if (entry.count > MAX_REQUESTS) {
		return { allowed: false, remaining: 0, resetIn };
	}

	return { allowed: true, remaining, resetIn };
}
