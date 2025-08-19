import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { io } from 'socket.io-client';
import api, { getBatches, getTemplates, getGroupIdsForBatch } from './services/api';
import StatusIndicator from './components/StatusIndicator';
import GroupSelector from './components/GroupSelector';
import BroadcastForm from './components/BroadcastForm';
import BatchManager from './components/BatchManager';
import TemplateManager from './components/TemplateManager';
import BroadcastProgressModal from './components/BroadcastProgressModal';
import { FaWhatsapp } from 'react-icons/fa';

const AppContainer = styled.div`
  max-width: 1600px;
  width: 100%;
  margin: 1rem auto;
  padding: 1rem;
  background: #FFF;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  box-sizing: border-box;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  padding-bottom: 1.5rem;
  margin-bottom: 1.5rem;
`;

const Title = styled.h1`
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 2rem;
  color: ${({ theme }) => theme.primary};
  svg {
    color: ${({ theme }) => theme.secondary};
  }
`;

const QRContainer = styled.div`
  padding: 2rem;
  text-align: center;
  border: 1px dashed ${({ theme }) => theme.border};
  border-radius: 8px;
  h2 {
    margin-bottom: 1rem;
  }
  img {
    max-width: 300px;
    width: 100%;
  }
`;

const MainContent = styled.div`
  display: grid;
  grid-template-columns: 450px 1fr;
  gap: 1.5rem;
  align-items: flex-start;

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
`;

const LeftPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  position: sticky;
  top: 1.5rem;
