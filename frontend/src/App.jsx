import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import AnalyzePage from './components/AnalyzePage.jsx';
import FinancialsPage from './components/FinancialsPage.jsx';
import ComparePage from './components/ComparePage.jsx';
import WatchlistPage from './components/WatchlistPage.jsx';
import AboutPage from './components/AboutPage.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import LoginPage from './components/LoginPage.jsx';
import { useAuth } from './auth/AuthContext.jsx';

export default function App() {
  const { status } = useAuth();
  const location = useLocation();

  // While we figure out whether a login is required, render nothing to avoid a
  // flash of either the app or the login screen.
  if (status === 'checking') return <div className="auth-screen" />;
  if (status === 'locked') return <LoginPage />;

  return (
    <div className="app">
      <Header />
      {/* key={pathname} forces a remount on route change so .route-fade replays
          its mount animation — gives navigation a deliberate, "live" feel instead
          of an abrupt cut. Search-param-only changes (e.g. ?q=) don't remount. */}
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<div className="route-fade"><AnalyzePage /></div>} />
        <Route path="/financials/:ticker" element={<div className="route-fade"><FinancialsPage /></div>} />
        <Route path="/compare" element={<div className="route-fade"><ComparePage /></div>} />
        <Route path="/watchlist" element={<div className="route-fade"><WatchlistPage /></div>} />
        <Route path="/about" element={<div className="route-fade"><AboutPage /></div>} />
        <Route path="/settings" element={<div className="route-fade"><SettingsPage /></div>} />
      </Routes>
      <Footer />
    </div>
  );
}
