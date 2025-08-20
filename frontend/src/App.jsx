import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import api from './services/api';

// Import Layout Components
import Sidebar from './components/Sidebar';
import StatusIndicator from './components/StatusIndicator';

// Import Page Components
import BroadcasterPage from './pages/BroadcasterPage';
import AiForwardingPage from './pages/AiForwardingPage';
import GroupSettingsPage from './pages/GroupSettingsPage';
import LoginPage from './pages/LoginPage';
// import RegisterPage from './pages/RegisterPage'; // You would create this for registration

// --- STYLED COMPONENTS (No Changes) ---

const AppLayout = styled.div`
    display: flex;
    height: 100vh;
    background-color: ${({ theme }) => theme.background};
`;

const ContentArea = styled.main`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow-y: hidden;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background-color: #ffffff;
  flex-shrink: 0;
`;

const PageTitle = styled.h2`
    color: ${({ theme }) => theme.primary};
    text-transform: capitalize;
    margin: 0;
`;

const PageContent = styled.div`
    padding: 2rem;
    overflow-y: auto;
    flex-grow: 1;
`;

const QRContainer = styled.div`
  padding: 2rem;
  text-align: center;
  border: 1px dashed ${({ theme }) => theme.border};
  border-radius: 8px;
  background: #fff;
  margin: 2rem;
  h2 { margin-bottom: 1rem; }
  img { max-width: 300px; width: 100%; }
`;

function App() {
    const { isAuthenticated, loading, logout } = useAuth();
    const [status, setStatus] = useState('disconnected');
    const [qrCode, setQrCode] = useState(null);
    const [allGroups, setAllGroups] = useState([]);
    
    const location = useLocation();
    const pageName = location.pathname.replace('/', '').replace(/-/g, ' ') || 'broadcaster';

    const fetchAllGroupsForConfig = useCallback(async () => {
        if (!isAuthenticated) return; // Don't fetch if not logged in
        try {
            const groupsRes = await api.get('/groups');
            setAllGroups(groupsRes.data || []);
        } catch (error) {
            console.error("Error fetching groups for config:", error);
        }
    }, [isAuthenticated]);

    const checkStatus = useCallback(async () => {
        if (!isAuthenticated) return; // Don't check status if not logged in
        try {
            const { data } = await api.get('/status');
            setStatus(data.status);
            if (data.status === 'qr') {
                // The QR code now comes directly from the status endpoint
                // to avoid race conditions. We need to update the backend for this.
                setQrCode(data.qr || null);
            } else {
                setQrCode(null);
                if (data.status === 'connected' && allGroups.length === 0) {
                    fetchAllGroupsForConfig();
                }
            }
        } catch (error) {
            console.error("Error checking status:", error);
        }
    }, [isAuthenticated, allGroups.length, fetchAllGroupsForConfig]);

    useEffect(() => {
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }, [checkStatus]);

    useEffect(() => {
        if (isAuthenticated) {
            checkStatus(); // Run initial check immediately on login
        }
    }, [isAuthenticated, checkStatus]);
    
    const handleLogout = async () => {
        try {
            await api.post('/logout');
        } catch (error) {
            console.error('Error informing backend of logout:', error);
        } finally {
            logout(); // This clears frontend state and token
        }
    };

    if (loading) {
        return <div>Loading Application...</div>;
    }

    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* <Route path="/register" element={<RegisterPage />} /> */}
            
            <Route 
                path="/*"
                element={
                    isAuthenticated ? (
                        <AppLayout>
                            <Sidebar />
                            <ContentArea>
                                <Header>
                                    <PageTitle>{pageName}</PageTitle>
                                    <StatusIndicator status={status} onLogout={handleLogout} />
                                </Header>
                                <PageContent>
                                    {status !== 'connected' ? (
                                        <QRContainer>
                                            <h2>Scan to Connect WhatsApp</h2>
                                            {qrCode && <img src={qrCode} alt="QR Code" />}
                                        </QRContainer>
                                    ) : (
                                        <Routes>
                                            <Route path="/broadcaster" element={<BroadcasterPage allGroups={allGroups} />} />
                                            <Route path="/ai-forwarding" element={<AiForwardingPage allGroups={allGroups} />} />
                                            <Route path="/group-settings" element={<GroupSettingsPage />} />
                                            <Route path="*" element={<Navigate to="/broadcaster" replace />} />
                                        </Routes>
                                    )}
                                </PageContent>
                            </ContentArea>
                        </AppLayout>
                    ) : (
                        <Navigate to="/login" replace />
                    )
                } 
            />
        </Routes>
    );
}

export default App;