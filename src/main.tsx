import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { TooltipProvider } from './components/ui/tooltip';
import App from './App';
import { Toaster } from './components/ui/sonner';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <TooltipProvider delayDuration={0}>
          <App />
        </TooltipProvider>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
