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
import Obs from './Obs.tsx'
import Event from './Event.tsx'
import EventEdit from './EventEdit.tsx'
import Events from './Events.tsx'
import PrivateEvents from './PrivateEvents.tsx'
import Users from './Users.tsx'
import PlayerComponent from './Player.tsx'
import EventScore from './EventScore.tsx'
import EventScoreboard from './EventScoreboard.tsx'
import EventOverview from './EventOverview.tsx'
import EventTimelineView from './EventTimelineView.tsx'
import PlayerLeaderboard from './PlayerLeaderboard';
import EventRedirect from './EventRedirect.tsx'
import EventTrophies from './EventTrophies.tsx'
import TrophyCalc from './TrophyCalc.tsx'
import HelpGuides from './HelpGuides.tsx'
import GuideArticle from './GuideArticle.tsx'

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
            <Route path="/auth/obs" element={<Obs />} />
            <Route path="/auth/profile" element={<Profile />} />
            <Route path="/events/hunt" element={<EventRedirect mode="TrophyHunt" />} />
            <Route path="/events/rush" element={<EventRedirect mode="TrophyRush" />} />
            <Route path="/events/saga" element={<EventRedirect mode="TrophySaga" />} />
            <Route path="/events/blitz" element={<EventRedirect mode="TrophyBlitz" />} />
            <Route path="/events/all" element={<Events />} />
            <Route path="/events/private" element={<PrivateEvents />} />
            <Route path="/events/private/:password" element={<Event />} />
            <Route path="/events/:id" element={<Event />} />
            <Route path="/events/:id/edit" element={<EventEdit />} />
            <Route path="/events/:id/timeline" element={<EventTimelineView />} />
            <Route path="/players/:userId" element={<PlayerComponent />} />        
            <Route path="/trophy/tracker" element={<Navigate to="/" replace />} />
            <Route path="/trophy/calc" element={<TrophyCalc />} />
            <Route path="/leaderboard" element={<PlayerLeaderboard />} />
            <Route path="/guides" element={<HelpGuides />} />
            <Route path="/guides/:slug" element={<GuideArticle />} />
          </Route>
          <Route path="/events/:id/score/:playerId" element={<EventScore />} />
          <Route path="/events/:id/scores/:playerId" element={<EventScoreboard />} />
          <Route path="/events/:id/overview/:playerId" element={<EventOverview />} />
          <Route path="/events/:id/trophies/:playerId" element={<EventTrophies />} />
          <Route path="/obs/score/:playerId" element={<EventScore />} />
          <Route path="/obs/scores/:playerId" element={<EventScoreboard />} />
          <Route path="/obs/trophies/:playerId" element={<EventTrophies />} />
          <Route path="/obs/overview/:playerId" element={<EventOverview />} />
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
