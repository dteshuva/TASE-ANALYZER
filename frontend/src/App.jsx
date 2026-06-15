import { Routes, Route } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import AnalyzePage from './components/AnalyzePage.jsx';
import ComparePage from './components/ComparePage.jsx';
import WatchlistPage from './components/WatchlistPage.jsx';
import AboutPage from './components/AboutPage.jsx';
import SettingsPage from './components/SettingsPage.jsx';

export default function App() {
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
