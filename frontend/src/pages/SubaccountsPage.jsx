import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import {
  getSubaccounts,
  createSubaccount,
  updateSubaccount,
  deleteSubaccount,
  getSubaccountCredentials,
  resetSubaccountPassword,
  getRecibosTransactions,
  reassignTransaction
} from "../services/api";
import Modal from "../components/Modal";
import { FaPlus, FaEdit, FaTrash, FaKey, FaExchangeAlt, FaMagic } from "react-icons/fa";
import ComboBox from "../components/ComboBox";
import Select from 'react-select';

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
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
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

const ResetButton = styled(Button)`
  background-color: ${({ theme }) => theme.error};
  margin-top: 0.5rem;
  width: 100%;
  justify-content: center; 
  font-size: 0.9rem;
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
      &:hover {
        color: ${({ theme }) => theme.primary};
      }
    }
  }
`;

const SuggestionBadge = styled.div`
    background-color: #e6fffa;
    color: #00C49A;
    border: 1px solid #00C49A;
    padding: 0.3rem 0.6rem;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    margin-bottom: 0.3rem;
    transition: all 0.2s;

    &:hover {
        background-color: #00C49A;
        color: white;
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

const SubaccountsPage = ({ allGroups }) => {
  const [subaccounts, setSubaccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modals State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubaccount, setEditingSubaccount] = useState(null);
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [currentCreds, setCurrentCreds] = useState(null);
  const [credsLoading, setCredsLoading] = useState(false);
  const [isRecibosModalOpen, setIsRecibosModalOpen] = useState(false);
  const [recibosAccountId, setRecibosAccountId] = useState(null);
  const [recibosTransactions, setRecibosTransactions] = useState([]);
  const [recibosLoading, setRecibosLoading] = useState(false);

  const fetchSubaccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getSubaccounts();
      setSubaccounts(data);
    } catch (error) {
      alert("Failed to fetch subaccounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubaccounts();
  }, [fetchSubaccounts]);

  const handleOpenModal = (subaccount = null) => {
    setEditingSubaccount(subaccount);
    setIsModalOpen(true);
  };

  const handleCloseModals = () => {
    setIsModalOpen(false);
    setEditingSubaccount(null);
    setIsCredsModalOpen(false);
    setCurrentCreds(null);
    setIsRecibosModalOpen(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure? This will also delete any associated client portal credentials.")) {
      try {
        await deleteSubaccount(id);
        fetchSubaccounts();
      } catch (error) {
        alert("Failed to delete.");
      }
    }
  };

  const handleCredentials = async (subaccount) => {
    setCredsLoading(true);
    setIsCredsModalOpen(true);
    try {
      const { data } = await getSubaccountCredentials(subaccount.id);
      setCurrentCreds({
        ...data,
        subaccountId: subaccount.id,
        subaccountName: subaccount.name,
      });
    } catch (error) {
      alert("Failed to get credentials.");
      handleCloseModals();
    } finally {
      setCredsLoading(false);
    }
  };

  const handleResetPassword = async (subaccountId, type) => {
    if (!window.confirm(`Reset ${type === 'master' ? 'Full Access' : 'View-Only'} password? A new password will be generated.`)) {
      return;
    }
    setCredsLoading(true);
    try {
      const { data } = await resetSubaccountPassword(subaccountId, type);
      setCurrentCreds((prev) => {
          if (type === 'master') return { ...prev, masterPassword: data.password };
          return { ...prev, viewOnlyPassword: data.password };
      });
    } catch (error) {
      alert("Failed to reset password.");
    } finally {
      setCredsLoading(false);
    }
  };

  const fetchRecibosData = async (subNumber) => {
      if (!subNumber) return;
      setRecibosLoading(true);
      try {
          const { data } = await getRecibosTransactions(subNumber);
          setRecibosTransactions(data);
      } catch (error) {
          alert("Failed to fetch Recibos transactions.");
      } finally {
          setRecibosLoading(false);
      }
  };

  const handleReassign = async (txId, targetSubaccountNumber) => {
      if (!confirm(`Move this transaction to the selected client?`)) return;
      try {
          await reassignTransaction(txId, targetSubaccountNumber);
          setRecibosTransactions(prev => prev.filter(tx => tx.id !== txId));
      } catch (error) {
          alert("Failed to reassign transaction.");
      }
  };

  return (
    <>
      <PageContainer>
        <Header>
          <h2>Subaccount Management</h2>
          <div style={{display: 'flex', gap: '1rem'}}>
            <Button onClick={() => setIsRecibosModalOpen(true)} style={{backgroundColor: '#0A2540'}}>
                <FaExchangeAlt /> Manage Recibos
            </Button>
            <Button onClick={() => handleOpenModal(null)}>
                <FaPlus /> Add Subaccount
            </Button>
          </div>
        </Header>
        <Card>
          <p>Manage XPayz and Cross subaccounts, generate credentials, and manage internal "Recibos" transfers.</p>
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Identifier (Number/PIX)</th>
                <th>Assigned Group</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5">Loading...</td></tr>
              ) : subaccounts.map((acc) => (
                  <tr key={acc.id}>
                    <td>{acc.name}</td>
                    <td>
                        <span style={{ fontWeight: 'bold', color: acc.account_type === 'cross' ? '#217346' : '#7b1fa2' }}>
                            {acc.account_type.toUpperCase()}
                        </span>
                    </td>
                    <td>{acc.account_type === 'cross' ? acc.chave_pix : acc.subaccount_number}</td>
                    <td>{acc.assigned_group_name || <span style={{ color: "#999" }}>None</span>}</td>
                    <td className="actions">
                      <FaKey onClick={() => handleCredentials(acc)} title="Manage Credentials" />
                      <FaEdit onClick={() => handleOpenModal(acc)} title="Edit" />
                      <FaTrash onClick={() => handleDelete(acc.id)} title="Delete" />
                    </td>
                  </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </PageContainer>

      <SubaccountModal
        isOpen={isModalOpen}
        onClose={handleCloseModals}
        onSave={fetchSubaccounts}
        subaccount={editingSubaccount}
        allGroups={allGroups}
      />

      <CredentialsModal
        isOpen={isCredsModalOpen}
        onClose={handleCloseModals}
        credentials={currentCreds}
        onReset={handleResetPassword}
        loading={credsLoading}
      />

      <RecibosModal 
        isOpen={isRecibosModalOpen}
        onClose={handleCloseModals}
        subaccounts={subaccounts}
        loading={recibosLoading}
        transactions={recibosTransactions}
        onSelectAccount={(id) => { setRecibosAccountId(id); fetchRecibosData(id); }}
        selectedAccountId={recibosAccountId}
        onReassign={handleReassign}
      />
    </>
  );
};

// --- MODALS ---

const SubaccountModal = ({ isOpen, onClose, onSave, subaccount, allGroups }) => {
  const [formData, setFormData] = useState({
    name: "", account_type: "xpayz", subaccount_number: "",
    chave_pix: "", assigned_group_jid: "",
  });

  useEffect(() => {
    if (isOpen) {
        if (subaccount) {
            setFormData({
                name: subaccount.name || "",
                account_type: subaccount.account_type || 'xpayz',
                subaccount_number: subaccount.subaccount_number || "",
                chave_pix: subaccount.chave_pix || "",
                assigned_group_jid: subaccount.assigned_group_jid || "",
            });
        } else {
            setFormData({
                name: "", account_type: "xpayz", subaccount_number: "",
                chave_pix: "", assigned_group_jid: "",
            });
        }
    }
  }, [subaccount, isOpen]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (subaccount) {
        await updateSubaccount(subaccount.id, formData);
      } else {
        await createSubaccount(formData);
      }
      onSave();
      onClose();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to save subaccount.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="600px">
      <h2>{subaccount ? "Edit Subaccount" : "Create Subaccount"}</h2>
      <ModalForm onSubmit={handleSubmit}>
        <InputGroup>
          <Label>Subaccount Name</Label>
          <Input name="name" value={formData.name} onChange={handleChange} placeholder="e.g., Jupeter" required />
        </InputGroup>

        <InputGroup>
            <Label>Account Type</Label>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <label style={{cursor: 'pointer'}}><input type="radio" name="account_type" value="xpayz" checked={formData.account_type === 'xpayz'} onChange={handleChange} /> XPayz</label>
                <label style={{cursor: 'pointer'}}><input type="radio" name="account_type" value="cross" checked={formData.account_type === 'cross'} onChange={handleChange} /> Cross</label>
            </div>
        </InputGroup>

        {formData.account_type === 'xpayz' && (
            <InputGroup>
                <Label>Subaccount Number (ID)</Label>
                <Input name="subaccount_number" value={formData.subaccount_number} onChange={handleChange} placeholder="e.g., 110030" required={formData.account_type === 'xpayz'} />
            </InputGroup>
        )}
        {formData.account_type === 'cross' && (
            <InputGroup>
                <Label>Chave PIX</Label>
                <Input name="chave_pix" value={formData.chave_pix} onChange={handleChange} placeholder="e.g., financeirojk@cross-otc.com" required={formData.account_type === 'cross'} />
            </InputGroup>
        )}

        <InputGroup>
          <Label>Assign to WhatsApp Group (Optional)</Label>
          <ComboBox
            options={[{ id: "", name: "None" }, ...allGroups]}
            value={formData.assigned_group_jid}
            onChange={(e) => setFormData({ ...formData, assigned_group_jid: e.target.value })}
            placeholder="Select a group to assign..."
          />
        </InputGroup>
        <Button type="submit" style={{ alignSelf: "flex-end", marginTop: "1rem" }}>Save Changes</Button>
      </ModalForm>
    </Modal>
  );
};

const CredentialsModal = ({ isOpen, onClose, credentials, onReset, loading }) => {
  if (!credentials) return null;

  const CredentialBox = styled.div`
    background: #f6f9fc;
    padding: 1rem;
    border-radius: 6px;
    border: 1px solid #e6ebf1;
    margin-bottom: 1rem;
    
    h4 { margin: 0 0 0.5rem 0; color: #0A2540; font-size: 0.95rem; }
    div { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; }
    span { font-size: 0.85rem; color: #6b7c93; }
    strong { font-family: "Courier New", Courier, monospace; color: #0a2540; }
  `;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="550px">
      {loading ? ( <p>Loading...</p> ) : (
        <>
          <h2>Credentials for {credentials.subaccountName}</h2>
          <div style={{marginBottom: '1rem', padding: '0.5rem', background: '#e3f2fd', borderRadius: '4px'}}>
             <strong>Username:</strong> {credentials.username}
          </div>
          <CredentialBox>
            <h4>Full Access (Master)</h4>
            <div><span>Password:</span> <strong>{credentials.masterPassword}</strong></div>
            <ResetButton onClick={() => onReset(credentials.subaccountId, 'master')}>Reset Master Password</ResetButton>
          </CredentialBox>
          <CredentialBox>
            <h4>View Only (Restricted)</h4>
            <div><span>Password:</span> <strong>{credentials.viewOnlyPassword}</strong></div>
            <ResetButton onClick={() => onReset(credentials.subaccountId, 'view_only')}>Reset View-Only Password</ResetButton>
          </CredentialBox>
          <p style={{ color: "#6b7c93", fontSize: '0.85rem' }}>
            Note: If a password is hidden (••••••••••), you must reset it to see a new one.
          </p>
        </>
      )}
    </Modal>
  );
};

const RecibosModal = ({ isOpen, onClose, subaccounts, loading, transactions, onSelectAccount, selectedAccountId, onReassign }) => {
    const subOptions = subaccounts.map(s => ({ value: s.subaccount_number, label: s.name }));

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="900px">
            <h2>Recibos / Internal Transfer Manager</h2>
            <p>Select your "Recibos" or "Catch-all" account to distribute transactions to the correct clients.</p>
            <div style={{marginBottom: '1.5rem'}}>
                <label style={{fontWeight: 'bold', display: 'block', marginBottom: '0.5rem'}}>Select Source Account (Recibos)</label>
                <Select 
                    options={subOptions}
                    onChange={(opt) => onSelectAccount(opt.value)}
                    placeholder="Choose account to inspect..."
                />
            </div>
            {selectedAccountId && (
                <div style={{maxHeight: '500px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '4px'}}>
                    {loading ? <p style={{padding: '1rem'}}>Loading transactions...</p> : (
                        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem'}}>
                            <thead style={{background: '#f6f9fc', position: 'sticky', top: 0, zIndex: 10}}>
                                <tr>
                                    <th style={{padding: '0.75rem', textAlign: 'left'}}>Date</th>
                                    <th style={{padding: '0.75rem', textAlign: 'left'}}>Sender</th>
                                    <th style={{padding: '0.75rem', textAlign: 'left'}}>Amount</th>
                                    <th style={{padding: '0.75rem', textAlign: 'left'}}>Smart Suggestion</th>
                                    <th style={{padding: '0.75rem', textAlign: 'left'}}>Assign To</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.length === 0 ? (
                                    <tr><td colSpan="5" style={{padding: '2rem', textAlign: 'center'}}>No transactions found.</td></tr>
                                ) : transactions.map(tx => (
                                    <RecibosRow 
                                        key={tx.id} 
                                        tx={tx} 
                                        subOptions={subOptions} 
                                        onReassign={onReassign}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </Modal>
    );
};

const RecibosRow = ({ tx, subOptions, onReassign }) => {
    const [target, setTarget] = useState(null);

    const suggestionOption = tx.suggestion 
        ? subOptions.find(o => o.label === tx.suggestion.subaccountName) 
        : null;

    return (
        <tr style={{borderBottom: '1px solid #eee'}}>
            <td style={{padding: '0.75rem'}}>{new Date(tx.transaction_date).toLocaleDateString()}</td>
            <td style={{padding: '0.75rem', fontWeight: '500'}}>{tx.sender_name}</td>
            <td style={{padding: '0.75rem', fontFamily: 'monospace'}}>{parseFloat(tx.amount).toFixed(2)}</td>
            <td style={{padding: '0.75rem'}}>
                {tx.suggestion ? (
                    <SuggestionBadge onClick={() => setTarget(suggestionOption)}>
                        <FaMagic /> {tx.suggestion.confidence}%: {tx.suggestion.subaccountName}
                    </SuggestionBadge>
                ) : <span style={{color: '#ccc', fontSize: '0.8rem'}}>No history</span>}
            </td>
            <td style={{padding: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                <div style={{width: '200px'}}>
                    <Select 
                        options={subOptions} 
                        value={target} 
                        onChange={setTarget} 
                        placeholder="Select Client..."
                        menuPortalTarget={document.body}
                        styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                    />
                </div>
                <Button 
                    disabled={!target} 
                    onClick={() => onReassign(tx.id, target.value)}
                    style={{padding: '0.5rem', fontSize: '0.8rem'}}
                >
                    Move
                </Button>
            </td>
        </tr>
    );
};


// Default export
export default SubaccountsPage;