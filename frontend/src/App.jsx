import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import api, { getBatches, getTemplates, getGroupIdsForBatch } from './services/api';
import StatusIndicator from './components/StatusIndicator';
import GroupSelector from './components/GroupSelector';
import BroadcastForm from './components/BroadcastForm';
import BatchManager from './components/BatchManager';
import TemplateManager from './components/TemplateManager';
import { FaWhatsapp } from 'react-icons/fa';

const AppContainer = styled.div`
  max-width: 1400px;
  width: 100%; // <-- NEW: Ensure it doesn't exceed screen width
  margin: 1rem auto; // Reduced top/bottom margin for smaller screens
  padding: 1rem; // Reduced padding for smaller screens
  background: #FFF;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);

  // --- NEW ---
  // Ensure padding is respected and content doesn't overflow
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
  /* 3-column layout */
  grid-template-columns: 350px 1fr 350px;
  gap: 1.5rem;
  align-items: flex-start;

  @media (max-width: 1200px) {
    grid-template-columns: 1fr 2fr;
  }
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const LeftColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

function App() {
    const [status, setStatus] = useState('disconnected');
    const [qrCode, setQrCode] = useState(null);
    const [allGroups, setAllGroups] = useState([]);
    const [selectedGroups, setSelectedGroups] = useState(new Set());
    const [batches, setBatches] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [message, setMessage] = useState('');
    const [editingBatch, setEditingBatch] = useState(null); // State for batch edit mode
    const [isSyncing, setIsSyncing] = useState(false);

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

    const handleSyncGroups = async () => {
      setIsSyncing(true);
      try {
        const { data } = await api.post("/groups/sync");
        alert(data.message);
        // After sync, we call a hard refresh to get the latest data.
        // This is simpler than trying to merge state and ensures everything is fresh.
        window.location.reload();
      } catch (error) {
        console.error("Failed to sync groups:", error);
        alert(error.response?.data?.message || "Failed to sync groups.");
        setIsSyncing(false); // Make sure to re-enable the button on failure
      }
      // No need for a finally block, as success causes a reload.
    };

    const handleDataUpdate = async () => {
        try {
            const [batchesRes, templatesRes] = await Promise.all([getBatches(), getTemplates()]);
            setBatches(batchesRes.data);
            setTemplates(templatesRes.data);
        } catch (error) {
            console.error("Error refreshing data:", error);
        }
    };

    // ----- BUG FIX STARTS HERE -----

    // New helper function to ONLY load groups for a batch without changing edit mode.
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

    // This function is for selecting a batch to broadcast to. It CANCELS edit mode.
    const handleBatchSelect = (batchId) => {
        setEditingBatch(null); // Cancel any ongoing edit
        loadGroupsForBatch(batchId);
    };

    // This function is for editing a batch. It ENTERS edit mode.
    const handleBatchEdit = (batch) => {
        setEditingBatch(batch);
        loadGroupsForBatch(batch.id); // Use the safe helper function
    };

    // ----- BUG FIX ENDS HERE -----


    return (
        <AppContainer>
            <Header>
                <Title><FaWhatsapp /> Beta Broadcaster</Title>
                <StatusIndicator status={status} onLogout={handleLogout}/>
            </Header>

            {status === 'qr' && (
                <QRContainer>
                    <h2>Scan to Connect WhatsApp</h2>
                    {qrCode && <img src={qrCode} alt="QR Code" />}
                </QRContainer>
            )}

            {status === 'connected' && (
                <MainContent>
                    <LeftColumn>
                        <BatchManager
                            batches={batches}
                            onBatchSelect={handleBatchSelect}
                            onBatchEdit={handleBatchEdit}
                            onBatchesUpdate={handleDataUpdate}
                        />
                         <TemplateManager
                            templates={templates}
                            onTemplateSelect={(text) => setMessage(text)}
                            onTemplatesUpdate={handleDataUpdate}
                        />
                    </LeftColumn>

                    <BroadcastForm
                        selectedGroupIds={Array.from(selectedGroups)}
                        message={message}
                        setMessage={setMessage}
                        onTemplateSave={handleDataUpdate}
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
                </MainContent>
            )}
        </AppContainer>
    );
}

export default App;