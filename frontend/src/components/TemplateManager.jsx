import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import { FaPaste, FaEdit, FaTrash, FaPaperclip, FaFolderOpen, FaTimesCircle, FaImage, FaFilePdf, FaFile } from 'react-icons/fa';
import Modal from './Modal';
import AttachmentManagerModal from './AttachmentManagerModal';
import { updateTemplate, deleteTemplate } from '../services/api';

const Container = styled.div` background: #fff; padding: 1.5rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 8px; `;
const Title = styled.h3` display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; `;
const SearchInput = styled.input` width: 100%; padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; margin-bottom: 1rem; `;
const TemplateList = styled.ul` list-style: none; max-height: 250px; overflow-y: auto; `;
const TemplateItem = styled.li` display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-radius: 4px; cursor: pointer; font-weight: 500; &:hover { background-color: ${({ theme }) => theme.background}; } `;
const ItemName = styled.span` flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; `;
const ActionsContainer = styled.div` display: flex; gap: 0.75rem; color: ${({ theme }) => theme.lightText}; padding-left: 1rem; svg { &:hover { color: ${({ theme }) => theme.primary}; } } `;
const ModalForm = styled.div` display: flex; flex-direction: column; gap: 1rem; `;
const InputGroup = styled.div` display: flex; flex-direction: column; gap: 0.5rem; `;
const Label = styled.label` font-weight: 500; `;
const Input = styled.input` width: 100%; padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; font-family: inherit; font-size: 1rem; `;
const Textarea = styled.textarea` width: 100%; padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; min-height: 120px; font-family: inherit; font-size: 1rem; `;
const SaveButton = styled.button` background-color: ${({ theme }) => theme.primary}; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-weight: bold; align-self: flex-end; `;
const AttachmentPreview = styled.div` padding: 1rem; background: #f6f9fc; border: 1px solid ${({ theme }) => theme.border}; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; `;
const FileInfo = styled.div` display: flex; align-items: center; gap: 1rem; .icon { font-size: 2rem; color: #666; } `;
const RemoveButton = styled(FaTimesCircle)` cursor: pointer; color: #999; &:hover { color: ${({ theme }) => theme.error}; } `;
const AttachmentControls = styled.div` display: flex; gap: 1rem; `;
const ControlButton = styled.button` display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1rem; border: 1px solid ${({ theme }) => theme.border}; background: #fff; border-radius: 4px; font-weight: 600; cursor: pointer; &:hover { background: #f9f9f9; } `;

// 1. ACCEPT THE NEW PERMISSION PROP
const TemplateManager = ({ templates, onTemplateSelect, onTemplatesUpdate, canManageTemplates }) => {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const handleEditClick = (template) => {
        setEditingTemplate({ ...template });
        setIsEditModalOpen(true);
    };

    const handleDelete = async (templateId, templateName) => {
        if (window.confirm(`Are you sure you want to delete the template "${templateName}"?`)) {
            try {
                await deleteTemplate(templateId);
                alert('Template deleted successfully.');
                onTemplatesUpdate();
            } catch (error) {
                console.error('Failed to delete template:', error);
                alert('Failed to delete template.');
            }
        }
    };

    const handleSaveChanges = async () => {
        const hasContent = editingTemplate.text || editingTemplate.attachment;
        if (!editingTemplate.name || !hasContent) {
            alert('Template name and either a message or an attachment are required.');
            return;
        }
        try {
            const payload = {
                name: editingTemplate.name,
                text: editingTemplate.text || '',
                upload_id: editingTemplate.attachment ? editingTemplate.attachment.id : null,
            };
            await updateTemplate(editingTemplate.id, payload);
            setIsEditModalOpen(false);
            onTemplatesUpdate();
        } catch (error) {
            console.error('Failed to update template:', error);
            alert('Failed to update template.');
        }
    };

    const handleSelectAttachment = (selectedFile) => {
        setEditingTemplate(prev => ({ ...prev, attachment: selectedFile }));
        setIsAttachmentModalOpen(false);
    };

    const getFileIcon = (mimetype) => {
        if (!mimetype) return <FaFile className="icon" />;
        if (mimetype.startsWith('image/')) return <FaImage className="icon" />;
        if (mimetype === 'application/pdf') return <FaFilePdf className="icon" color="#B30B00" />;
        return <FaFile className="icon" />;
    };

    const filteredTemplates = useMemo(() => {
        return (templates || []).filter(template =>
            template.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [templates, searchTerm]);


    return (
        <>
            <Container>
                <Title><FaPaste /> Use Template</Title>
                <SearchInput type="text" placeholder="Search templates..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <TemplateList>
                    {filteredTemplates.map(template => (
                        <TemplateItem key={template.id} onClick={() => onTemplateSelect(template)}>
                            <ItemName title={template.name}>
                                {template.name}
                            </ItemName>
                            {/* 2. WRAP ACTIONS IN PERMISSION CHECK */}
                            {canManageTemplates && (
                                <ActionsContainer>
                                    <FaEdit onClick={(e) => { e.stopPropagation(); handleEditClick(template); }} title="Edit"/>
                                    <FaTrash onClick={(e) => { e.stopPropagation(); handleDelete(template.id, template.name); }} title="Delete"/>
                                </ActionsContainer>
                            )}
                        </TemplateItem>
                    ))}
                </TemplateList>
            </Container>
            
            {/* Modal is implicitly protected */}
            {canManageTemplates && (
                <>
                    <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} maxWidth="600px">
                        {editingTemplate && (
                            <ModalForm>
                                <h2>Edit Template</h2>
                                <InputGroup>
                                    <Label>Template Name</Label>
                                    <Input type="text" value={editingTemplate.name} onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })} />
                                </InputGroup>
                                <InputGroup>
                                    <Label>Message / Caption</Label>
                                    <Textarea value={editingTemplate.text || ''} onChange={(e) => setEditingTemplate({ ...editingTemplate, text: e.target.value })} />
                                </InputGroup>

                                <InputGroup>
                                    <Label>Attachment</Label>
                                    {editingTemplate.attachment ? (
                                        <AttachmentPreview>
                                            <FileInfo>
                                                {getFileIcon(editingTemplate.attachment.mimetype)}
                                                <span>{editingTemplate.attachment.original_filename}</span>
                                            </FileInfo>
                                            <RemoveButton onClick={() => setEditingTemplate({ ...editingTemplate, attachment: null })} />
                                        </AttachmentPreview>
                                    ) : (
                                        <p>No attachment linked.</p>
                                    )}
                                    <AttachmentControls>
                                        <ControlButton type="button" onClick={() => setIsAttachmentModalOpen(true)}>
                                            {editingTemplate.attachment ? <><FaEdit/> Change</> : <><FaPaperclip/> Add</>} Attachment
                                        </ControlButton>
                                    </AttachmentControls>
                                </InputGroup>
                                
                                <SaveButton type="button" onClick={handleSaveChanges}>Save Changes</SaveButton>
                            </ModalForm>
                        )}
                    </Modal>

                    <AttachmentManagerModal
                        isOpen={isAttachmentModalOpen}
                        onClose={() => setIsAttachmentModalOpen(false)}
                        onSelect={handleSelectAttachment}
                    />
                </>
            )}
        </>
    );
};

export default TemplateManager;