`;

const RightPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const API_URL = 'https://beta.hashemlabs.dev';

function App() {
    const [status, setStatus] = useState('disconnected');
    const [qrCode, setQrCode] = useState(null);
    const [allGroups, setAllGroups] = useState([]);
    const [selectedGroups, setSelectedGroups] = useState(new Set());
    const [batches, setBatches] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [message, setMessage] = useState('');
    const [editingBatch, setEditingBatch] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);

    const socket = useRef(null);
    const [socketId, setSocketId] = useState(null);
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [broadcastLogs, setBroadcastLogs] = useState([]);
    const [broadcastSummary, setBroadcastSummary] = useState({ total: 0, successful: 0, failed: 0 });
    const [isBroadcastComplete, setIsBroadcastComplete] = useState(false);

    useEffect(() => {
        socket.current = io(API_URL, {
            // Add transports to improve WebSocket compatibility
            transports: ['websocket', 'polling']
        });

        socket.current.on('connect', () => {
            console.log('Connected to WebSocket server with ID:', socket.current.id);
            setSocketId(socket.current.id);
        });

        socket.current.on('broadcast:progress', (log) => {
            setBroadcastLogs(prevLogs => [...prevLogs, log]);
            setBroadcastSummary(prevSummary => ({
                ...prevSummary,
                successful: log.status === 'success' ? prevSummary.successful + 1 : prevSummary.successful,
                failed: log.status === 'failed' ? prevSummary.failed + 1 : prevSummary.failed,
            }));
        });

        socket.current.on('broadcast:complete', (summary) => {
            setBroadcastSummary(summary);
            setIsBroadcastComplete(true);
            setBroadcastLogs(prevLogs => [...prevLogs, { status: 'info', message: '--- Broadcast Finished ---' }]);
        });
        
        // Handle connection errors
        socket.current.on('connect_error', (err) => {
            console.error('WebSocket connection error:', err.message);
        });

        return () => {
            socket.current.disconnect();
        };
    }, []);

    const fetchInitialData = useCallback(async () => {
        try {
            const [groupsRes, batchesRes, templatesRes] = await Promise.all([
                api.get('/groups'),
                getBatches(),
                getTemplates()
            ]);
            setAllGroups(groupsRes.data || []);
            setBatches(batchesRes.data || []);
            setTemplates(templatesRes.data || []);
        } catch (error) {
            console.error("Error fetching initial data:", error);
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
                        fetchInitialData();
                    }
                }
            }
        } catch (error) {
            console.error("Error checking status:", error);
            setStatus('disconnected');
        }
    }, [status, allGroups.length, fetchInitialData]);

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 3000);
        return () => clearInterval(interval);
    }, [checkStatus]);

    const handleLogout = async () => {
        try {
            await api.post('/logout');
            setAllGroups([]);
            setSelectedGroups(new Set());
            setBatches([]);
            setTemplates([]);
            checkStatus();
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    const handleDataUpdate = async () => {
        try {
            const [batchesRes, templatesRes, groupsRes] = await Promise.all([getBatches(), getTemplates(), api.get('/groups')]);
            setBatches(batchesRes.data);
            setTemplates(templatesRes.data);
            setAllGroups(groupsRes.data);
        } catch (error) {
            console.error("Error refreshing data:", error);
        }
    };

    const loadGroupsForBatch = async (batchId) => {
        if (!batchId) {
            setSelectedGroups(new Set());
            return;
        }
        try {
            const { data: groupIds } = await getGroupIdsForBatch(batchId);
            setSelectedGroups(new Set(groupIds));
        } catch (error) {
            console.error("Error loading groups for batch:", error);
        }
    };

    const handleBatchSelect = (batchId) => {
        setEditingBatch(null);
        loadGroupsForBatch(batchId);
    };

    const handleBatchEdit = (batch) => {
        setEditingBatch(batch);
        loadGroupsForBatch(batch.id);
    };

    const handleSyncGroups = async () => {
        if (!window.confirm("This will fetch the latest group list from WhatsApp and update the database. Groups you have left will be removed. Continue?")) {
            return;
        }
        setIsSyncing(true);
        try {
            const { data } = await api.post('/groups/sync');
            alert(data.message);
            window.location.reload(); 
        } catch (error) {
            console.error('Failed to sync groups:', error);
            alert(error.response?.data?.message || 'Failed to sync groups.');
            setIsSyncing(false);
        }
    };

    const startBroadcast = (groupObjects, broadcastMessage) => {
        // Reset state for new broadcast (NO "queued" message)
        setIsBroadcasting(true);
        setIsBroadcastComplete(false);
        setBroadcastLogs([]);
        setBroadcastSummary({ total: groupObjects.length, successful: 0, failed: 0 });

        api.post('/broadcast', {
            groupObjects,
            message: broadcastMessage,
            socketId
        });
    };

    return (
        <>
            <AppContainer>
                <Header>
                    <Title>
                        <FaWhatsapp /> Beta Broadcaster
                    </Title>
                    <StatusIndicator status={status} onLogout={handleLogout} />
                </Header>

                {status === "qr" && (
                    <QRContainer>
                        <h2>Scan to Connect WhatsApp</h2>
                        {qrCode && <img src={qrCode} alt="QR Code" />}
                    </QRContainer>
                )}

                {status === "connected" && (
                    <MainContent>
                        <LeftPanel>
                            <BatchManager
                                batches={batches}
                                onBatchSelect={handleBatchSelect}
                                onBatchEdit={handleBatchEdit}
                                onBatchesUpdate={handleDataUpdate}
                            />
                            <GroupSelector
                                allGroups={allGroups}
                                selectedGroups={selectedGroups}
                                setSelectedGroups={setSelectedGroups}
                                onBatchUpdate={handleDataUpdate}
                                editingBatch={editingBatch}
                                setEditingBatch={setEditingBatch}
                                onSync={handleSyncGroups}
                                isSyncing={isSyncing}
                            />
                        </LeftPanel>

                        <RightPanel>
                            <TemplateManager
                                templates={templates}
                                onTemplateSelect={(text) => setMessage(text)}
                                onTemplatesUpdate={handleDataUpdate}
                            />
                            <BroadcastForm
                                selectedGroupIds={Array.from(selectedGroups)}
                                allGroups={allGroups}
                                message={message}
                                setMessage={setMessage}
                                onTemplateSave={handleDataUpdate}
                                onBroadcastStart={startBroadcast}
                                isBroadcasting={isBroadcasting}
                            />
                        </RightPanel>
                    </MainContent>
                )}
            </AppContainer>
            
            <BroadcastProgressModal
                isOpen={isBroadcasting}
                onClose={() => setIsBroadcasting(false)}
                logs={broadcastLogs}
                summary={broadcastSummary}
                isComplete={isBroadcastComplete}
            />
        </>
    );
}

export default App;