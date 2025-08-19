import React, { useState } from 'react';
import styled from 'styled-components';
import api, { createTemplate } from '../services/api';

const FormContainer = styled.div`
    background: #fff;
    padding: 1.5rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
`;

const TextArea = styled.textarea`
    width: 100%;
    min-height: 150px;
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    margin-bottom: 1rem;
    font-family: inherit;
    font-size: 1rem;
`;

const SendButton = styled.button`
    background-color: ${({ theme, disabled }) => disabled ? theme.lightText : theme.secondary};
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
    font-weight: bold;
    font-size: 1rem;
    width: 100%;
    transition: background-color 0.2s;
    &:hover {
        opacity: ${({ disabled }) => disabled ? 1 : 0.9};
    }
`;

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

const BroadcastForm = ({ selectedGroupIds, allGroups, message, setMessage, onTemplateSave, onBroadcastStart, isBroadcasting }) => {
    const [templateName, setTemplateName] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message || selectedGroupIds.length === 0 || isBroadcasting) return;

        if (window.confirm(`You are about to send a message to ${selectedGroupIds.length} groups. Are you sure you want to proceed?`)) {
            const groupObjects = allGroups.filter(g => selectedGroupIds.includes(g.id));
            onBroadcastStart(groupObjects, message);
        }
    };

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
                    placeholder="Type your message here, or select a template..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={isBroadcasting}
                />
                <TemplateSaveContainer>
                    <TemplateInput
                        type="text"
                        placeholder="New template name..."
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                    />
                    <SaveTemplateButton
                        type="button"
                        disabled={!templateName || !message}
                        onClick={handleSaveTemplate}
                    >
                        Save
                    </SaveTemplateButton>
                </TemplateSaveContainer>
                <SendButton
                    type="submit"
                    disabled={!message || selectedGroupIds.length === 0 || isBroadcasting}
                    style={{ marginTop: '1rem' }}
                >
                    {isBroadcasting ? 'Broadcasting...' : `Send to ${selectedGroupIds.length} Groups`}
                </SendButton>
            </form>
        </FormContainer>
    );
};

export default BroadcastForm;