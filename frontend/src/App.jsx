import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Routes, Route, useLocation } from 'react-router-dom';
import api from './services/api';

// Import Layout Components
import Sidebar from './components/Sidebar';
import StatusIndicator from './components/StatusIndicator';

// Import Page Components
import BroadcasterPage from './pages/BroadcasterPage';
import AiForwardingPage from './pages/AiForwardingPage';
import GroupSettingsPage from './pages/GroupSettingsPage';

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
    const [status, setStatus] = useState('disconnected');
    const [qrCode, setQrCode] = useState(null);
    const [allGroups, setAllGroups] = useState([]);
    
    const location = useLocation();
    const pageName = location.pathname.replace('/', '').replace(/-/g, ' ') || 'broadcaster';

    const fetchAllGroupsForConfig = useCallback(async () => {
        try {
            const groupsRes = await api.get('/groups');
            setAllGroups(groupsRes.data || []);
        } catch (error) {
            console.error("Error fetching groups for config:", error);
        }
    }, []);

    const checkStatus = useCallback(async () => {
        try {
            const { data } = await api.get('/status');
            if (data.status !== status) {
                setStatus(data.status);
                if (data.status === 'qr') {
                    const qrRes = await api.get('/qr');
                    setQrCode(qrRes.data.qr);
                } else {
                    setQrCode(null);
                    if (data.status === 'connected' && allGroups.length === 0) {
                        fetchAllGroupsForConfig();
                    }
                }
            }
        } catch (error) {
            console.error("Error checking status:", error);
            setStatus('disconnected');
        }
    }, [status, allGroups.length, fetchAllGroupsForConfig]);

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }, [checkStatus]);
    
    const handleLogout = async () => {
        try {
            await api.post('/logout');
            setAllGroups([]);
            // checkStatus will run on the next interval and handle the UI update
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    return (
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
                            <Route path="/" element={<BroadcasterPage allGroups={allGroups} />} />
                        </Routes>
                    )}
                </PageContent>
            </ContentArea>
        </AppLayout>
    );
}

export default App;