import React, { useState, useEffect, useCallback, useRef } from "react";
import styled from "styled-components";
import { io } from "socket.io-client";
import api, { getBatches, getTemplates } from "../services/api";
import BatchManager from "../components/BatchManager";
import GroupSelector from "../components/GroupSelector";
import BroadcastForm from "../components/BroadcastForm";
import TemplateManager from "../components/TemplateManager";
import BroadcastProgressModal from "../components/BroadcastProgressModal";
import AttachmentManagerModal from "../components/AttachmentManagerModal"; // Import the new modal


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
      const [batchesRes, templatesRes] = await Promise.all([getBatches(), getTemplates()]);
      setBatches(batchesRes.data || []);
      setTemplates(templatesRes.data || []);
    } catch (error) {
      console.error("Error fetching broadcaster data:", error);
    }
  }, []);

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
    if (
      !window.confirm(
        "This will fetch the latest group list from WhatsApp and update the database. Groups you have left will be removed. Continue?"
      )
    ) {
      return;
    }
    setIsSyncing(true);
    try {
      const { data } = await api.post("/groups/sync");
      alert(data.message);
      window.location.reload();
    } catch (error) {
      console.error("Failed to sync groups:", error);
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
          <BatchManager
            batches={batches}
            onBatchSelect={handleBatchSelect}
            onBatchEdit={handleBatchEdit}
            onBatchesUpdate={handleDataUpdate}
          />
          <GroupSelector onBatchUpdate={handleDataUpdate} {...{allGroups, selectedGroups, setSelectedGroups, editingBatch, setEditingBatch, onSync, isSyncing}}/>
        </LeftPanel>

        <RightPanel>
          <TemplateManager 
            templates={templates} 
            onTemplateSelect={handleTemplateSelect} 
            onTemplatesUpdate={handleDataUpdate} 
          />
          <BroadcastForm
            onTemplateSave={handleDataUpdate}
            onOpenAttachmentManager={() => setIsAttachmentModalOpen(true)}
            {...{selectedGroupIds: Array.from(selectedGroups), allGroups, message, setMessage, attachment, setAttachment, onBroadcastStart: startBroadcast, isBroadcasting}}
          />
        </RightPanel>
      </MainContent>
      <BroadcastProgressModal {...{isOpen: isBroadcasting, onClose: () => setIsBroadcasting(false), logs: broadcastLogs, summary: broadcastSummary, isComplete: isBroadcastComplete}} />
      <AttachmentManagerModal
        isOpen={isAttachmentModalOpen}
        onClose={() => setIsAttachmentModalOpen(false)}
        onSelect={handleSelectAttachment}
      />
    </>
  );
};

export default BroadcasterPage;