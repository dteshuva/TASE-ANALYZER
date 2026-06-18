import { Routes, Route } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import AnalyzePage from './components/AnalyzePage.jsx';
import ComparePage from './components/ComparePage.jsx';
import WatchlistPage from './components/WatchlistPage.jsx';
import AboutPage from './components/AboutPage.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import LoginPage from './components/LoginPage.jsx';
import { useAuth } from './auth/AuthContext.jsx';

export default function App() {
  const { status } = useAuth();

  // While we figure out whether a login is required, render nothing to avoid a
  // flash of either the app or the login screen.
  if (status === 'checking') return <div className="auth-screen" />;
  if (status === 'locked') return <LoginPage />;

  return (
    <div className="app">
      <Header />
      <Routes>
        <Route path="/" element={<AnalyzePage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      <Footer />
    </div>
  );
}
