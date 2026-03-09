import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { io } from "socket.io-client";
import { FaCheckCircle, FaLayerGroup, FaPaste, FaSyncAlt, FaTasks } from "react-icons/fa";
import api, {
  cancelBroadcastJob,
  deleteBroadcastForEveryone,
  editBroadcastJobMessage,
  getBatches,
  getBroadcastJobById,
  getBroadcastJobs,
  getGroupIdsForBatch,
  getTemplates,
  pauseBroadcastJob,
  replayBroadcastJob,
  resumeBroadcastJob,
  retryFailedBroadcastJob,
  startBroadcastJob,
} from "../services/api";
import { usePermissions } from "../context/PermissionContext";

import BroadcastForm from "../components/BroadcastForm";
import AttachmentManagerModal from "../components/AttachmentManagerModal";
import BroadcastJobsPanel from "../components/BroadcastJobsPanel";
import BatchManager from "../components/BatchManager";
import GroupSelector from "../components/GroupSelector";
import TemplateManager from "../components/TemplateManager";
import Modal from "../components/Modal";

const PageShell = styled.div`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  overflow: auto;
`;

const Tabs = styled.div`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.surfaceAlt};
  padding: 0.2rem;
  gap: 0.2rem;
`;

const TabButton = styled.button`
  min-width: 88px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: ${({ theme, $active }) => ($active ? theme.primary : "transparent")};
  color: ${({ theme, $active }) => ($active ? theme.surface : theme.primary)};
  font-size: 0.76rem;
  font-weight: 800;
  cursor: pointer;
`;

const TabContent = styled.div`
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding-right: 0.05rem;
`;

const ComposeLayout = styled.div`
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
`;

const SetupCard = styled.section`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.surface};
  padding: 0.5rem;
`;

const SetupGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(170px, 1fr));
  gap: 0.55rem;

  @media (max-width: 1400px) {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const SetupCell = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.surfaceAlt};
  padding: 0.42rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const Label = styled.div`
  font-size: 0.68rem;
  color: ${({ theme }) => theme.lightText};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 800;
`;

const ValueRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  font-size: 0.8rem;
`;

const InlineActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
`;

const ActionButton = styled.button`
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme, $variant }) => ($variant === "primary" ? theme.primary : theme.surface)};
  color: ${({ theme, $variant }) => ($variant === "primary" ? theme.surface : theme.primary)};
  padding: 0.25rem 0.5rem;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  font-size: 0.74rem;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
`;

const SelectField = styled.select`
  width: 100%;
  min-height: 29px;
  font-size: 0.78rem;
  border-radius: 6px;
`;

const ComposeBody = styled.div`
  min-height: 0;
  overflow: visible;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  margin-bottom: 0.55rem;
`;

const SearchInput = styled.input`
  width: 100%;
`;

const ModalControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;
  margin-bottom: 0.52rem;
`;

const ListWrap = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  max-height: 58vh;
  overflow: auto;
`;

const ListItem = styled.label`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.55rem;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  padding: 0.48rem 0.55rem;
  background: ${({ $selected, theme }) => ($selected ? theme.secondarySoft : theme.surface)};
`;

const ItemText = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
`;

const FooterRow = styled.div`
  margin-top: 0.55rem;
  display: flex;
  justify-content: flex-end;
