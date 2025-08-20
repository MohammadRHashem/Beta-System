import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// Import Layout Components
import Sidebar from '../components/Sidebar';
import StatusIndicator from '../components/StatusIndicator';

// Import Page Components
import BroadcasterPage from './BroadcasterPage';
import AiForwardingPage from './AiForwardingPage';
import GroupSettingsPage from './GroupSettingsPage';

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

const API_URL = 'https://beta.hashemlabs.dev';

const MainLayout = () => {
    const [status, setStatus] = useState('disconnected');
    const [qrCode, setQrCode] = useState(null);
    const [allGroups, setAllGroups] = useState([]);
    
    const location = useLocation();
    const { logout } = useAuth();
    const pageName = location.pathname.replace('/', '').replace(/-/g, ' ') || 'broadcaster';

    // Socket.io connection (now inside the protected layout)
    const socket = useRef(null);
    useEffect(() => {
        socket.current = io(API_URL, {
            path: "/socket.io/",
            transports: ['websocket', 'polling']
        });

        socket.current.on('connect', () => {
            console.log('Connected to WebSocket server with ID:', socket.current.id);
            // This is passed down to BroadcasterPage via context or props if needed
        });

        // Add other global socket listeners here if needed

        return () => {
            socket.current.disconnect();
        };
    }, []);

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
            setStatus(data.status);
            if (data.status === 'qr') {
                setQrCode(data.qr || null);
            } else {
                setQrCode(null);
                if (data.status === 'connected' && allGroups.length === 0) {
                    fetchAllGroupsForConfig();
                }
            }
        } catch (error) {
            // The API interceptor will handle 401 errors (logout)
            console.error("Error checking status:", error);
        }
    }, [allGroups.length, fetchAllGroupsForConfig]);

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }, [checkStatus]);
    
    const handleLogout = async () => {
        try {
            // Inform the backend to disconnect the specific WA session if needed
            // This endpoint might not be necessary if session is tied to JWT expiry
            await api.post('/logout'); 
        } catch (error) {
            console.error('Error informing backend of logout:', error);
        } finally {
            logout(); // This clears frontend state and token from AuthContext
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
                    {status === 'qr' ? (
                        <QRContainer>
                            <h2>Scan to Connect WhatsApp</h2>
                            {qrCode && <img src={qrCode} alt="QR Code" />}
                        </QRContainer>
                    ) : (
                        <Routes>
                            <Route 
                                path="/broadcaster" 
                                element={<BroadcasterPage allGroups={allGroups} socket={socket.current} />} 
                            />
                            <Route 
                                path="/ai-forwarding" 
                                element={<AiForwardingPage allGroups={allGroups} />} 
                            />
                            <Route 
                                path="/group-settings" 
                                element={<GroupSettingsPage />} 
                            />
                            {/* Redirect any other nested path to the broadcaster */}
                            <Route 
                                path="*" 
                                element={<Navigate to="/broadcaster" replace />} 
                            />
                        </Routes>
                    )}
                </PageContent>
            </ContentArea>
        </AppLayout>
    );
};

export default MainLayout;