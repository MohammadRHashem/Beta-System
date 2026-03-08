import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import Modal from "./Modal";
import {
  deleteBroadcastUpload,
  getBroadcastUploads,
  uploadBroadcastAttachment,
} from "../services/api";
import { FaCheckCircle, FaFile, FaFilePdf, FaImage, FaTrash, FaUpload } from "react-icons/fa";

const Gallery = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 0.5rem;
  max-height: 58vh;
  overflow: auto;
  padding: 0.45rem;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.surfaceAlt};
`;

const FileCard = styled.button`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.surface};
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  padding: 0;
`;

const FilePreview = styled.div`
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.2rem;
  color: ${({ theme }) => theme.lightText};
  border-bottom: 1px solid ${({ theme }) => theme.border};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const FileName = styled.span`
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.4rem;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CardActions = styled.div`
  display: flex;
  gap: 0.3rem;
  justify-content: center;
  padding: 0 0.35rem 0.4rem;
`;

const ActionButton = styled.button`
  border-radius: 6px;
  border: 1px solid ${({ theme, $danger }) => ($danger ? theme.error : theme.border)};
  background: ${({ theme, $danger }) => ($danger ? theme.error : theme.secondary)};
  color: #fff;
  min-height: 24px;
  padding: 0.15rem 0.42rem;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.7rem;
  font-weight: 700;
`;

const UploadRow = styled.div`
  margin-top: 0.55rem;
  border-top: 1px solid ${({ theme }) => theme.border};
  padding-top: 0.55rem;
`;

const HiddenInput = styled.input.attrs({ type: "file" })`
  display: none;
`;

const UploadButton = styled.button`
  width: 100%;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.primary};
  color: #fff;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  font-size: 0.76rem;
  font-weight: 800;
`;

const AttachmentManagerModal = ({
  isOpen,
  onClose,
  onSelect,
  canViewAttachments,
  canUploadAttachments,
  canDeleteAttachments,
}) => {
  const [uploads, setUploads] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && canViewAttachments) {
      getBroadcastUploads().then((res) => setUploads(res.data || []));
    } else if (isOpen && !canViewAttachments) {
      setUploads([]);
    }
  }, [isOpen, canViewAttachments]);

  const handleDelete = async (event, id) => {
    event.stopPropagation();
    if (!window.confirm("Are you sure you want to permanently delete this file?")) return;
    await deleteBroadcastUpload(id);
    setUploads((prev) => prev.filter((upload) => upload.id !== id));
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const { data: newUpload } = await uploadBroadcastAttachment(file);
      setUploads((prev) => [newUpload, ...prev]);
      onSelect(newUpload);
    } catch (_error) {
      alert("File upload failed.");
    }
  };

  const getFileIcon = (mimetype) => {
    if (mimetype.startsWith("image/")) return null;
    if (mimetype === "application/pdf") return <FaFilePdf />;
    return <FaFile />;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="860px">
      <h2 style={{ marginTop: 0, marginBottom: "0.52rem" }}>Select or Manage Uploads</h2>
      <Gallery>
        {uploads.map((upload) => {
          const icon = getFileIcon(upload.mimetype);
          const canPreviewImage =
            upload.mimetype.startsWith("image/") && typeof upload.url === "string" && upload.url.length > 0;

          return (
            <FileCard key={upload.id} type="button" onClick={() => onSelect(upload)}>
              <FilePreview>
                {canPreviewImage ? <img src={upload.url} alt={upload.original_filename} /> : icon || <FaImage />}
              </FilePreview>
              <FileName title={upload.original_filename}>{upload.original_filename}</FileName>
              <CardActions>
                <ActionButton
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(upload);
                  }}
                >
                  <FaCheckCircle /> Select
                </ActionButton>
                {canDeleteAttachments && (
                  <ActionButton type="button" $danger onClick={(event) => handleDelete(event, upload.id)}>
                    <FaTrash /> Delete
                  </ActionButton>
                )}
              </CardActions>
            </FileCard>
          );
        })}
      </Gallery>

      {canUploadAttachments && (
        <UploadRow>
          <HiddenInput ref={fileInputRef} onChange={handleFileSelect} />
          <UploadButton type="button" onClick={() => fileInputRef.current?.click()}>
            <FaUpload /> Upload & Select New File
          </UploadButton>
        </UploadRow>
      )}
    </Modal>
  );
};

export default AttachmentManagerModal;
