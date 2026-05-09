import { useEffect, useState } from 'react';
import api from './services/api';
import useStore from './hooks/useStore';
import { useSocket } from './hooks/useSocket';
import LoginPage from './components/auth/LoginPage';
import Sidebar from './components/chat/Sidebar';
import ChatWindow from './components/chat/ChatWindow';

function App() {
  const { user, setUser, isAuthenticated, clearUser } = useStore();
  const [loading, setLoading] = useState(true);

  // Wire up unauthorized handler
  useEffect(() => {
    api.onUnauthorized = () => {
      api.clearTokens();
      clearUser();
    };
  }, [clearUser]);

  // Try to restore session on mount
  useEffect(() => {
    async function restoreSession() {
      if (!api.accessToken) {
        setLoading(false);
        return;
      }

      try {
        const data = await api.getMe();
        setUser(data.user);
      } catch {
        api.clearTokens();
      } finally {
        setLoading(false);
      }
    }
    restoreSession();
  }, [setUser]);

  // Connect socket when authenticated
  useSocket(isAuthenticated ? api.accessToken : null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-bg-elevated border-t-accent animate-spin mx-auto mb-4" />
          <p className="text-text-secondary text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="h-screen flex bg-bg-base overflow-hidden">
      <Sidebar />
      <ChatWindow />
    </div>
  );
}

export default App;
