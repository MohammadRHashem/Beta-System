import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import {
  getSubaccounts,
  createSubaccount,
  updateSubaccount,
  deleteSubaccount,
  getSubaccountCredentials,
  resetSubaccountPassword,
} from "../services/api";
import Modal from "../components/Modal";
import { FaPlus, FaEdit, FaTrash, FaKey } from "react-icons/fa";
import ComboBox from "../components/ComboBox";

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
  margin-top: 1rem;
  width: 100%;
  justify-content: center; // Center the icon and text
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 1.5rem;
  th,
  td {
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

const SubaccountsPage = ({ allGroups }) => {
  // ... (Logic remains the same)
  const [subaccounts, setSubaccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubaccount, setEditingSubaccount] = useState(null);
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [currentCreds, setCurrentCreds] = useState(null);
  const [credsLoading, setCredsLoading] = useState(false);

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
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure?")) {
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
    if (!window.confirm(`Reset ${type === 'master' ? 'Full Access' : 'View-Only'} password?`)) {
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

  return (
    <>
      <PageContainer>
        <Header>
          <h2>Subaccount Management</h2>
          <Button onClick={() => handleOpenModal(null)}>
            <FaPlus /> Add Subaccount
          </Button>
        </Header>
        <Card>
          <p>Manage XPayz subaccounts and generate Client Portal credentials.</p>
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Subaccount Number</th>
                <th>Assigned Group</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4">Loading...</td></tr>
              ) : subaccounts.map((acc) => (
                  <tr key={acc.id}>
                    <td>{acc.name}</td>
                    <td>{acc.subaccount_number}</td>
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

      {/* Subaccount Modal remains the same ... */}
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
    </>
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
      {loading ? (
        <p>Loading...</p>
      ) : (
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
            Note: If a password is hidden (••••), you must reset it to see a new one.
          </p>
        </>
      )}
    </Modal>
  );
};

// ... SubaccountModal ...
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

const SubaccountModal = ({
  isOpen,
  onClose,
  onSave,
  subaccount,
  allGroups,
}) => {
  const [formData, setFormData] = useState({
    name: "",
    subaccount_number: "",
    chave_pix: "",
    assigned_group_jid: "",
  });

  useEffect(() => {
    if (subaccount) {
      setFormData({
        name: subaccount.name || "",
        subaccount_number: subaccount.subaccount_number || "",
        chave_pix: subaccount.chave_pix || "",
        assigned_group_jid: subaccount.assigned_group_jid || "",
      });
    } else {
      setFormData({
        name: "",
        subaccount_number: "",
        chave_pix: "",
        assigned_group_jid: "",
      });
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
          <Input
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Jupeter"
            required
          />
        </InputGroup>
        <InputGroup>
          <Label>Subaccount Number (ID)</Label>
          <Input
            name="subaccount_number"
            value={formData.subaccount_number}
            onChange={handleChange}
            placeholder="e.g., 110030"
            required
          />
        </InputGroup>
        <InputGroup>
          <Label>Chave PIX</Label>
          <Input
            name="chave_pix"
            value={formData.chave_pix}
            onChange={handleChange}
            placeholder="e.g., d05cec4d-..."
          />
        </InputGroup>
        <InputGroup>
          <Label>Assign to WhatsApp Group (Optional)</Label>
          <ComboBox
            options={[{ id: "", name: "None" }, ...allGroups]}
            value={formData.assigned_group_jid}
            onChange={(e) =>
              setFormData({ ...formData, assigned_group_jid: e.target.value })
            }
            placeholder="Select a group to assign..."
          />
        </InputGroup>
        <Button
          type="submit"
          style={{ alignSelf: "flex-end", marginTop: "1rem" }}
        >
          Save Changes
        </Button>
      </ModalForm>
    </Modal>
  );
};

export default SubaccountsPage;