import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import api from '../services/api';

const PageContainer = styled.div`
    max-width: 800px;
`;

const Card = styled.div`
    background: #fff;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
`;

const Header = styled.h2`
    margin-top: 0;
    margin-bottom: 0.5rem;
`;

const Description = styled.p`
    margin-bottom: 2rem;
    color: ${({ theme }) => theme.lightText};
`;

const SettingRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px;
`;

const SettingLabel = styled.span`
    font-weight: 600;
    font-size: 1.1rem;
`;

const SwitchContainer = styled.label`
    position: relative;
    display: inline-block;
    width: 60px;
    height: 34px;
`;

const SwitchInput = styled.input`
    opacity: 0;
    width: 0;
    height: 0;
    &:checked + span {
        background-color: ${({ theme }) => theme.secondary};
    }
    &:checked + span:before {
        transform: translateX(26px);
    }
`;

const Slider = styled.span`
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: .4s;
    border-radius: 34px;
    &:before {
        position: absolute;
        content: "";
        height: 26px;
        width: 26px;
        left: 4px;
        bottom: 4px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
    }
`;

const AutoConfirmationPage = () => {
    const [isEnabled, setIsEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const { data } = await api.get('/settings/auto-confirmation');
                setIsEnabled(data.isEnabled);
            } catch (error) {
                console.error("Failed to fetch status:", error);
                alert("Could not load auto-confirmation status.");
            } finally {
                setLoading(false);
            }
        };
        fetchStatus();
    }, []);

    const handleToggle = async () => {
        const newStatus = !isEnabled;
        setIsEnabled(newStatus); // Optimistic UI update

        try {
            await api.post('/settings/auto-confirmation', { isEnabled: newStatus });
        } catch (error) {
            console.error("Failed to update status:", error);
            alert("Failed to update setting. Reverting change.");
            setIsEnabled(!newStatus); // Revert on failure
        }
    };

    if (loading) {
        return <p>Loading settings...</p>;
    }

    return (
        <PageContainer>
            <Card>
                <Header>Auto Confirmation Settings</Header>
                <Description>
                    Enable this feature to automate the confirmation process for forwarded invoices.
                    When enabled, forwarded invoices will be reacted to, and a 'like' in the destination group will trigger a confirmation reply in the origin group.
                </Description>
                <SettingRow>
                    <SettingLabel>Enable Auto Confirmation</SettingLabel>
                    <SwitchContainer>
                        <SwitchInput 
                            type="checkbox" 
                            checked={isEnabled}
                            onChange={handleToggle}
                        />
                        <Slider />
                    </SwitchContainer>
                </SettingRow>
            </Card>
        </PageContainer>
    );
};

export default AutoConfirmationPage;