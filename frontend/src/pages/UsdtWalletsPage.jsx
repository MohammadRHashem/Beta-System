import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { 
    getUsdtWallets, 
    createUsdtWallet, 
    updateUsdtWallet, 
    deleteUsdtWallet, 
    toggleUsdtWallet 
} from '../services/api';
import Modal from '../components/Modal';
import { FaPlus, FaEdit, FaTrash, FaExclamationTriangle } from 'react-icons/fa';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2rem;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const Card = styled.div`
    background: #fff;
    padding: 1.5rem 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
`;

const Button = styled.button`
    background-color: ${({ theme }) => theme.secondary};
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 0.5rem;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    margin-top: 1.5rem;
    th, td {
        padding: 1rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
    }
    th {
        background-color: ${({ theme }) => theme.background};
    }
    .actions {
        display: flex;
        gap: 1.5rem;
        font-size: 1.1rem;
        svg {
            cursor: pointer;
            color: ${({ theme }) => theme.lightText};
            &:hover { color: ${({ theme }) => theme.primary}; }
        }
    }
`;

const SwitchContainer = styled.label`
    position: relative;
    display: inline-block;
    width: 50px;
    height: 28px;
`;

const SwitchInput = styled.input`
    opacity: 0;
    width: 0;
    height: 0;
    &:checked + span {
        background-color: ${({ theme }) => theme.secondary};
    }
    &:checked + span:before {
        transform: translateX(22px);
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
        height: 20px;
        width: 20px;
        left: 4px;
        bottom: 4px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
    }
`;

const ModalForm = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const Label = styled.label`
    font-weight: 500;
`;

const Input = styled.input`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 1rem;
`;

const UsdtWalletsPage = () => {
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingWallet, setEditingWallet] = useState(null);

    const fetchWallets = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await getUsdtWallets();
            setWallets(data);
        } catch (error) {
            alert("Failed to fetch USDT wallets.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWallets();
    }, [fetchWallets]);

    const handleOpenModal = (wallet = null) => {
        setEditingWallet(wallet);
        setIsModalOpen(true);
    };
    
    const handleCloseModal = () => {
        setEditingWallet(null);
        setIsModalOpen(false);
    };

    const handleSaveWallet = async (formData) => {
        try {
            if (editingWallet) {
                await updateUsdtWallet(editingWallet.id, { wallet_name: formData.wallet_name });
            } else {
                await createUsdtWallet(formData);
            }
            fetchWallets();
            handleCloseModal();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to save wallet.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this wallet?")) {
            try {
                await deleteUsdtWallet(id);
                fetchWallets();
            } catch (error) {
                alert(error.response?.data?.message || 'Failed to delete wallet.');
            }
        }
    };
    
    const handleToggle = async (wallet) => {
        const newEnabledState = !wallet.is_enabled;
        try {
            await toggleUsdtWallet(wallet.id, newEnabledState);
            setWallets(wallets.map(w => w.id === wallet.id ? { ...w, is_enabled: newEnabledState } : w));
        } catch (error) {
            alert('Failed to update wallet status.');
        }
    };

    return (
        <>
            <PageContainer>
                <Header>
                    <h2>USDT Wallet Management</h2>
                    <Button onClick={() => handleOpenModal(null)}><FaPlus /> Add Wallet</Button>
                </Header>
                <Card>
                    <p>Add and manage the TRC-20 wallet addresses that the system should monitor for automated USDT confirmations.</p>
                    <Table>
                        <thead>
                            <tr>
                                <th>Enabled</th>
                                <th>Wallet Name</th>
                                <th>Wallet Address (TRC-20)</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="4">Loading wallets...</td></tr>
                            ) : wallets.length === 0 ? (
                                <tr><td colSpan="4">No wallets configured. Click "Add Wallet" to begin.</td></tr>
                            ) : (
                                wallets.map((wallet) => (
                                    <tr key={wallet.id}>
                                        <td>
                                            <SwitchContainer>
                                                <SwitchInput 
                                                    type="checkbox" 
                                                    checked={!!wallet.is_enabled}
                                                    onChange={() => handleToggle(wallet)}
                                                />
                                                <Slider />
                                            </SwitchContainer>
                                        </td>
                                        <td>{wallet.wallet_name}</td>
                                        <td>{wallet.wallet_address}</td>
                                        <td className="actions">
                                            <FaEdit onClick={() => handleOpenModal(wallet)} title="Edit Name"/>
                                            <FaTrash onClick={() => handleDelete(wallet.id)} title="Delete"/>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </Table>
                </Card>
            </PageContainer>
            <WalletModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSave={handleSaveWallet}
                wallet={editingWallet}
            />
        </>
    );
};

const WalletModal = ({ isOpen, onClose, onSave, wallet }) => {
    const [formData, setFormData] = useState({ wallet_name: '', wallet_address: '' });

    useEffect(() => {
        if (wallet) {
            setFormData({ wallet_name: wallet.wallet_name, wallet_address: wallet.wallet_address });
        } else {
            setFormData({ wallet_name: '', wallet_address: '' });
        }
    }, [wallet, isOpen]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="600px">
            <h2>{wallet ? 'Edit Wallet Name' : 'Add New USDT Wallet'}</h2>
            <ModalForm onSubmit={handleSubmit}>
                <InputGroup>
                    <Label>Wallet Name</Label>
                    <Input name="wallet_name" value={formData.wallet_name} onChange={handleChange} placeholder="e.g., Main Binance Wallet" required />
                </InputGroup>
                <InputGroup>
                    <Label>Wallet Address (TRC-20)</Label>
                    <Input 
                        name="wallet_address" 
                        value={formData.wallet_address} 
                        onChange={handleChange}
                        placeholder="T..."
                        required 
                        disabled={!!wallet} // Prevent editing address after creation
                    />
                     {!!wallet && <small style={{color: '#6B7C93'}}>Wallet address cannot be changed after creation.</small>}
                </InputGroup>
                <p style={{display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6B7C93', background: '#F6F9FC', padding: '0.75rem', borderRadius: '4px'}}>
                    <FaExclamationTriangle style={{color: '#f39c12'}}/>
                    Ensure the address is a TRON (TRC-20) address and is copied correctly.
                </p>
                <Button type="submit" style={{ alignSelf: 'flex-end', marginTop: '1rem' }}>Save Changes</Button>
            </ModalForm>
        </Modal>
    );
};

export default UsdtWalletsPage;