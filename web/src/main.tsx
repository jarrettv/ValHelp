import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Layout from './Layout.tsx'
import Home from './Home.tsx'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './contexts/AuthContext';
import Auth from './Auth.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Profile from './Profile.tsx'
import TrophyEvent from './Event.tsx'
import EventEdit from './EventEdit.tsx'
import Events from './Events.tsx'

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
            <Route index path="/auth/login" element={<Auth />} />
            <Route index path="/auth/profile" element={<Profile />} />
            <Route index path="/events" element={<Events />} />
            <Route index path="/events/:id" element={<TrophyEvent />} />
            <Route index path="/events/host" element={<EventEdit />} />
            <Route index path="/events/:id/edit" element={<EventEdit />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
