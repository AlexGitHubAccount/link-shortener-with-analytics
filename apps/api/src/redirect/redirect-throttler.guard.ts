import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// The public GET /:code redirect is served by the backend DIRECTLY, not through the nginx
// /api/ proxy (see apps/web/nginx.conf.template - it only proxies /api/). main.ts sets
// `trust proxy: 1` for the proxied endpoints, which makes Express derive req.ip from the
// client-supplied X-Forwarded-For header. On this un-proxied, internet-facing route an
// attacker could rotate that header to get a fresh throttle bucket per request and bypass
// the rate limit entirely. Key the bucket on the real TCP socket address, which the client
// cannot spoof.
@Injectable()
export class RedirectThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: {
    ip?: string;
    socket?: { remoteAddress?: string };
  }): Promise<string> {
    return Promise.resolve(req.socket?.remoteAddress ?? req.ip ?? 'unknown');
  }
}
