import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import api from '../services/api';
import { usePermissions } from '../context/PermissionContext';

const PageContainer = styled.div`
    max-width: 860px;
    height: 100%;
    min-height: 0;
    overflow: auto;
    padding-right: 0.15rem;
`;

const Card = styled.div`
    background: #fff;
    padding: 1.3rem 1.25rem 1.1rem;
    border-radius: 14px;
    border: 1px solid rgba(9, 30, 66, 0.08);
    box-shadow: 0 14px 30px rgba(9, 30, 66, 0.08);
`;

const Header = styled.h2`
    margin-top: 0;
    margin-bottom: 0.5rem;
`;

const Description = styled.p`
    margin-bottom: 1.2rem;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.94rem;
    line-height: 1.5;
`;

const SmallDescription = styled(Description)`
    font-size: 0.88rem;
    margin-top: 0.45rem;
`;

const SettingRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.8rem;
    padding: 0.85rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;

    @media (max-width: 700px) {
        align-items: flex-start;
    }
`;

const SettingLabel = styled.span`
    font-weight: 600;
    font-size: 1rem;
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
    border-radius: 10px;
    padding: 0.85rem;
    flex-wrap: wrap;
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

const Divider = styled.hr`
    margin: 1.2rem 0;
    border: none;
    border-top: 1px solid #e6ebf1;
`;

const SectionLabel = styled(SettingLabel)`
    margin-bottom: 0.8rem;
    display: block;
`;

const AutoConfirmationPage = () => {
    const { hasPermission } = usePermissions();
    const canEdit = hasPermission('settings:toggle_confirmations');

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
                console.error('Failed to fetch statuses:', error);
                alert('Could not load confirmation statuses.');
            } finally {
                setLoading(false);
            }
        };
        fetchAllStatuses();
    }, []);

    const handleAutoConfToggle = async () => {
        const newStatus = !isAutoConfEnabled;
        setIsAutoConfEnabled(newStatus);
        try {
            await api.post('/settings/auto-confirmation', { isEnabled: newStatus });
        } catch (error) {
            alert('Failed to update setting. Reverting change.');
            setIsAutoConfEnabled(!newStatus);
        }
    };

    const handleAlfaApiToggle = async () => {
        const newStatus = !isAlfaApiEnabled;
        setIsAlfaApiEnabled(newStatus);
        try {
            await api.post('/settings/alfa-api-confirmation', { isEnabled: newStatus });
        } catch (error) {
            alert('Failed to update Alfa API setting. Reverting change.');
            setIsAlfaApiEnabled(!newStatus);
        }
    };

    const handleTrkbitToggle = async () => {
        const newStatus = !isTrkbitEnabled;
        setIsTrkbitEnabled(newStatus);
        try {
            await api.post('/settings/trkbit-confirmation', { isEnabled: newStatus });
        } catch (error) {
            alert('Failed to update Trkbit setting. Reverting change.');
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
            alert('Failed to update Troca Coin method. Reverting change.');
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
                            disabled={!canEdit}
                        />
                        <Slider />
                    </SwitchContainer>
                </SettingRow>
                <SmallDescription>
                    Forwards will get a '\uD83D\uDFE1' reaction. A '\uD83D\uDC4D' in the destination group triggers a "Caiu" reply in the origin group.
                </SmallDescription>

                <Divider />

                <SettingRow>
                    <SettingLabel>Enable Trkbit / Cross API Confirmation</SettingLabel>
                    <SwitchContainer>
                        <SwitchInput
                            type="checkbox"
                            checked={isTrkbitEnabled}
                            onChange={handleTrkbitToggle}
                            disabled={!canEdit}
                        />
                        <Slider />
                    </SwitchContainer>
                </SettingRow>
                <SmallDescription>
                    When enabled, invoices for "Trkbit", "BrasilCash" or "Cross Intermediação" are checked against synchronized API data.
                </SmallDescription>

                <Divider />

                <SettingRow>
                    <SettingLabel>Enable Alfa Trust API Confirmation</SettingLabel>
                    <SwitchContainer>
                        <SwitchInput
                            type="checkbox"
                            checked={isAlfaApiEnabled}
                            onChange={handleAlfaApiToggle}
                            disabled={!canEdit}
                        />
                        <Slider />
                    </SwitchContainer>
                </SettingRow>
                <SmallDescription>
                    When enabled, invoices for "Alfa Trust" are confirmed via API. A '\uD83D\uDFE2' reaction indicates success, and '\uD83D\uDD34' indicates not found.
                </SmallDescription>

                <SectionLabel>Troca Coin / MKS Confirmation Method</SectionLabel>
                <RadioGroup>
                    <RadioLabel>
                        <input
                            type="radio"
                            value="telegram"
                            checked={trocaCoinMethod === 'telegram'}
                            onChange={handleTrocaCoinMethodChange}
                            disabled={!canEdit}
                        />
                        Telegram Listener
                    </RadioLabel>
                    <RadioLabel>
                        <input
                            type="radio"
                            value="xpayz"
                            checked={trocaCoinMethod === 'xpayz'}
                            onChange={handleTrocaCoinMethodChange}
                            disabled={!canEdit}
                        />
                        XPayz API
                    </RadioLabel>
                </RadioGroup>
                <SmallDescription>
                    Select the data source used for automatically confirming "Troca Coin" or "MKS" invoices.
                </SmallDescription>
            </Card>
        </PageContainer>
    );
};

export default AutoConfirmationPage;
