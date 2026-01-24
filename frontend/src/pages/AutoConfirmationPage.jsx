import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import api from '../services/api';
import { usePermissions } from '../context/PermissionContext'; // 1. IMPORT PERMISSIONS HOOK

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

const RadioGroup = styled.div`
    display: flex;
    gap: 1.5rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px;
    padding: 1rem;
`;

const RadioLabel = styled.label`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    cursor: pointer;
    
    input:disabled {
        cursor: not-allowed;
    }
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
    &:disabled + span {
        cursor: not-allowed;
        background-color: #e9ecef;
        opacity: 0.7;
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
    const { hasPermission } = usePermissions(); // 2. GET PERMISSION CHECKER
    const canEdit = hasPermission('settings:toggle_confirmations'); // 3. DEFINE EDIT CAPABILITY

    const [isAutoConfEnabled, setIsAutoConfEnabled] = useState(false);
    const [isAlfaApiEnabled, setIsAlfaApiEnabled] = useState(false);
    const [trocaCoinMethod, setTrocaCoinMethod] = useState('telegram'); 
    const [isTrkbitEnabled, setIsTrkbitEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAllStatuses = async () => {
            try {
                const [autoConfRes, alfaApiRes, trkbitRes, trocaCoinRes] = await Promise.all([
                    api.get('/settings/auto-confirmation'),
                    api.get('/settings/alfa-api-confirmation'),
                    api.get('/settings/trkbit-confirmation'),
                    api.get('/settings/troca-coin-method')
                ]);
                setIsAutoConfEnabled(autoConfRes.data.isEnabled);
                setIsAlfaApiEnabled(alfaApiRes.data.isEnabled);
                setIsTrkbitEnabled(trkbitRes.data.isEnabled);
                setTrocaCoinMethod(trocaCoinRes.data.method);
            } catch (error) {
                console.error("Failed to fetch statuses:", error);
                alert("Could not load confirmation statuses.");
            } finally {
                setLoading(false);
            }
        };
        fetchAllStatuses();
    }, []);

    const handleAutoConfToggle = async () => {
        const newStatus = !isAutoConfEnabled;
        setIsAutoConfEnabled(newStatus); // Optimistic update
        try {
            await api.post('/settings/auto-confirmation', { isEnabled: newStatus });
        } catch (error) {
            alert("Failed to update setting. Reverting change.");
            setIsAutoConfEnabled(!newStatus);
        }
    };

    const handleAlfaApiToggle = async () => {
        const newStatus = !isAlfaApiEnabled;
        setIsAlfaApiEnabled(newStatus);
        try {
            await api.post('/settings/alfa-api-confirmation', { isEnabled: newStatus });
        } catch (error) {
            alert("Failed to update Alfa API setting. Reverting change.");
            setIsAlfaApiEnabled(!newStatus);
        }
    };

    const handleTrkbitToggle = async () => {
        const newStatus = !isTrkbitEnabled;
        setIsTrkbitEnabled(newStatus);
        try {
            await api.post('/settings/trkbit-confirmation', { isEnabled: newStatus });
        } catch (error) {
            alert("Failed to update Trkbit setting. Reverting change.");
            setIsTrkbitEnabled(!newStatus);
        }
    };

    const handleTrocaCoinMethodChange = async (event) => {
        const newMethod = event.target.value;
        const oldMethod = trocaCoinMethod;
        setTrocaCoinMethod(newMethod);
        try {
            await api.post('/settings/troca-coin-method', { method: newMethod });
        } catch (error) {
            alert("Failed to update Troca Coin method. Reverting change.");
            setTrocaCoinMethod(oldMethod);
        }
    };

    if (loading) {
        return <p>Loading settings...</p>;
    }

    return (
        <PageContainer>
            <Card>
                <Header>Confirmation Settings</Header>
                <Description>
                    Configure how forwarded invoices are confirmed.
                </Description>

                <SettingRow>
                    <SettingLabel>Enable Standard Auto-Confirmation</SettingLabel>
                    <SwitchContainer>
                        <SwitchInput 
                            type="checkbox" 
                            checked={isAutoConfEnabled}
                            onChange={handleAutoConfToggle}
                            disabled={!canEdit} // 4. DISABLE INTERACTIVE ELEMENTS
                        />
                        <Slider />
                    </SwitchContainer>
                </SettingRow>
                <Description style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    Forwards will get a '🟡' reaction. A '👍' in the destination group triggers a "Caiu" reply in the origin group.
                </Description>

                <hr style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid #e6ebf1' }}/>

                <SettingRow>
                    <SettingLabel>Enable Trkbit / Cross API Confirmation</SettingLabel>
                    <SwitchContainer>
                        <SwitchInput 
                            type="checkbox" 
                            checked={isTrkbitEnabled}
                            onChange={handleTrkbitToggle}
                            disabled={!canEdit} // 4. DISABLE INTERACTIVE ELEMENTS
                        />
                        <Slider />
                    </SwitchContainer>
                </SettingRow>
                 <Description style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    When enabled, invoices for "Trkbit", "BrasilCash" or "Cross Intermediação" will be checked against the synchronized API data.
                </Description>

                <hr style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid #e6ebf1' }}/>

                <SettingRow>
                    <SettingLabel>Enable Alfa Trust API Confirmation</SettingLabel>
                    <SwitchContainer>
                        <SwitchInput 
                            type="checkbox" 
                            checked={isAlfaApiEnabled}
                            onChange={handleAlfaApiToggle}
                            disabled={!canEdit} // 4. DISABLE INTERACTIVE ELEMENTS
                        />
                        <Slider />
                    </SwitchContainer>
                </SettingRow>
                 <Description style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    When enabled, invoices for "Alfa Trust" will be confirmed automatically via the bank's API, overriding the standard method. A '🟢' reaction indicates success, a '🔴' indicates the transaction was not found.
                </Description>

                <SettingLabel style={{marginBottom: '1rem', display: 'block'}}>Troca Coin / MKS Confirmation Method</SettingLabel>
                <RadioGroup>
                    <RadioLabel>
                        <input 
                            type="radio" 
                            value="telegram" 
                            checked={trocaCoinMethod === 'telegram'} 
                            onChange={handleTrocaCoinMethodChange}
                            disabled={!canEdit} // 4. DISABLE INTERACTIVE ELEMENTS
                        />
                        Telegram Listener
                    </RadioLabel>
                    <RadioLabel>
                        <input 
                            type="radio" 
                            value="xpayz" 
                            checked={trocaCoinMethod === 'xpayz'} 
                            onChange={handleTrocaCoinMethodChange}
                            disabled={!canEdit} // 4. DISABLE INTERACTIVE ELEMENTS
                        />
                        XPayz API
                    </RadioLabel>
                </RadioGroup>
                <Description style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    Select the data source to use for automatically confirming "Troca Coin" or "MKS" invoices.
                </Description>
            </Card>
        </PageContainer>
    );
};

export default AutoConfirmationPage;