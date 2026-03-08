import React, { useRef, useState } from "react";
import styled from "styled-components";
import { createTemplate, uploadBroadcastAttachment } from "../services/api";
import {
  FaFile,
  FaFilePdf,
  FaFolderOpen,
  FaImage,
  FaPaperclip,
  FaTimesCircle,
} from "react-icons/fa";

const Container = styled.section`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.surface};
  padding: 0.65rem;
  min-height: 0;
`;

const Title = styled.h3`
  margin: 0 0 0.45rem;
  font-size: 0.95rem;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 170px;
  resize: vertical;
  font-size: 0.83rem;
  line-height: 1.35;
`;

const AttachmentPreview = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.surfaceAlt};
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
`;

const FileInfo = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;

  .icon {
    font-size: 1.15rem;
    color: ${({ theme }) => theme.primarySoft};
  }

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.78rem;
  }
`;

const RemoveButton = styled.button`
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  color: ${({ theme }) => theme.error};
`;

const HiddenInput = styled.input.attrs({ type: "file" })`
  display: none;
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;
`;

const ControlButton = styled.button`
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surfaceAlt};
  font-size: 0.75rem;
  min-height: 28px;
  padding: 0.24rem 0.55rem;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-weight: 700;
`;

const TemplateRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.4rem;
`;

const TemplateInput = styled.input`
  width: 100%;
`;

const SendButton = styled.button`
  border: 1px solid transparent;
  border-radius: 8px;
  min-height: 32px;
  background: ${({ theme, disabled }) => (disabled ? theme.lightText : theme.secondary)};
  color: #fff;
  font-size: 0.8rem;
  font-weight: 800;
  width: 100%;
`;

const BroadcastForm = ({
  selectedGroupIds,
  allGroups,
  message,
  setMessage,
  attachment,
  setAttachment,
  onTemplateSave,
  onBroadcastStart,
  isBroadcasting,
  onOpenAttachmentManager,
  canSendBroadcast,
  canCreateTemplates,
  canUploadAttachments,
  canViewAttachments,
}) => {
  const [templateName, setTemplateName] = useState("");
  const fileInputRef = useRef(null);

  const canSend = (message && !attachment) || attachment;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSendBroadcast || !canSend || selectedGroupIds.length === 0 || isBroadcasting) return;

    if (window.confirm(`You are about to send this content to ${selectedGroupIds.length} groups. Proceed?`)) {
      const groupObjects = allGroups.filter((group) => selectedGroupIds.includes(group.id));
      onBroadcastStart(groupObjects, message, attachment);
    }
  };

  const handleFileUpload = async (event) => {
    if (!canUploadAttachments) return;
    const file = event.target.files[0];
    if (!file) return;

    try {
      const { data } = await uploadBroadcastAttachment(file);
      setAttachment(data);
    } catch (_error) {
      alert("File upload failed.");
    }
  };

  const handleSaveTemplate = async () => {
    const hasContent = message || attachment;
    if (!templateName || !hasContent) {
      alert("Please enter a template name and provide a message or an attachment.");
      return;
    }

    try {
      const payload = {
        name: templateName,
        text: message,
        upload_id: attachment ? attachment.id : null,
      };
      await createTemplate(payload);
      alert(`Template \"${templateName}\" saved.`);
      setTemplateName("");
      onTemplateSave();
    } catch (_error) {
      alert("Failed to save template.");
    }
  };

  const getFileIcon = (mimetype) => {
    if (mimetype.startsWith("image/")) return <FaImage className="icon" />;
    if (mimetype === "application/pdf") return <FaFilePdf className="icon" />;
    return <FaFile className="icon" />;
  };

  return (
    <Container>
      <Title>Compose Broadcast</Title>
      <Form onSubmit={handleSubmit}>
        <TextArea
          placeholder={
            attachment
              ? "Add a caption (optional)..."
              : "Type your message here, or attach a file..."
          }
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={isBroadcasting}
        />

        {attachment && (
          <AttachmentPreview>
            <FileInfo>
              {getFileIcon(attachment.mimetype)}
              <span>{attachment.original_filename}</span>
            </FileInfo>
            {(canUploadAttachments || canViewAttachments) && (
              <RemoveButton type="button" onClick={() => setAttachment(null)} title="Remove attachment">
                <FaTimesCircle />
              </RemoveButton>
            )}
          </AttachmentPreview>
        )}

        {(canUploadAttachments || canViewAttachments) && (
          <Controls>
            <HiddenInput ref={fileInputRef} onChange={handleFileUpload} />
            {canUploadAttachments && (
              <ControlButton type="button" onClick={() => fileInputRef.current?.click()}>
                <FaPaperclip /> Attach New
              </ControlButton>
            )}
            {canViewAttachments && (
              <ControlButton type="button" onClick={onOpenAttachmentManager}>
                <FaFolderOpen /> Use Existing
              </ControlButton>
            )}
          </Controls>
        )}

        {canCreateTemplates && (
          <TemplateRow>
            <TemplateInput
              type="text"
              placeholder="New template name..."
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />
            <ControlButton
              type="button"
              disabled={!templateName || (!message && !attachment)}
              onClick={handleSaveTemplate}
            >
              Save Template
            </ControlButton>
          </TemplateRow>
        )}

        <SendButton
          type="submit"
          disabled={!canSendBroadcast || !canSend || selectedGroupIds.length === 0 || isBroadcasting}
        >
          {isBroadcasting
            ? "Broadcasting..."
            : canSendBroadcast
              ? `Send to ${selectedGroupIds.length} Groups`
              : "Permission Denied"}
        </SendButton>
      </Form>
    </Container>
  );
};

export default BroadcastForm;
