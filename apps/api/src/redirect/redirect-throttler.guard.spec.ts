import { RedirectThrottlerGuard } from './redirect-throttler.guard';

// `getTracker` is `protected` and does not touch `this`, so an instance made via
// `Object.create` (skipping ThrottlerGuard's DI constructor args) is enough to exercise it.
type GuardInternals = {
  getTracker(req: {
    ip?: string;
    socket?: { remoteAddress?: string };
  }): Promise<string>;
};

describe('RedirectThrottlerGuard', () => {
  const guard = Object.create(
    RedirectThrottlerGuard.prototype,
  ) as GuardInternals;

  it('keys the throttle bucket on the raw TCP socket address', async () => {
    await expect(
      guard.getTracker({
        ip: '9.9.9.9',
        socket: { remoteAddress: '203.0.113.7' },
      }),
    ).resolves.toBe('203.0.113.7');
  });

  it('ignores the spoofable req.ip when a socket address is present', async () => {
    // Under `trust proxy` Express derives req.ip from the client-supplied X-Forwarded-For
    // header, which an attacker can rotate per request to get a fresh bucket. The socket
    // address cannot be spoofed and must take precedence.
    await expect(
      guard.getTracker({
        ip: 'attacker-rotated-value',
        socket: { remoteAddress: '198.51.100.4' },
      }),
    ).resolves.toBe('198.51.100.4');
  });

  it('falls back to req.ip when the socket has no remote address', async () => {
    await expect(
      guard.getTracker({ ip: '192.0.2.55', socket: {} }),
    ).resolves.toBe('192.0.2.55');
    await expect(guard.getTracker({ ip: '192.0.2.56' })).resolves.toBe(
      '192.0.2.56',
    );
  });

  it('falls back to "unknown" when neither socket address nor ip is available', async () => {
    await expect(guard.getTracker({})).resolves.toBe('unknown');
    await expect(guard.getTracker({ socket: {} })).resolves.toBe('unknown');
  });
});
