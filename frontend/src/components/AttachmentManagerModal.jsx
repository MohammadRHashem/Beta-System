import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import Modal from './Modal';
import { getBroadcastUploads, deleteBroadcastUpload, uploadBroadcastAttachment } from '../services/api';
import { FaImage, FaFilePdf, FaFile, FaTrash, FaCheckCircle, FaUpload } from 'react-icons/fa';

const Gallery = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
    max-height: 60vh;
    overflow-y: auto;
    padding: 1rem;
    background: #f9f9f9;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
`;
const FileCard = styled.div`
    position: relative;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    background: #fff;
    overflow: hidden;
    cursor: pointer;
    &:hover .overlay {
        opacity: 1;
    }
`;
const FilePreview = styled.div`
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
    color: #ccc;
    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
`;
const FileName = styled.p`
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0.5rem;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;
const Overlay = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.6);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    opacity: 0;
    transition: opacity 0.2s;
`;
const ActionButton = styled.button`
    background: ${props => props.color || '#fff'};
    color: ${props => props.textColor || '#333'};
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
`;
const UploadButtonContainer = styled.div`
    margin-top: 1rem;
    border-top: 1px solid ${({ theme }) => theme.border};
    padding-top: 1rem;
`;
const HiddenInput = styled.input.attrs({ type: 'file' })`
    display: none;
`;
const Button = styled.button`
    background-color: ${({ theme }) => theme.primary};
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    justify-content: center;
    &:hover {
        opacity: 0.9;
    }
`;

// 1. ACCEPT THE NEW PERMISSION PROP
const AttachmentManagerModal = ({ isOpen, onClose, onSelect, canManageAttachments }) => {
    const [uploads, setUploads] = useState([]);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            getBroadcastUploads().then(res => setUploads(res.data || []));
        }
    }, [isOpen]);

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to permanently delete this file?')) {
            await deleteBroadcastUpload(id);
            setUploads(uploads.filter(u => u.id !== id));
        }
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const { data: newUpload } = await uploadBroadcastAttachment(file);
            const updatedUploads = [newUpload, ...uploads];
            setUploads(updatedUploads);
            onSelect(newUpload); // Also select the newly uploaded file
        } catch (error) {
            alert('File upload failed.');
        }
    };

    const getFileIcon = (mimetype) => {
        if (mimetype.startsWith('image/')) return null;
        if (mimetype === 'application/pdf') return <FaFilePdf color="#B30B00" />;
        return <FaFile />;
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="800px">
            <h2>Select or Manage Uploads</h2>
            <Gallery>
                {uploads.map(upload => {
                    const icon = getFileIcon(upload.mimetype);
                    const canPreviewImage = upload.mimetype.startsWith('image/') && typeof upload.url === 'string' && upload.url.length > 0;
                    
                    return (
                        <FileCard key={upload.id} onClick={() => onSelect(upload)}>
                            <FilePreview>
                                {canPreviewImage ? <img src={`https://platform.betaserver.dev${upload.url}`} alt={upload.original_filename} /> : icon}
                            </FilePreview>
                            <FileName title={upload.original_filename}>{upload.original_filename}</FileName>
                            <Overlay className="overlay">
                                <ActionButton color="#00C49A" textColor="#fff" onClick={(e) => { e.stopPropagation(); onSelect(upload); }}><FaCheckCircle/> Select</ActionButton>
                                {/* 2. WRAP THE DELETE BUTTON IN PERMISSION CHECK */}
                                {canManageAttachments && (
                                    <ActionButton color="#DE350B" textColor="#fff" onClick={(e) => handleDelete(e, upload.id)}><FaTrash/> Delete</ActionButton>
                                )}
                            </Overlay>
                        </FileCard>
                    );
                })}
            </Gallery>
            {/* 3. WRAP THE UPLOAD SECTION IN PERMISSION CHECK */}
            {canManageAttachments && (
                <UploadButtonContainer>
                    <HiddenInput ref={fileInputRef} onChange={handleFileSelect} />
                    <Button onClick={() => fileInputRef.current.click()}><FaUpload/> Upload & Select New File</Button>
                </UploadButtonContainer>
            )}
        </Modal>
    );
};

export default AttachmentManagerModal;