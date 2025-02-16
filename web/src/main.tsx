/// <reference types="react/canary" />

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Layout from './Layout.tsx'
import Home from './Home.tsx'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './contexts/AuthContext';
import Auth from './Auth.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Profile from './Profile.tsx'
import Event from './Event.tsx'
import EventEdit from './EventEdit.tsx'
import Events from './Events.tsx'
import Users from './Users.tsx'

// Create a client
const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index path="/" element={<Home />} />
            <Route path="/auth/login" element={<Auth />} />
            <Route path="/auth/users" element={<Users />} />
            <Route path="/auth/profile" element={<Profile />} />
            <Route path="/events/all" element={<Events />} />
            <Route path="/events/:id" element={<Event />} />
            <Route path="/events/:id/edit" element={<EventEdit />} />
            <Route path="/trophy/tracker" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
