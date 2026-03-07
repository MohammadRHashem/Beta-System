import React, { useState, useEffect, useCallback, useRef } from "react";
import styled from "styled-components";
import { io } from "socket.io-client";
import api, {
  cancelBroadcastJob,
  deleteBroadcastForEveryone,
  editBroadcastJobMessage,
  getBatches,
  getBroadcastJobById,
  getBroadcastJobs,
  getTemplates,
  pauseBroadcastJob,
  replayBroadcastJob,
  resumeBroadcastJob,
  retryFailedBroadcastJob,
  startBroadcastJob,
} from "../services/api";
import { usePermissions } from "../context/PermissionContext";

import BatchManager from "../components/BatchManager";
import GroupSelector from "../components/GroupSelector";
import BroadcastForm from "../components/BroadcastForm";
import TemplateManager from "../components/TemplateManager";
import AttachmentManagerModal from "../components/AttachmentManagerModal";
import BroadcastJobsPanel from "../components/BroadcastJobsPanel";

const MainContent = styled.div`
  display: grid;
  grid-template-columns: minmax(320px, 390px) 1fr;
  gap: 1.5rem;
  align-items: flex-start;
  height: 100%;
  min-height: 0;
  overflow: hidden;

  @media (max-width: 1400px) and (min-width: 1201px) {
    grid-template-columns: minmax(300px, 360px) 1fr;
  }

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
`;

const LeftPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-height: 0;
  overflow: auto;
`;

const RightPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-height: 0;
  overflow: auto;
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

  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [batches, setBatches] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [editingBatch, setEditingBatch] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);

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

  const loadGroupsForBatch = async (batchId) => {
    if (!batchId) {
      setSelectedGroups(new Set());
      return;
    }
    try {
      const { data: groupIds } = await api.get(`/batches/${batchId}`);
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
    if (!window.confirm("This will fetch the latest group list... Continue?")) return;
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
    withJobAction(
      jobId,
      "pause",
      () => pauseBroadcastJob(jobId),
      `Pause requested for job #${jobId}.`,
    );

  const handleResumeJob = (jobId) =>
    withJobAction(
      jobId,
      "resume",
      () => resumeBroadcastJob(jobId),
      `Resume requested for job #${jobId}.`,
    );

  const handleCancelJob = (jobId) => {
    if (!window.confirm(`Cancel broadcast job #${jobId}?`)) return Promise.resolve(null);
    return withJobAction(
      jobId,
      "cancel",
      () => cancelBroadcastJob(jobId),
      `Cancel requested for job #${jobId}.`,
    );
  };

  const handleRetryJob = (jobId) =>
    withJobAction(
      jobId,
      "retry",
      () => retryFailedBroadcastJob(jobId),
      `Retry failed targets requested for job #${jobId}.`,
    );

  const handleReplayJob = async (jobId) => {
    const result = await withJobAction(
      jobId,
      "replay",
      () => replayBroadcastJob(jobId, socketId),
      `Replay requested for job #${jobId}.`,
    );
    const replayJobId = result?.data?.job?.id;
    if (replayJobId) {
      setSelectedJobId(replayJobId);
      await fetchJobDetails(replayJobId);
    }
  };

  const handleDeleteForEveryone = (jobId) => {
    if (
      !window.confirm(
        `Delete broadcasted messages for everyone for sent targets in job #${jobId}?`,
      )
    ) {
      return Promise.resolve(null);
    }
    return withJobAction(
      jobId,
      "delete",
      () => deleteBroadcastForEveryone(jobId),
      `Delete-for-everyone finished for job #${jobId}.`,
    );
  };

  const handleEditSentMessage = (jobId) => {
    const messageText = String(jobEditDrafts[jobId] || "").trim();
    if (!messageText) {
      alert("Please enter the edited message text first.");
      return Promise.resolve(null);
    }
    return withJobAction(
      jobId,
      "edit",
      () => editBroadcastJobMessage(jobId, messageText),
      `Edit-sent-message finished for job #${jobId}.`,
    );
  };

  const handleTemplateSelect = (template) => {
    setMessage(template.text || "");
    setAttachment(template.attachment || null);
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
      <MainContent>
        <LeftPanel>
          {canViewBatches && (
            <BatchManager
              batches={batches}
              onBatchSelect={handleBatchSelect}
              onBatchEdit={handleBatchEdit}
              onBatchesUpdate={handleDataUpdate}
              canEditBatch={canUpdateBatches}
              canDeleteBatch={canDeleteBatches}
            />
          )}
          <GroupSelector
            allGroups={allGroups}
            selectedGroups={selectedGroups}
            setSelectedGroups={setSelectedGroups}
            editingBatch={editingBatch}
            setEditingBatch={setEditingBatch}
            onBatchUpdate={handleDataUpdate}
            onSync={handleSyncGroups}
            isSyncing={isSyncing}
            canCreateBatch={canCreateBatches}
            canEditBatch={canUpdateBatches}
            canSyncGroups={hasPermission("admin:manage_roles")}
          />
        </LeftPanel>

        <RightPanel>
          {canViewTemplates && (
            <TemplateManager
              templates={templates}
              onTemplateSelect={handleTemplateSelect}
              onTemplatesUpdate={handleDataUpdate}
              canEditTemplate={canUpdateTemplates}
              canDeleteTemplate={canDeleteTemplates}
              canViewAttachments={canViewAttachments}
              canUploadAttachments={canCreateAttachments}
              canDeleteAttachments={canDeleteAttachments}
            />
          )}

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

          {canViewJobs && (
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
        </RightPanel>
      </MainContent>

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
