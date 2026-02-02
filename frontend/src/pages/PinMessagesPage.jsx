import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { io } from 'socket.io-client';
import { usePermissions } from '../context/PermissionContext';
import GroupSelector from '../components/GroupSelector';
import AttachmentManagerModal from '../components/AttachmentManagerModal';
import PinProgressModal from '../components/PinProgressModal';
import { createPinMessage, getPinHistory, getPinDetails, retryPinMessage, getBatches, getGroupIdsForBatch } from '../services/api';

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

const Card = styled.div`
  background: #fff;
  padding: 1.5rem;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Label = styled.label`
  font-weight: 600;
`;

const Textarea = styled.textarea`
  min-height: 140px;
  padding: 0.75rem;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 4px;
  font-size: 1rem;
`;

const Input = styled.input`
  padding: 0.75rem;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 4px;
  font-size: 1rem;
`;

const Select = styled.select`
  padding: 0.75rem;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 4px;
  font-size: 1rem;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const Button = styled.button`
  background-color: ${({ theme }) => theme.primary};
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
`;

const SecondaryButton = styled.button`
  background-color: transparent;
  color: ${({ theme }) => theme.primary};
  border: 1px solid ${({ theme }) => theme.primary};
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  th, td {
    padding: 0.75rem;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    text-align: left;
    font-size: 0.95rem;
  }
  th {
    color: ${({ theme }) => theme.lightText};
    font-weight: 600;
  }
`;

const Badge = styled.span`
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.8rem;
  background: ${({ theme, variant }) => {
    if (variant === 'pinned') return theme.success;
    if (variant === 'failed') return theme.error;
    return theme.lightText;
  }};
  color: #fff;
`;

const API_URL = 'https://platform.betaserver.dev:4433';

