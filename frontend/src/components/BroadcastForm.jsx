import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import api, { createTemplate } from '../services/api';
import { FaPaperclip, FaFolderOpen, FaTimesCircle, FaImage, FaFilePdf, FaFile } from 'react-icons/fa';

const FormContainer = styled.div` background: #fff; padding: 1.5rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 8px; `;
const TextArea = styled.textarea` width: 100%; min-height: 150px; padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; font-family: inherit; font-size: 1rem; `;
const SendButton = styled.button` background-color: ${({ theme, disabled }) => disabled ? theme.lightText : theme.secondary}; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'}; font-weight: bold; font-size: 1rem; width: 100%; transition: background-color 0.2s; &:hover { opacity: ${({ disabled }) => disabled ? 1 : 0.9}; } `;

const AttachmentControls = styled.div`
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid ${({ theme }) => theme.border};
`;

const ControlButton = styled.button`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    border: 1px solid ${({ theme }) => theme.border};
    background: #fff;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    &:hover { background: #f9f9f9; }
`;

const HiddenInput = styled.input.attrs({ type: 'file' })` display: none; `;
const AttachmentPreview = styled.div`
    margin-top: 1rem;
    padding: 1rem;
    background: #f6f9fc;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
`;
const FileInfo = styled.div` display: flex; align-items: center; gap: 1rem; .icon { font-size: 2rem; color: #666; } `;
const RemoveButton = styled(FaTimesCircle)` cursor: pointer; color: #999; &:hover { color: ${({ theme }) => theme.error}; } `;

const ResultMessage = styled.p`
    margin-top: 1rem;
    padding: 1rem;
    border-radius: 4px;
    background-color: ${({ theme, type }) => type === 'success' ? '#e6fff9' : '#ffebe6'};
    color: ${({ theme, type }) => type === 'success' ? theme.success : theme.error};
    border: 1px solid ${({ theme, type }) => type === 'success' ? theme.success : theme.error};
`;

const TemplateSaveContainer = styled.div`
    margin-top: 1rem;
    display: flex;
    gap: 0.5rem;
`;

const TemplateInput = styled.input`
    flex-grow: 1;
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
`;

const SaveTemplateButton = styled.button`
    background-color: ${({ theme, disabled }) => disabled ? theme.lightText : theme.primary};
    color: white;
    border: none;
    padding: 0.6rem 1rem;
    border-radius: 4px;
    cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
    font-weight: bold;
`;

const BroadcastForm = ({ selectedGroupIds, allGroups, message, setMessage, attachment, setAttachment, onTemplateSave, onBroadcastStart, isBroadcasting, onOpenAttachmentManager }) => {
    const [templateName, setTemplateName] = useState('');
    const fileInputRef = useRef(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const hasContent = (message && !attachment) || attachment;
        if (!hasContent || selectedGroupIds.length === 0 || isBroadcasting) return;

        if (window.confirm(`You are about to send this content to ${selectedGroupIds.length} groups. Proceed?`)) {
            const groupObjects = allGroups.filter(g => selectedGroupIds.includes(g.id));
            
            // === THIS IS THE FIX: Use the 'attachment' prop directly ===
            onBroadcastStart(groupObjects, message, attachment);
            // ==========================================================
        }
    };
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const { data } = await uploadBroadcastAttachment(file);
            setAttachment(data);
        } catch (error) {
            alert('File upload failed.');
        }
    };

    const getFileIcon = (mimetype) => {
        if (mimetype.startsWith('image/')) return <FaImage className="icon" />;
        if (mimetype === 'application/pdf') return <FaFilePdf className="icon" color="#B30B00" />;
        return <FaFile className="icon" />;
    };

    const canSend = (message && !attachment) || attachment;

    const handleSaveTemplate = async () => {
        if (!templateName || !message) {
            alert('Please enter a template name and a message.');
            return;
        }
        try {
            await createTemplate({ name: templateName, text: message });
            alert(`Template "${templateName}" saved!`);
            setTemplateName('');
            onTemplateSave(); // This function from App.jsx will refresh the template list
        } catch (error) {
            console.error('Error saving template:', error);
            alert('Failed to save template.');
        }
    };

    return (
        <FormContainer>
            <h3>Compose Message</h3>
            <form onSubmit={handleSubmit}>
                <TextArea
                    placeholder={attachment ? "Add a caption (optional)..." : "Type your message here, or attach a file..."}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={isBroadcasting}
                />
                
                {attachment && (
                    <AttachmentPreview>
                        <FileInfo>
                            {getFileIcon(attachment.mimetype)}
                            <span>{attachment.original_filename}</span>
                        </FileInfo>
                        <RemoveButton onClick={() => setAttachment(null)} />
                    </AttachmentPreview>
                )}

                <AttachmentControls>
                    <HiddenInput ref={fileInputRef} onChange={handleFileUpload} />
                    <ControlButton type="button" onClick={() => fileInputRef.current.click()}><FaPaperclip/> Attach New</ControlButton>
                    <ControlButton type="button" onClick={onOpenAttachmentManager}><FaFolderOpen/> Use Existing</ControlButton>
                </AttachmentControls>

                <SendButton
                    type="submit"
                    disabled={!canSend || selectedGroupIds.length === 0 || isBroadcasting}
                    style={{ marginTop: '1.5rem' }}
                >
                    {isBroadcasting ? 'Broadcasting...' : `Send to ${selectedGroupIds.length} Groups`}
                </SendButton>
            </form>
        </FormContainer>
    );
};

export default BroadcastForm;