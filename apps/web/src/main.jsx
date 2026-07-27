import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { SocketProvider } from './lib/socket';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './lib/toast';
import { ConfirmProvider } from './lib/confirm';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <BrowserRouter>
              <AuthProvider>
                <SocketProvider>
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