const PinMessagesPage = ({ allGroups }) => {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('pin:create');
  const canView = hasPermission('pin:view');
  const canRetry = hasPermission('pin:retry');

  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [durationPreset, setDurationPreset] = useState('24h');
  const [customDuration, setCustomDuration] = useState('');
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);

  const socket = useRef(null);
  const [socketId, setSocketId] = useState(null);
  const [isPinning, setIsPinning] = useState(false);
  const [pinLogs, setPinLogs] = useState([]);
  const [pinSummary, setPinSummary] = useState({ total: 0, successful: 0, failed: 0 });
  const [isPinComplete, setIsPinComplete] = useState(false);

  const [history, setHistory] = useState([]);
  const [activePinId, setActivePinId] = useState(null);
  const [pinTargets, setPinTargets] = useState([]);
  const [batches, setBatches] = useState([]);
  const [targetMode, setTargetMode] = useState('manual');
  const [selectedBatchId, setSelectedBatchId] = useState('');

  useEffect(() => {
    socket.current = io(API_URL, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
    });
    socket.current.on('connect', () => setSocketId(socket.current.id));
    socket.current.on('pin:progress', (log) => {
      setPinLogs((prev) => [...prev, log]);
      setPinSummary((prev) => ({
        ...prev,
        successful: log.status === 'success' ? prev.successful + 1 : prev.successful,
        failed: log.status === 'failed' ? prev.failed + 1 : prev.failed,
      }));
    });
    socket.current.on('pin:complete', (summary) => {
      setPinSummary(summary);
      setIsPinComplete(true);
      setPinLogs((prev) => [...prev, { status: 'info', message: '--- Pinning Finished ---' }]);
    });
    socket.current.on('connect_error', (err) => console.error('WebSocket error:', err.message));
    return () => socket.current.disconnect();
  }, []);

  const durationSeconds = useMemo(() => {
    if (durationPreset === '24h') return 24 * 60 * 60;
    if (durationPreset === '7d') return 7 * 24 * 60 * 60;
    if (durationPreset === '30d') return 30 * 24 * 60 * 60;
    if (durationPreset === 'custom') {
      const val = Number(customDuration);
      return Number.isFinite(val) && val > 0 ? val : null;
    }
    return null;
  }, [durationPreset, customDuration]);

  const fetchHistory = async () => {
    if (!canView) return;
    try {
      const { data } = await getPinHistory();
      setHistory(data || []);
    } catch (error) {
      console.error('Failed to fetch pin history', error);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [canView]);

  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const { data } = await getBatches();
        setBatches(data || []);
      } catch (error) {
        console.error('Failed to fetch batches', error);
      }
    };
    fetchBatches();
  }, []);

  const loadPinDetails = async (pinId) => {
    if (!canView) return;
    try {
      const { data } = await getPinDetails(pinId);
      setActivePinId(pinId);
      setPinTargets(data.targets || []);
    } catch (error) {
      console.error('Failed to fetch pin details', error);
    }
  };

  const handlePin = async () => {
    if (!canCreate) {
      alert('You do not have permission to pin messages.');
      return;
    }
    if (targetMode === 'manual' && selectedGroups.size === 0) {
      alert('Please select at least one group.');
      return;
    }
    if (targetMode === 'batch' && !selectedBatchId) {
      alert('Please select a batch.');
      return;
    }
    if (!message && !attachment) {
      alert('Please provide a message or attachment.');
      return;
    }
    if (!durationSeconds) {
      alert('Please choose a valid duration.');
      return;
    }

    let groupObjects = [];
    if (targetMode === 'manual') {
      groupObjects = (allGroups || []).filter((group) => selectedGroups.has(group.id));
    } else {
      const { data: batchGroupIds } = await getGroupIdsForBatch(selectedBatchId);
      groupObjects = (allGroups || [])
        .filter((group) => batchGroupIds.includes(group.id))
        .map((group) => ({ id: group.id, name: group.name }));
    }

    setIsPinning(true);
    setIsPinComplete(false);
    setPinLogs([]);
    setPinSummary({ total: groupObjects.length, successful: 0, failed: 0 });

    try {
      const { data } = await createPinMessage({
        groupObjects: targetMode === 'manual' ? groupObjects : [],
        message,
        upload_id: attachment?.id || null,
        duration_seconds: durationSeconds,
        socketId,
        batch_id: targetMode === 'batch' ? selectedBatchId : null,
      });

      if (data?.id) {
        await fetchHistory();
        await loadPinDetails(data.id);
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to start pin job.');
    }
  };

  const handleRetry = async (pinId) => {
    if (!canRetry) return;
    try {
      await retryPinMessage(pinId, { socketId });
      await fetchHistory();
      await loadPinDetails(pinId);
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to retry pin.');
    }
  };

  const handleSelectAttachment = (selectedFile) => {
    setAttachment(selectedFile);
    setIsAttachmentModalOpen(false);
  };

  return (
    <>
      <MainContent>
        <LeftPanel>
          {targetMode === 'manual' && (
            <GroupSelector
              allGroups={allGroups}
              selectedGroups={selectedGroups}
              setSelectedGroups={setSelectedGroups}
              editingBatch={null}
              setEditingBatch={() => {}}
              onBatchUpdate={() => {}}
              onSync={() => {}}
              isSyncing={false}
              canCreateBatch={false}
              canEditBatch={false}
              canSyncGroups={false}
            />
          )}
        </LeftPanel>
        <RightPanel>
          <Card>
            <h3>Pin Message</h3>
            <Field>
              <Label>Target Mode</Label>
              <Select value={targetMode} onChange={(e) => setTargetMode(e.target.value)}>
                <option value="manual">Select Groups</option>
                <option value="batch">Use Batch</option>
              </Select>
            </Field>
            {targetMode === 'batch' && (
              <Field>
                <Label>Batch</Label>
                <Select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)}>
                  <option value="">Select batch</option>
                  {batches.map((batch) => (
                    <option key={batch.id} value={batch.id}>{batch.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field>
              <Label>Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write the message to pin" />
            </Field>
            <Field>
              <Label>Attachment</Label>
              <ButtonRow>
                <SecondaryButton type="button" onClick={() => setIsAttachmentModalOpen(true)}>
                  {attachment ? 'Change Attachment' : 'Select Attachment'}
                </SecondaryButton>
                {attachment && (
                  <SecondaryButton type="button" onClick={() => setAttachment(null)}>
                    Remove Attachment
                  </SecondaryButton>
                )}
              </ButtonRow>
              {attachment && <span>Selected: {attachment.original_filename}</span>}
            </Field>
            <Field>
              <Label>Duration</Label>
              <Select value={durationPreset} onChange={(e) => setDurationPreset(e.target.value)}>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="custom">Custom (seconds)</option>
              </Select>
              {durationPreset === 'custom' && (
                <Input
                  type="number"
                  min="1"
                  placeholder="Duration in seconds"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                />
              )}
            </Field>
            <ButtonRow>
              <Button onClick={handlePin} disabled={!canCreate}>Start Pinning</Button>
            </ButtonRow>
          </Card>

          <Card>
            <h3>Pin History</h3>
            <Table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Batch</th>
                  <th>Message</th>
                  <th>Duration</th>
                  <th>Pinned</th>
                  <th>Failed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.batch_name || '-'}</td>
                    <td>{item.message_text ? item.message_text.slice(0, 40) : 'Attachment only'}</td>
                    <td>{item.duration_seconds ? `${item.duration_seconds}s` : '-'}</td>
                    <td>{item.total_pinned || 0}</td>
                    <td>{item.total_failed || 0}</td>
                    <td>
                      <ButtonRow>
                        <SecondaryButton type="button" onClick={() => loadPinDetails(item.id)}>
                          View
                        </SecondaryButton>
                        {canRetry && (item.total_failed > 0) && (
                          <SecondaryButton type="button" onClick={() => handleRetry(item.id)}>
                            Retry Failed
                          </SecondaryButton>
                        )}
                      </ButtonRow>
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan="6">No pin jobs yet.</td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>

          {activePinId && (
            <Card>
              <h3>Pin Targets (Job #{activePinId})</h3>
              <Table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Status</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {pinTargets.map((target) => (
                    <tr key={target.id}>
                      <td>{target.group_name || target.group_jid}</td>
                      <td><Badge variant={target.status}>{target.status}</Badge></td>
                      <td>{target.error_message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </RightPanel>
      </MainContent>

      <PinProgressModal
        isOpen={isPinning}
        onClose={() => setIsPinning(false)}
        logs={pinLogs}
        summary={pinSummary}
        isComplete={isPinComplete}
      />

      <AttachmentManagerModal
        isOpen={isAttachmentModalOpen}
        onClose={() => setIsAttachmentModalOpen(false)}
        onSelect={handleSelectAttachment}
        canViewAttachments={hasPermission('broadcast:uploads:view')}
        canUploadAttachments={hasPermission('broadcast:uploads:create')}
        canDeleteAttachments={hasPermission('broadcast:uploads:delete')}
      />
    </>
  );
};

export default PinMessagesPage;
