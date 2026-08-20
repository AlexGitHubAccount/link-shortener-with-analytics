import { useQuery } from '@tanstack/react-query';
import type { HealthStatus } from '@link-shortener/shared-types';
import './App.css';

function App() {
  // Fetch /health endpoint to verify FE↔BE connection
  const { data: health, isLoading, isError, dataUpdatedAt } = useQuery<HealthStatus>({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5s
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-8">
      <header className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">
          Link Shortener with Analytics
        </h1>
        <p className="text-lg text-slate-600">
          Educational project for learning Claude Code
        </p>
      </header>

      <main className="max-w-2xl mx-auto mt-12">
        {/* Health Check Status */}
        <section className="bg-white rounded-lg shadow-md p-6 mb-8 border-l-4 border-blue-500">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            🔍 API Status
          </h2>

          {isLoading && (
            <div className="flex items-center gap-2 text-slate-700">
              <span className="animate-spin inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></span>
              Checking backend connection...
            </div>
          )}

          {isError && (
            <div className="bg-red-50 border border-red-200 rounded p-4">
              <p className="text-red-700 font-semibold mb-1">❌ Backend unreachable</p>
              <p className="text-red-600 text-sm">
                Make sure the backend is running on <code className="bg-red-100 px-2 py-1 rounded">http://localhost:4000</code>
              </p>
            </div>
          )}

          {health && !isError && (
            <div className="bg-green-50 border border-green-200 rounded p-4">
              <p className="text-green-700 font-semibold mb-2">✅ Backend connected!</p>
              <p className="text-green-600 text-sm">
                Status: <span className="font-mono bg-green-100 px-2 py-1 rounded">{health.status}</span>
              </p>
              <p className="text-green-600 text-sm">
                Database: <span className="font-mono bg-green-100 px-2 py-1 rounded">{health.info?.database?.status ?? 'unknown'}</span>
              </p>
              <p className="text-green-600 text-sm">
                Last checked: <span className="font-mono bg-green-100 px-2 py-1 rounded text-xs">{new Date(dataUpdatedAt).toLocaleString()}</span>
              </p>
            </div>
          )}
        </section>

        {/* Stage 1 Info */}
        <section className="bg-white rounded-lg shadow-md p-6 border-l-4 border-amber-500">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            📋 Stage 1: Initialization (Current)
          </h2>
          <ul className="space-y-2 text-slate-700">
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold mt-0.5">✓</span>
              <span>Monorepo scaffold (pnpm + Turborepo)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold mt-0.5">✓</span>
              <span>Backend (NestJS + Prisma + PostgreSQL)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold mt-0.5">✓</span>
              <span>Frontend (Vite + React + TypeScript)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold mt-0.5">✓</span>
              <span>FE↔BE connection verified</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-600 font-bold mt-0.5">→</span>
              <span>Next: Stage 2 - Backend CRUD for Links</span>
            </li>
          </ul>
        </section>

        {/* Quick Links */}
        <section className="mt-8 text-center text-slate-600 text-sm">
          <p className="mb-4">📖 See <code className="bg-slate-100 px-2 py-1 rounded">docs/plan.md</code> for the full roadmap</p>
          <p>🚀 Running on <code className="bg-slate-100 px-2 py-1 rounded">http://localhost:5173</code></p>
        </section>
      </main>
    </div>
  );
}

export default App;
