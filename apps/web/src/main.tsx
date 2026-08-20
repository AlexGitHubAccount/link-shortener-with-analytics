import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { queryClient } from './lib/query-client';
import { Dashboard } from './routes/Dashboard';
import { NotFound } from './routes/NotFound';
import { Login } from './routes/Login';
import { LinkDetail } from './routes/LinkDetail';
import './index.css';

const router = createBrowserRouter([
  { path: '/', element: <Dashboard /> },
  { path: '/login', element: <Login /> }, // Stage 4 placeholder
  { path: '/links/:id', element: <LinkDetail /> }, // Stage 5 placeholder
  { path: '*', element: <NotFound /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
