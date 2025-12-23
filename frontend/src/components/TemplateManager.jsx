import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import { FaPaste, FaEdit, FaTrash } from 'react-icons/fa';
import Modal from './Modal';
import { updateTemplate, deleteTemplate } from '../services/api';

const Container = styled.div`
    background: #fff;
    padding: 1.5rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
`;

const Title = styled.h3`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const SearchInput = styled.input`
    width: 100%;
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    margin-bottom: 1rem;
`;

const TemplateList = styled.ul`
    list-style: none;
    max-height: 250px;
    overflow-y: auto;
`;

const TemplateItem = styled.li`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    &:hover {
        background-color: ${({ theme }) => theme.background};
    }
`;

const ItemName = styled.span`
    flex-grow: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const ActionsContainer = styled.div`
    display: flex;
    gap: 0.75rem;
    color: ${({ theme }) => theme.lightText};
    padding-left: 1rem;
    
    svg {
        &:hover {
            color: ${({ theme }) => theme.primary};
        }
    }
`;

const ModalForm = styled.div`
    h2 { margin-bottom: 1.5rem; }
    input, textarea {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid ${({ theme }) => theme.border};
        border-radius: 4px;
        margin-bottom: 1rem;
        font-family: inherit;
        font-size: 1rem;
    }
    textarea { min-height: 120px; }
    button {
        width: 100%;
        background-color: ${({ theme }) => theme.primary};
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }
`;

const TemplateManager = ({ templates, onTemplateSelect, onTemplatesUpdate }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const handleEditClick = (template) => {
        setEditingTemplate({ ...template });
        setIsModalOpen(true);
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
        const hasContent = editingTemplate.text || editingTemplate.upload_id;
        if (!editingTemplate.name || !hasContent) {
            alert('Name and either text or an attachment are required.');
            return;
        }
        try {
            await updateTemplate(editingTemplate.id, { 
                name: editingTemplate.name, 
                text: editingTemplate.text,
                upload_id: editingTemplate.attachment ? editingTemplate.attachment.id : null
            });
            setIsModalOpen(false);
            onTemplatesUpdate();
        } catch (error)
        {
            console.error('Failed to update template:', error);
            alert('Failed to update template.');
        }
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
                <SearchInput
                    type="text"
                    placeholder="Search templates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <TemplateList>
                    {filteredTemplates.map(template => (
                        <TemplateItem key={template.id}>
                            <ItemName onClick={() => onTemplateSelect(template)} title={template.name}>
                                {template.name}
                            </ItemName>
                            <ActionsContainer>
                                <FaEdit onClick={(e) => { e.stopPropagation(); handleEditClick(template); }} />
                                <FaTrash onClick={(e) => { e.stopPropagation(); handleDelete(template.id, template.name); }} />
                            </ActionsContainer>
                        </TemplateItem>
                    ))}
                </TemplateList>
            </Container>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                {editingTemplate && (
                    <ModalForm>
                        <h2>Edit Template</h2>
                        <input
                            type="text"
                            value={editingTemplate.name}
                            onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                            placeholder="Template Name"
                        />
                        <textarea
                            value={editingTemplate.text}
                            onChange={(e) => setEditingTemplate({ ...editingTemplate, text: e.target.value })}
                            placeholder="Template Message/Caption"
                        />
                        {/* Note: Editing the attachment directly here is complex. For now, users can create a new template if they need to change the attachment. */}
                        <button onClick={handleSaveChanges}>Save Changes</button>
                    </ModalForm>
                )}
            </Modal>
        </>
    );
};

export default TemplateManager;