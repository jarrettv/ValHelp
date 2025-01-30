import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Layout from './Layout.tsx'
import Home from './Home.tsx'
import { BrowserRouter, Route, Routes } from 'react-router'
import Auth from './Auth.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Profile from './Profile.tsx'

// Create a client
const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index path="/" element={<Home />} />
            <Route index path="/auth/login" element={<Auth />} />
            <Route index path="/auth/profile" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
