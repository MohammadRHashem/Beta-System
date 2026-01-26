import React, { useState, useEffect, useCallback, useRef } from "react";
import styled from "styled-components";
import { io } from "socket.io-client";
import api, { getBatches, getTemplates } from "../services/api";
import { usePermissions } from '../context/PermissionContext'; // 1. IMPORT PERMISSIONS HOOK

import BatchManager from "../components/BatchManager";
import GroupSelector from "../components/GroupSelector";
import BroadcastForm from "../components/BroadcastForm";
import TemplateManager from "../components/TemplateManager";
import BroadcastProgressModal from "../components/BroadcastProgressModal";
import AttachmentManagerModal from "../components/AttachmentManagerModal";

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
const API_URL = "https://platform.betaserver.dev:4433";

const BroadcasterPage = ({ allGroups }) => {
  const { hasPermission } = usePermissions(); // 2. GET PERMISSION CHECKER
  const canViewBatches = hasPermission('broadcast:batches:view');
  const canCreateBatches = hasPermission('broadcast:batches:create');
  const canUpdateBatches = hasPermission('broadcast:batches:update');
  const canDeleteBatches = hasPermission('broadcast:batches:delete');
  const canViewTemplates = hasPermission('broadcast:templates:view');
  const canCreateTemplates = hasPermission('broadcast:templates:create');
  const canUpdateTemplates = hasPermission('broadcast:templates:update');
  const canDeleteTemplates = hasPermission('broadcast:templates:delete');
  const canViewAttachments = hasPermission('broadcast:uploads:view');
  const canCreateAttachments = hasPermission('broadcast:uploads:create');
  const canDeleteAttachments = hasPermission('broadcast:uploads:delete');

  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [batches, setBatches] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [editingBatch, setEditingBatch] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);

  const socket = useRef(null);
  const [socketId, setSocketId] = useState(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastLogs, setBroadcastLogs] = useState([]);
  const [broadcastSummary, setBroadcastSummary] = useState({ total: 0, successful: 0, failed: 0 });
  const [isBroadcastComplete, setIsBroadcastComplete] = useState(false);

  useEffect(() => {
    socket.current = io(API_URL, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
    });
    socket.current.on("connect", () => setSocketId(socket.current.id));
    socket.current.on("broadcast:progress", (log) => {
      setBroadcastLogs((prevLogs) => [...prevLogs, log]);
      setBroadcastSummary((prevSummary) => ({
        ...prevSummary,
        successful:
          log.status === "success"
            ? prevSummary.successful + 1
            : prevSummary.successful,
        failed:
          log.status === "failed" ? prevSummary.failed + 1 : prevSummary.failed,
      }));
    });
    socket.current.on("broadcast:complete", (summary) => {
      setBroadcastSummary(summary);
      setIsBroadcastComplete(true);
      setBroadcastLogs((prevLogs) => [
        ...prevLogs,
        { status: "info", message: "--- Broadcast Finished ---" },
      ]);
    });
    socket.current.on("connect_error", (err) =>
      console.error("WebSocket connection error:", err.message)
    );
    return () => {
      socket.current.disconnect();
    };
  }, []);

  const fetchBroadcasterData = useCallback(async () => {
    try {
      // Conditionally fetch data based on permissions
      const promises = [];
      if (canViewBatches) {
          promises.push(getBatches());
      } else {
          promises.push(Promise.resolve({ data: [] })); // Return empty array if no permission
      }
      if (canViewTemplates) {
          promises.push(getTemplates());
      } else {
          promises.push(Promise.resolve({ data: [] })); // Return empty array if no permission
      }

      const [batchesRes, templatesRes] = await Promise.all(promises);
      setBatches(batchesRes.data || []);
      setTemplates(templatesRes.data || []);
    } catch (error) {
      console.error("Error fetching broadcaster data:", error);
    }
  }, [canViewBatches, canViewTemplates]);

  useEffect(() => {
    fetchBroadcasterData();
  }, [fetchBroadcasterData]);

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
    if (!window.confirm("This will fetch the latest group list... Continue?")) {
      return;
    }
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

  const startBroadcast = (groupObjects, broadcastMessage, broadcastAttachment) => {
    setIsBroadcasting(true);
    setIsBroadcastComplete(false);
    setBroadcastLogs([]);
    setBroadcastSummary({ total: groupObjects.length, successful: 0, failed: 0 });

    api.post("/broadcast", {
      groupObjects,
      message: broadcastMessage,
      attachment: broadcastAttachment,
      socketId,
    });
  };

  const handleTemplateSelect = (template) => {
      setMessage(template.text || '');
      setAttachment(template.attachment || null);
  };

  const handleSelectAttachment = (selectedFile) => {
    setAttachment(selectedFile);
    setIsAttachmentModalOpen(false);
  };

  return (
    <>
      <MainContent>
        <LeftPanel>
          {/* 3. WRAP BATCH MANAGEMENT IN PERMISSION CHECK */}
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
            // Pass permission down to hide batch creation UI
            canCreateBatch={canCreateBatches}
            canEditBatch={canUpdateBatches}
            canSyncGroups={hasPermission('admin:manage_roles')} // Example of a high-level permission
          />
        </LeftPanel>
        <RightPanel>
          {/* 4. WRAP TEMPLATE MANAGEMENT IN PERMISSION CHECK */}
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
            isBroadcasting={isBroadcasting}
            onOpenAttachmentManager={() => setIsAttachmentModalOpen(true)}
            // Pass permissions down to hide/disable buttons
            canSendBroadcast={hasPermission('broadcast:send')}
            canCreateTemplates={canCreateTemplates}
            canUploadAttachments={canCreateAttachments}
            canViewAttachments={canViewAttachments}
          />
        </RightPanel>
      </MainContent>
      <BroadcastProgressModal {...{isOpen: isBroadcasting, onClose: () => setIsBroadcasting(false), logs: broadcastLogs, summary: broadcastSummary, isComplete: isBroadcastComplete}} />
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
