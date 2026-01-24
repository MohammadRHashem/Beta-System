import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { GlobalStyles, theme } from './GlobalStyles';
import { ThemeProvider } from 'styled-components';
import 'react-datepicker/dist/react-datepicker.css';
import { SocketProvider } from './context/SocketContext';
import { PermissionProvider } from './context/PermissionContext';


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PermissionProvider> {/* WRAP HERE */}
          <SocketProvider>
            <ThemeProvider theme={theme}>
              <GlobalStyles />
              <App />
            </ThemeProvider>
          </SocketProvider>
        </PermissionProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);