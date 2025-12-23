import React, { useState, useEffect } from 'react';
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

const AttachmentManagerModal = ({ isOpen, onClose, onSelect }) => {
    const [uploads, setUploads] = useState([]);
    const fileInputRef = React.useRef(null);

    useEffect(() => {
        if (isOpen) {
            getBroadcastUploads().then(res => setUploads(res.data));
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
            setUploads([newUpload, ...uploads]);
        } catch (error) {
            alert('File upload failed.');
        }
    };

    const getFileIcon = (mimetype) => {
        if (mimetype.startsWith('image/')) return null; // Will show image preview instead
        if (mimetype === 'application/pdf') return <FaFilePdf color="#B30B00" />;
        return <FaFile />;
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="800px">
            <h2>Select or Manage Uploads</h2>
            <Gallery>
                {uploads.map(upload => {
                    const icon = getFileIcon(upload.mimetype);
                    return (
                        <FileCard key={upload.id} onClick={() => onSelect(upload)}>
                            <FilePreview>
                                {icon ? icon : <img src={`https://platform.betaserver.dev${upload.url}`} alt={upload.original_filename} />}
                            </FilePreview>
                            <FileName title={upload.original_filename}>{upload.original_filename}</FileName>
                            <Overlay className="overlay">
                                <ActionButton color="#00C49A" textColor="#fff" onClick={() => onSelect(upload)}><FaCheckCircle/> Select</ActionButton>
                                <ActionButton color="#DE350B" textColor="#fff" onClick={(e) => handleDelete(e, upload.id)}><FaTrash/> Delete</ActionButton>
                            </Overlay>
                        </FileCard>
                    );
                })}
            </Gallery>
            <UploadButtonContainer>
                <HiddenInput ref={fileInputRef} onChange={handleFileSelect} />
                <Button onClick={() => fileInputRef.current.click()} style={{width: '100%', justifyContent: 'center'}}><FaUpload/> Upload New File</Button>
            </UploadButtonContainer>
        </Modal>
    );
};

export default AttachmentManagerModal;