`;

const ManagerLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(230px, 290px) 1fr;
  gap: 0.65rem;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const API_URL = (import.meta.env.VITE_SOCKET_URL || window.location.origin).trim();

const createLogEntry = (status, message) => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  timestamp: new Date().toISOString(),
  status,
  message,
});

const sortJobsDesc = (jobs) =>
  [...jobs].sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    if (aTime !== bTime) return bTime - aTime;
    return (b.id || 0) - (a.id || 0);
  });

const BroadcasterPage = ({ allGroups }) => {
  const { hasPermission } = usePermissions();
  const canViewBatches = hasPermission("broadcast:batches:view");
  const canCreateBatches = hasPermission("broadcast:batches:create");
  const canUpdateBatches = hasPermission("broadcast:batches:update");
  const canDeleteBatches = hasPermission("broadcast:batches:delete");
  const canViewTemplates = hasPermission("broadcast:templates:view");
  const canCreateTemplates = hasPermission("broadcast:templates:create");
  const canUpdateTemplates = hasPermission("broadcast:templates:update");
  const canDeleteTemplates = hasPermission("broadcast:templates:delete");
  const canViewAttachments = hasPermission("broadcast:uploads:view");
  const canCreateAttachments = hasPermission("broadcast:uploads:create");
  const canDeleteAttachments = hasPermission("broadcast:uploads:delete");
  const canViewJobs = hasPermission("broadcast:jobs:view");
  const canControlJobs = hasPermission("broadcast:jobs:control");
  const canReplayJobs = hasPermission("broadcast:jobs:replay");
  const canSyncGroups = hasPermission("admin:manage_roles");
  const canManageBatches = canCreateBatches || canUpdateBatches || canDeleteBatches;
  const canManageTemplates = canUpdateTemplates || canDeleteTemplates;

  const [activeTab, setActiveTab] = useState("compose");
  const [isGroupModalOpen, setGroupModalOpen] = useState(false);
  const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);
  const [isBatchManagerOpen, setBatchManagerOpen] = useState(false);
  const [isTemplateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);

  const [groupSearch, setGroupSearch] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [batchEditorSelection, setBatchEditorSelection] = useState(new Set());
  const [editingBatch, setEditingBatch] = useState(null);

  const [batches, setBatches] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [socketId, setSocketId] = useState(null);
  const socket = useRef(null);

  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [jobDetailsById, setJobDetailsById] = useState({});
  const [jobLogsById, setJobLogsById] = useState({});
  const [jobEditDrafts, setJobEditDrafts] = useState({});
  const [jobDetailLoading, setJobDetailLoading] = useState({});
  const [jobActionLoading, setJobActionLoading] = useState({});
  const [isJobsRefreshing, setIsJobsRefreshing] = useState(false);
  const [isCreatingBroadcast, setIsCreatingBroadcast] = useState(false);

  const filteredGroups = useMemo(() => {
    const term = groupSearch.trim().toLowerCase();
    const list = allGroups || [];
    const filtered = term
      ? list.filter((group) => group.name?.toLowerCase().includes(term))
      : list;

    // Keep selected groups pinned to the top while preserving base list order.
    return filtered
      .map((group, index) => ({ group, index }))
      .sort((a, b) => {
        const aSelected = selectedGroups.has(a.group.id);
        const bSelected = selectedGroups.has(b.group.id);
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        return a.index - b.index;
      })
      .map(({ group }) => group);
  }, [allGroups, groupSearch, selectedGroups]);

  const filteredTemplates = useMemo(() => {
    const term = templateSearch.trim().toLowerCase();
    const list = templates || [];
    if (!term) return list;
    return list.filter((template) => template.name?.toLowerCase().includes(term));
  }, [templates, templateSearch]);

  const allFilteredSelected = useMemo(() => {
    if (!filteredGroups.length) return false;
    return filteredGroups.every((group) => selectedGroups.has(group.id));
  }, [filteredGroups, selectedGroups]);

  const appendJobLog = useCallback((jobId, status, text) => {
    if (!jobId) return;
    setJobLogsById((prev) => {
      const existing = prev[jobId] || [];
      const next = [...existing, createLogEntry(status, text)];
      return {
        ...prev,
        [jobId]: next.slice(-250),
      };
    });
  }, []);

  const upsertJob = useCallback((job) => {
    if (!job?.id) return;
    setJobs((prev) => {
      const without = prev.filter((item) => item.id !== job.id);
      return sortJobsDesc([job, ...without]);
    });
    setSelectedJobId((prev) => prev || job.id);
  }, []);

  const fetchBroadcasterData = useCallback(async () => {
    try {
      const promises = [];
      promises.push(canViewBatches ? getBatches() : Promise.resolve({ data: [] }));
      promises.push(canViewTemplates ? getTemplates() : Promise.resolve({ data: [] }));
      const [batchesRes, templatesRes] = await Promise.all(promises);
      setBatches(batchesRes.data || []);
      setTemplates(templatesRes.data || []);
    } catch (error) {
      console.error("Error fetching broadcaster data:", error);
    }
  }, [canViewBatches, canViewTemplates]);

  const fetchJobs = useCallback(
    async ({ silent = false } = {}) => {
      if (!canViewJobs) return;
      if (!silent) setIsJobsRefreshing(true);
      try {
        const { data } = await getBroadcastJobs({ limit: 50, page: 1 });
        const list = sortJobsDesc(data?.jobs || []);
        setJobs(list);
        setSelectedJobId((prev) => {
          if (prev && list.some((job) => job.id === prev)) return prev;
          return list[0]?.id || null;
        });
      } catch (error) {
        console.error("Failed to fetch broadcast jobs:", error);
      } finally {
        if (!silent) setIsJobsRefreshing(false);
      }
    },
    [canViewJobs],
  );

  const fetchJobDetails = useCallback(
    async (jobId) => {
      if (!jobId || !canViewJobs) return;
      setJobDetailLoading((prev) => ({ ...prev, [jobId]: true }));
      try {
        const { data } = await getBroadcastJobById(jobId);
        setJobDetailsById((prev) => ({ ...prev, [jobId]: data }));
        setJobEditDrafts((prev) => {
          if (prev[jobId] !== undefined) return prev;
          return { ...prev, [jobId]: data?.job?.message_text || "" };
        });
        if (data?.job) {
          setJobs((prev) => {
            const without = prev.filter((item) => item.id !== data.job.id);
            return sortJobsDesc([data.job, ...without]);
          });
        }
      } catch (error) {
        console.error(`Failed to fetch job ${jobId} details:`, error);
      } finally {
        setJobDetailLoading((prev) => ({ ...prev, [jobId]: false }));
      }
    },
    [canViewJobs],
  );

  const withJobAction = useCallback(
    async (jobId, actionKey, actionFn, successText) => {
      const token = `${jobId}:${actionKey}`;
      setJobActionLoading((prev) => ({ ...prev, [token]: true }));
      try {
        const result = await actionFn();
        if (successText) appendJobLog(jobId, "success", successText);
        await fetchJobs({ silent: true });
        await fetchJobDetails(jobId);
        return result;
      } catch (error) {
        const reason = error.response?.data?.message || error.message || "Action failed.";
        appendJobLog(jobId, "failed", `${actionKey} failed: ${reason}`);
        alert(reason);
        return null;
      } finally {
        setJobActionLoading((prev) => ({ ...prev, [token]: false }));
      }
    },
    [appendJobLog, fetchJobs, fetchJobDetails],
  );

  useEffect(() => {
    fetchBroadcasterData();
    fetchJobs();
  }, [fetchBroadcasterData, fetchJobs]);

  useEffect(() => {
    if (!selectedJobId) return;
    fetchJobDetails(selectedJobId);
  }, [selectedJobId, fetchJobDetails]);

  useEffect(() => {
    if (!canViewJobs) return undefined;
    const interval = setInterval(() => {
      fetchJobs({ silent: true });
      if (selectedJobId) fetchJobDetails(selectedJobId);
    }, 15000);
    return () => clearInterval(interval);
  }, [canViewJobs, fetchJobs, fetchJobDetails, selectedJobId]);

  useEffect(() => {
    socket.current = io(API_URL, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
    });

    socket.current.on("connect", () => setSocketId(socket.current.id));

    socket.current.on("broadcast:job:update", (payload) => {
      const job = payload?.job;
      if (!job?.id) return;
      upsertJob(job);
      setJobDetailsById((prev) => {
        if (!prev[job.id]) return prev;
        return {
          ...prev,
          [job.id]: { ...prev[job.id], job: { ...prev[job.id].job, ...job } },
        };
      });
    });

    socket.current.on("broadcast:job:progress", (payload) => {
      const jobId = payload?.jobId;
      if (!jobId) return;
      appendJobLog(jobId, payload.status || "info", payload.message || "Job progress update.");
    });

    socket.current.on("broadcast:job:complete", (payload) => {
      const jobId = payload?.jobId;
      if (!jobId) return;
      appendJobLog(
        jobId,
        payload.status === "failed" ? "failed" : "success",
        `Job completed with status "${payload.status}".`,
      );
      fetchJobs({ silent: true });
      fetchJobDetails(jobId);
    });

    socket.current.on("broadcast:job:control_progress", (payload) => {
      const jobId = payload?.jobId;
      if (!jobId) return;
      appendJobLog(jobId, payload.status || "info", payload.message || "Job control update.");
    });

    socket.current.on("broadcast:job:control_complete", (payload) => {
      const jobId = payload?.jobId;
      if (!jobId) return;
      appendJobLog(
        jobId,
        payload.failed > 0 ? "failed" : "success",
        `${payload.action} finished. Attempted ${payload.attempted || 0}, success ${payload.deleted || payload.edited || 0}, failed ${payload.failed || 0}.`,
      );
      fetchJobs({ silent: true });
      fetchJobDetails(jobId);
    });

    socket.current.on("broadcast:progress", (payload) => {
      if (!payload?.jobId) return;
      appendJobLog(payload.jobId, payload.status || "info", payload.message || "Legacy progress event.");
    });

    socket.current.on("broadcast:complete", (payload) => {
      if (!payload?.jobId) return;
      appendJobLog(
        payload.jobId,
        payload.status === "failed" ? "failed" : "success",
        "Legacy completion event received.",
      );
      fetchJobs({ silent: true });
      fetchJobDetails(payload.jobId);
    });

    socket.current.on("connect_error", (err) =>
      console.error("WebSocket connection error:", err.message),
    );

    return () => {
      socket.current.disconnect();
    };
  }, [appendJobLog, fetchJobDetails, fetchJobs, upsertJob]);

  const handleDataUpdate = async () => {
    await fetchBroadcasterData();
  };

  const handleSyncGroups = async () => {
    if (!window.confirm("This will fetch the latest group list. Continue?")) return;
    setIsSyncing(true);
    try {
      const { data } = await api.post("/groups/sync");
      alert(data.message);
      window.location.reload();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to sync groups.");
      setIsSyncing(false);
    }
  };

  const handleApplyBatch = async (batchId) => {
    setSelectedBatchId(batchId);
    if (!batchId) {
      setSelectedGroups(new Set());
      return;
    }
    try {
      const { data: groupIds } = await getGroupIdsForBatch(batchId);
      setSelectedGroups(new Set(groupIds || []));
    } catch (error) {
      alert(error.response?.data?.message || "Failed to load batch groups.");
    }
  };

  const handleBatchSelectionForEditor = async (batchId) => {
    if (!batchId) {
      setEditingBatch(null);
      setBatchEditorSelection(new Set());
      return;
    }

    try {
      const targetBatch = (batches || []).find((batch) => String(batch.id) === String(batchId)) || null;
      setEditingBatch(targetBatch);
      const { data: groupIds } = await getGroupIdsForBatch(batchId);
      setBatchEditorSelection(new Set(groupIds || []));
    } catch (error) {
      alert(error.response?.data?.message || "Failed to load batch groups.");
    }
  };

  const handleBatchEdit = async (batch) => {
    if (!batch?.id) return;
    setEditingBatch(batch);
    try {
      const { data: groupIds } = await getGroupIdsForBatch(batch.id);
      setBatchEditorSelection(new Set(groupIds || []));
    } catch (error) {
      alert(error.response?.data?.message || "Failed to load batch groups for editing.");
    }
  };

  const toggleGroup = (groupId) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredGroups.forEach((group) => next.delete(group.id));
      } else {
        filteredGroups.forEach((group) => next.add(group.id));
      }
      return next;
    });
  };

  const applyTemplate = (template) => {
    setMessage(template.text || "");
    setAttachment(template.attachment || null);
    setTemplateModalOpen(false);
  };

  const startBroadcast = async (groupObjects, broadcastMessage, broadcastAttachment) => {
    if (isCreatingBroadcast) return;
    setIsCreatingBroadcast(true);
    try {
      const { data } = await startBroadcastJob({
        groupObjects,
        message: broadcastMessage,
        attachment: broadcastAttachment,
        socketId,
      });
      const startedJob = data?.job || null;
      if (startedJob?.id) {
        upsertJob(startedJob);
        setSelectedJobId(startedJob.id);
        setActiveTab("jobs");
        appendJobLog(startedJob.id, "info", `Broadcast job #${startedJob.id} queued.`);
        await fetchJobDetails(startedJob.id);
      }
    } catch (error) {
      const reason = error.response?.data?.message || "Failed to queue broadcast job.";
      alert(reason);
    } finally {
      setIsCreatingBroadcast(false);
    }
  };

  const handlePauseJob = (jobId) =>
    withJobAction(jobId, "pause", () => pauseBroadcastJob(jobId), `Pause requested for job #${jobId}.`);

  const handleResumeJob = (jobId) =>
    withJobAction(jobId, "resume", () => resumeBroadcastJob(jobId), `Resume requested for job #${jobId}.`);

  const handleCancelJob = (jobId) => {
    if (!window.confirm(`Cancel broadcast job #${jobId}?`)) return Promise.resolve(null);
    return withJobAction(jobId, "cancel", () => cancelBroadcastJob(jobId), `Cancel requested for job #${jobId}.`);
  };

  const handleRetryJob = (jobId) =>
    withJobAction(jobId, "retry", () => retryFailedBroadcastJob(jobId), `Retry failed targets requested for job #${jobId}.`);

  const handleReplayJob = async (jobId) => {
    const result = await withJobAction(jobId, "replay", () => replayBroadcastJob(jobId, socketId), `Replay requested for job #${jobId}.`);
    const replayJobId = result?.data?.job?.id;
    if (replayJobId) {
      setSelectedJobId(replayJobId);
      await fetchJobDetails(replayJobId);
    }
  };

  const handleDeleteForEveryone = (jobId) => {
    if (!window.confirm(`Delete broadcasted messages for everyone for sent targets in job #${jobId}?`)) {
      return Promise.resolve(null);
    }
    return withJobAction(jobId, "delete", () => deleteBroadcastForEveryone(jobId), `Delete-for-everyone finished for job #${jobId}.`);
  };

  const handleEditSentMessage = (jobId) => {
    const messageText = String(jobEditDrafts[jobId] || "").trim();
    if (!messageText) {
      alert("Please enter the edited message text first.");
      return Promise.resolve(null);
    }
    return withJobAction(jobId, "edit", () => editBroadcastJobMessage(jobId, messageText), `Edit-sent-message finished for job #${jobId}.`);
  };

  const handleSelectAttachment = (selectedFile) => {
    setAttachment(selectedFile);
    setIsAttachmentModalOpen(false);
  };

  const selectedJobDetails = selectedJobId ? jobDetailsById[selectedJobId] : null;
  const selectedJobLogs = selectedJobId ? jobLogsById[selectedJobId] || [] : [];
  const isActionPending = (jobId, actionKey) => !!jobActionLoading[`${jobId}:${actionKey}`];

  return (
    <>
      <PageShell>
        <Tabs>
          <TabButton type="button" $active={activeTab === "compose"} onClick={() => setActiveTab("compose")}>
            Compose
          </TabButton>
          {canViewJobs && (
            <TabButton type="button" $active={activeTab === "jobs"} onClick={() => setActiveTab("jobs")}>
              Jobs
            </TabButton>
          )}
        </Tabs>

        <TabContent>
          {activeTab === "compose" && (
            <ComposeLayout>
              <SetupCard>
                <SetupGrid>
                  <SetupCell>
                    <Label>Targets</Label>
                    <ValueRow>
                      <span>{selectedGroups.size} groups selected</span>
                      <ActionButton type="button" onClick={() => setGroupModalOpen(true)}>
                        <FaLayerGroup /> Select
                      </ActionButton>
                    </ValueRow>
                  </SetupCell>

                  <SetupCell>
                    <Label>Batch</Label>
                    <SelectField
                      value={selectedBatchId}
                      onChange={(event) => handleApplyBatch(event.target.value)}
                      disabled={!canViewBatches}
                    >
                      <option value="">No batch</option>
                      {(batches || []).map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.name}
                        </option>
                      ))}
                    </SelectField>
                    <InlineActions>
                      <ActionButton
                        type="button"
                        onClick={() => setBatchManagerOpen(true)}
                        disabled={!canViewBatches && !canManageBatches}
                      >
                        Manage Batches
                      </ActionButton>
                    </InlineActions>
                  </SetupCell>

                  <SetupCell>
                    <Label>Template</Label>
                    <ValueRow>
                      <span>{message || attachment ? "Loaded" : "Not selected"}</span>
                      <InlineActions>
                        <ActionButton
                          type="button"
                          onClick={() => setTemplateModalOpen(true)}
                          disabled={!canViewTemplates}
                        >
                          <FaPaste /> Pick
                        </ActionButton>
                        <ActionButton
                          type="button"
                          onClick={() => setTemplateManagerOpen(true)}
                          disabled={!canViewTemplates && !canManageTemplates}
                        >
                          Manage Templates
                        </ActionButton>
                      </InlineActions>
                    </ValueRow>
                  </SetupCell>

                  <SetupCell>
                    <Label>Actions</Label>
                    <ValueRow>
                      <ActionButton
                        type="button"
                        onClick={handleSyncGroups}
                        disabled={!canSyncGroups || isSyncing}
                      >
                        <FaSyncAlt /> {isSyncing ? "Syncing..." : "Sync Groups"}
                      </ActionButton>
                      <ActionButton type="button" $variant="primary" onClick={() => setActiveTab("jobs")}>
                        <FaTasks /> Jobs
                      </ActionButton>
                    </ValueRow>
                  </SetupCell>
                </SetupGrid>
              </SetupCard>

              <ComposeBody>
                <BroadcastForm
                  selectedGroupIds={Array.from(selectedGroups)}
                  allGroups={allGroups}
                  message={message}
                  setMessage={setMessage}
                  attachment={attachment}
                  setAttachment={setAttachment}
                  onTemplateSave={handleDataUpdate}
                  onBroadcastStart={startBroadcast}
                  isBroadcasting={isCreatingBroadcast}
                  onOpenAttachmentManager={() => setIsAttachmentModalOpen(true)}
                  canSendBroadcast={hasPermission("broadcast:send")}
                  canCreateTemplates={canCreateTemplates}
                  canUploadAttachments={canCreateAttachments}
                  canViewAttachments={canViewAttachments}
                />
              </ComposeBody>
            </ComposeLayout>
          )}

          {activeTab === "jobs" && canViewJobs && (
            <BroadcastJobsPanel
              jobs={jobs}
              selectedJobId={selectedJobId}
              onSelectJob={setSelectedJobId}
              onRefresh={fetchJobs}
              selectedJobDetails={selectedJobDetails}
              selectedJobLogs={selectedJobLogs}
              isRefreshing={isJobsRefreshing}
              isLoadingDetails={selectedJobId ? !!jobDetailLoading[selectedJobId] : false}
              canControlJobs={canControlJobs}
              canReplayJobs={canReplayJobs}
              onPause={handlePauseJob}
              onResume={handleResumeJob}
              onCancel={handleCancelJob}
              onRetryFailed={handleRetryJob}
              onReplay={handleReplayJob}
              onDeleteForEveryone={handleDeleteForEveryone}
              onEditMessage={handleEditSentMessage}
              editDraft={selectedJobId ? jobEditDrafts[selectedJobId] || "" : ""}
              onEditDraftChange={(jobId, value) =>
                setJobEditDrafts((prev) => ({ ...prev, [jobId]: value }))
              }
              isActionPending={isActionPending}
            />
          )}
        </TabContent>
      </PageShell>

      <Modal isOpen={isGroupModalOpen} onClose={() => setGroupModalOpen(false)} maxWidth="860px">
        <h2>Select Target Groups</h2>
        <ModalHeader>
          <SearchInput
            type="text"
            placeholder="Search groups..."
            value={groupSearch}
            onChange={(event) => setGroupSearch(event.target.value)}
          />
        </ModalHeader>

        <ModalControls>
          <ActionButton type="button" onClick={toggleAllFiltered}>
            {allFilteredSelected ? "Deselect Visible" : "Select Visible"}
          </ActionButton>
          <ActionButton type="button" onClick={() => setSelectedGroups(new Set())}>
            Clear All
          </ActionButton>
          <ActionButton type="button" $variant="primary" onClick={() => setGroupModalOpen(false)}>
            <FaCheckCircle /> Done ({selectedGroups.size})
          </ActionButton>
        </ModalControls>

        <ListWrap>
          {filteredGroups.map((group) => (
            <ListItem key={group.id} $selected={selectedGroups.has(group.id)}>
              <input
                type="checkbox"
                checked={selectedGroups.has(group.id)}
                onChange={() => toggleGroup(group.id)}
              />
              <ItemText title={group.name}>{group.name}</ItemText>
              <span />
            </ListItem>
          ))}
        </ListWrap>
      </Modal>

      <Modal isOpen={isTemplateModalOpen} onClose={() => setTemplateModalOpen(false)} maxWidth="760px">
        <h2>Select Template</h2>
        <ModalHeader>
          <SearchInput
            type="text"
            placeholder="Search templates..."
            value={templateSearch}
            onChange={(event) => setTemplateSearch(event.target.value)}
          />
        </ModalHeader>

        <ListWrap>
          {filteredTemplates.map((template) => (
            <ListItem key={template.id} $selected={false}>
              <span />
              <ItemText title={template.name}>{template.name}</ItemText>
              <ActionButton type="button" onClick={() => applyTemplate(template)}>
                Apply
              </ActionButton>
            </ListItem>
          ))}
        </ListWrap>

        <FooterRow>
          {canManageTemplates && (
            <ActionButton
              type="button"
              onClick={() => {
                setTemplateModalOpen(false);
                setTemplateManagerOpen(true);
              }}
            >
              Manage Templates
            </ActionButton>
          )}
          <ActionButton type="button" onClick={() => setTemplateModalOpen(false)}>
            Close
          </ActionButton>
        </FooterRow>
      </Modal>

      <Modal isOpen={isBatchManagerOpen} onClose={() => setBatchManagerOpen(false)} maxWidth="1120px">
        <h2>Batch Management</h2>
        <p>Create, edit, delete, and apply batches from one place.</p>
        <ManagerLayout>
          <BatchManager
            batches={batches}
            onBatchSelect={handleBatchSelectionForEditor}
            onBatchEdit={handleBatchEdit}
            onBatchesUpdate={handleDataUpdate}
            canEditBatch={canUpdateBatches}
            canDeleteBatch={canDeleteBatches}
          />
          <GroupSelector
            allGroups={allGroups}
            selectedGroups={batchEditorSelection}
            setSelectedGroups={setBatchEditorSelection}
            onBatchUpdate={handleDataUpdate}
            editingBatch={editingBatch}
            setEditingBatch={setEditingBatch}
            onSync={handleSyncGroups}
            isSyncing={isSyncing}
            canCreateBatch={canCreateBatches}
            canEditBatch={canUpdateBatches}
            canSyncGroups={canSyncGroups}
          />
        </ManagerLayout>
      </Modal>

      <Modal isOpen={isTemplateManagerOpen} onClose={() => setTemplateManagerOpen(false)} maxWidth="860px">
        <h2>Template Management</h2>
        <p>Edit and delete templates. Click a template to load it into compose.</p>
        <TemplateManager
          templates={templates}
          onTemplateSelect={(template) => {
            applyTemplate(template);
            setTemplateManagerOpen(false);
          }}
          onTemplatesUpdate={handleDataUpdate}
          canEditTemplate={canUpdateTemplates}
          canDeleteTemplate={canDeleteTemplates}
          canViewAttachments={canViewAttachments}
          canUploadAttachments={canCreateAttachments}
          canDeleteAttachments={canDeleteAttachments}
        />
      </Modal>

      <AttachmentManagerModal
        isOpen={isAttachmentModalOpen}
        onClose={() => setIsAttachmentModalOpen(false)}
        onSelect={handleSelectAttachment}
        canViewAttachments={canViewAttachments}
        canUploadAttachments={canCreateAttachments}
        canDeleteAttachments={canDeleteAttachments}
      />
    </>
  );
};

export default BroadcasterPage;
