import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import { createTemplate, uploadBroadcastAttachment } from '../services/api';
import { FaPaperclip, FaFolderOpen, FaTimesCircle, FaImage, FaFilePdf, FaFile } from 'react-icons/fa';

const FormContainer = styled.div` background: #fff; padding: 1.5rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 8px; `;
const TextArea = styled.textarea` width: 100%; min-height: 150px; padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; font-family: inherit; font-size: 1rem; `;
const SendButton = styled.button` background-color: ${({ theme, disabled }) => disabled ? theme.lightText : theme.secondary}; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'}; font-weight: bold; font-size: 1rem; width: 100%; transition: background-color 0.2s; &:hover { opacity: ${({ disabled }) => disabled ? 1 : 0.9}; } `;
const AttachmentControls = styled.div` display: flex; gap: 1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid ${({ theme }) => theme.border}; `;
const ControlButton = styled.button` display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1rem; border: 1px solid ${({ theme }) => theme.border}; background: #fff; border-radius: 4px; font-weight: 600; cursor: pointer; &:hover { background: #f9f9f9; } `;
const HiddenInput = styled.input.attrs({ type: 'file' })` display: none; `;
const AttachmentPreview = styled.div` margin-top: 1rem; padding: 1rem; background: #f6f9fc; border: 1px solid ${({ theme }) => theme.border}; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; `;
const FileInfo = styled.div` display: flex; align-items: center; gap: 1rem; .icon { font-size: 2rem; color: #666; } `;
const RemoveButton = styled(FaTimesCircle)` cursor: pointer; color: #999; &:hover { color: ${({ theme }) => theme.error}; } `;
const TemplateSaveContainer = styled.div` margin-top: 1rem; display: flex; gap: 0.5rem; `;
const TemplateInput = styled.input` flex-grow: 1; padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; `;
const SaveTemplateButton = styled.button` background-color: ${({ theme, disabled }) => disabled ? theme.lightText : theme.primary}; color: white; border: none; padding: 0.6rem 1rem; border-radius: 4px; cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'}; font-weight: bold; `;

// 1. ACCEPT THE NEW PERMISSION PROPS
const BroadcastForm = ({ 
    selectedGroupIds, allGroups, message, setMessage, attachment, setAttachment, 
    onTemplateSave, onBroadcastStart, isBroadcasting, onOpenAttachmentManager,
    canSendBroadcast, canCreateTemplates, canUploadAttachments, canViewAttachments 
}) => {
    const [templateName, setTemplateName] = useState('');
    const fileInputRef = useRef(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Permission check added to guard clause
        if (!canSendBroadcast || !canSend || selectedGroupIds.length === 0 || isBroadcasting) return;

        if (window.confirm(`You are about to send this content to ${selectedGroupIds.length} groups. Proceed?`)) {
            const groupObjects = allGroups.filter(g => selectedGroupIds.includes(g.id));
            onBroadcastStart(groupObjects, message, attachment);
        }
    };

    const handleFileUpload = async (e) => {
        if (!canUploadAttachments) return;
        const file = e.target.files[0];
        if (!file) return;
        try {
            const { data } = await uploadBroadcastAttachment(file);
            setAttachment(data);
        } catch (error) {
            alert('File upload failed.');
        }
    };
    
    const handleSaveTemplate = async () => {
        const hasContent = message || attachment;
        if (!templateName || !hasContent) {
            alert('Please enter a template name and provide either a message or an attachment.');
            return;
        }
        try {
            const payload = { 
                name: templateName, 
                text: message,
                upload_id: attachment ? attachment.id : null
            };
            await createTemplate(payload);
            alert(`Template "${templateName}" saved!`);
            setTemplateName('');
            onTemplateSave();
        } catch (error) {
            console.error('Error saving template:', error);
            alert('Failed to save template.');
        }
    };

    const getFileIcon = (mimetype) => {
        if (mimetype.startsWith('image/')) return <FaImage className="icon" />;
        if (mimetype === 'application/pdf') return <FaFilePdf className="icon" color="#B30B00" />;
        return <FaFile className="icon" />;
    };

    const canSend = (message && !attachment) || attachment;

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
                        {(canUploadAttachments || canViewAttachments) && <RemoveButton onClick={() => setAttachment(null)} />}
                    </AttachmentPreview>
                )}
                
                {/* 2. WRAP ATTACHMENT CONTROLS IN PERMISSION CHECK */}
                {(canUploadAttachments || canViewAttachments) && (
                    <AttachmentControls>
                        <HiddenInput ref={fileInputRef} onChange={handleFileUpload} />
                        {canUploadAttachments && (
                            <ControlButton type="button" onClick={() => fileInputRef.current.click()}><FaPaperclip/> Attach New</ControlButton>
                        )}
                        {canViewAttachments && (
                            <ControlButton type="button" onClick={onOpenAttachmentManager}><FaFolderOpen/> Use Existing</ControlButton>
                        )}
                    </AttachmentControls>
                )}

                {/* 3. WRAP TEMPLATE SAVE SECTION IN PERMISSION CHECK */}
                {canCreateTemplates && (
                    <TemplateSaveContainer>
                        <TemplateInput
                            type="text"
                            placeholder="New template name..."
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                        />
                        <SaveTemplateButton
                            type="button"
                            disabled={!templateName || (!message && !attachment)}
                            onClick={handleSaveTemplate}
                        >
                            Save
                        </SaveTemplateButton>
                    </TemplateSaveContainer>
                )}
                
                {/* 4. UPDATE SEND BUTTON LOGIC */}
                <SendButton
                    type="submit"
                    disabled={!canSendBroadcast || !canSend || selectedGroupIds.length === 0 || isBroadcasting}
                    style={{ marginTop: '1rem' }}
                >
                    {isBroadcasting 
                        ? 'Broadcasting...' 
                        : canSendBroadcast 
                            ? `Send to ${selectedGroupIds.length} Groups` 
                            : 'Permission Denied'}
                </SendButton>
            </form>
        </FormContainer>
    );
};

export default BroadcastForm;
