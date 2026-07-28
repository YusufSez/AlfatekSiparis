import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { SocketProvider } from './lib/socket';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './lib/toast';
import { ConfirmProvider } from './lib/confirm';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';
import './index.css';
import './_mobile.css';
import './_polish.css';
import { preloadOrderNotificationSound } from './lib/orderSound';

/** Preload order sound only for office/kitchen roles after auth (not login/admin). */
function OrderSoundPreload() {
  const { user } = useAuth();
  useEffect(() => {
    if (user?.role === 'office_user' || user?.role === 'kitchen') {
      preloadOrderNotificationSound();
    }
  }, [user?.role]);
  return null;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <BrowserRouter>
              <AuthProvider>
                <SocketProvider>
                  <OrderSoundPreload />
                  <App />
                </SocketProvider>
              </AuthProvider>
            </BrowserRouter>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
