import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getPositionCounters, createPositionCounter, updatePositionCounter, deletePositionCounter, getSubaccounts, getWhatsappGroups } from '../services/api';
import { usePermissions } from '../context/PermissionContext';
import PositionCounterCard from '../components/PositionCounterCard';
import PositionCounterModal from '../components/PositionCounterModal';
import { FaPlus } from 'react-icons/fa';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    height: 100%;
    min-height: 0;
    overflow: hidden;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
`;

const Title = styled.h2` margin: 0; `;

const Button = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.62rem 1rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    background-color: ${({ theme }) => theme.secondary};
    color: white;
    font-size: 0.9rem;
`;

const CountersGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
    min-height: 0;
    overflow: auto;
    padding-right: 0.15rem;
`;

const PositionPage = () => {
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('finance:manage_counters');

    const [counters, setCounters] = useState([]);
    const [crossSubaccounts, setCrossSubaccounts] = useState([]);
    const [whatsappGroups, setWhatsappGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCounter, setEditingCounter] = useState(null);

    const fetchCounters = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await getPositionCounters();
            setCounters(data);
        } catch (error) {
            console.error("Failed to fetch counters", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCounters();
    }, [fetchCounters]);

    useEffect(() => {
        const fetchSubaccounts = async () => {
            try {
                const { data } = await getSubaccounts();
                setCrossSubaccounts((data || []).filter((acc) => acc.account_type === 'cross'));
            } catch (error) {
                console.error('Failed to fetch subaccounts', error);
                setCrossSubaccounts([]);
            }
        };
        fetchSubaccounts();
    }, []);

    useEffect(() => {
        const fetchGroups = async () => {
            try {
                const { data } = await getWhatsappGroups();
                setWhatsappGroups(data || []);
            } catch (error) {
                console.error('Failed to fetch WhatsApp groups', error);
                setWhatsappGroups([]);
            }
        };
        fetchGroups();
    }, []);

    const handleOpenModal = (counter = null) => {
        setEditingCounter(counter);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditingCounter(null);
        setIsModalOpen(false);
    };

    const handleSaveCounter = async (formData) => {
        try {
            if (editingCounter) {
                await updatePositionCounter(editingCounter.id, formData);
            } else {
                await createPositionCounter(formData);
            }
            fetchCounters(); // Refresh the list
            handleCloseModal();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to save counter.');
        }
    };

    const handleDeleteCounter = async (counterToDelete) => {
        if (window.confirm(`Are you sure you want to delete the "${counterToDelete.name}" counter?`)) {
            try {
                await deletePositionCounter(counterToDelete.id);
                fetchCounters(); // Refresh the list
            } catch (error) {
                alert('Failed to delete counter.');
            }
        }
    };

    return (
        <>
            <PageContainer>
                <Header>
                    <Title>Position Dashboard</Title>
                    {canManage && (
                        <Button onClick={() => handleOpenModal()}>
                            <FaPlus /> Create New Counter
                        </Button>
                    )}
                </Header>

                {loading ? <p>Loading counters...</p> : (
                    counters.length > 0 ? (
                        <CountersGrid>
                            {counters.map(counter => (
                                <PositionCounterCard 
                                    key={counter.id}
                                    counter={counter}
                                    onEdit={handleOpenModal}
                                    onDelete={handleDeleteCounter}
                                    canManage={canManage}
                                />
                            ))}
                        </CountersGrid>
                    ) : (
                        canManage ? 
                        <p>No position counters created yet. Click "Create New Counter" to get started.</p> :
                        <p>No position counters have been configured.</p>
                    )
                )}
            </PageContainer>
            
            <PositionCounterModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSave={handleSaveCounter}
                editingCounter={editingCounter}
                crossSubaccounts={crossSubaccounts}
                whatsappGroups={whatsappGroups}
            />
        </>
    );
};

export default PositionPage;
