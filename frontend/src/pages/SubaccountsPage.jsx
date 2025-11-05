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
    if (
      window.confirm(
        "Are you sure you want to delete this subaccount? This will also delete its client login."
      )
    ) {
      try {
        await deleteSubaccount(id);
        fetchSubaccounts();
      } catch (error) {
        alert(error.response?.data?.message || "Failed to delete subaccount.");
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
      alert(error.response?.data?.message || "Failed to get credentials.");
      handleCloseModals();
    } finally {
      setCredsLoading(false);
    }
  };

  // === NEW: Handler for the reset password button ===
  const handleResetPassword = async (subaccountId) => {
    if (
      !window.confirm(
        "Are you sure you want to reset the password for this client? The old password will be lost forever."
      )
    ) {
      return;
    }
    setCredsLoading(true);
    try {
      const { data } = await resetSubaccountPassword(subaccountId);
      // Update the state to show the new password
      setCurrentCreds((prev) => ({ ...prev, ...data }));
    } catch (error) {
      alert(error.response?.data?.message || "Failed to reset password.");
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
          <p>
            Manage XPayz subaccounts for the "Upgrade Zone" confirmation method.
            Assigning a group enforces that all invoices from that group must be
            paid to the specified subaccount.
          </p>
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
                <tr>
                  <td colSpan="4">Loading...</td>
                </tr>
              ) : subaccounts.length === 0 ? (
                <tr>
                  <td colSpan="4">No subaccounts configured.</td>
                </tr>
              ) : (
                subaccounts.map((acc) => (
                  <tr key={acc.id}>
                    <td>{acc.name}</td>
                    <td>{acc.subaccount_number}</td>
                    <td>
                      {acc.assigned_group_name || (
                        <span style={{ color: "#999" }}>None</span>
                      )}
                    </td>
                    <td className="actions">
                      <FaKey
                        onClick={() => handleCredentials(acc)}
                        title="Get/Create Client Credentials"
                      />
                      <FaEdit
                        onClick={() => handleOpenModal(acc)}
                        title="Edit"
                      />
                      <FaTrash
                        onClick={() => handleDelete(acc.id)}
                        title="Delete"
                      />
                    </td>
                  </tr>
                ))
              )}
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
    </>
  );
};

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

const CredentialsModal = ({
  isOpen,
  onClose,
  credentials,
  onReset,
  loading,
}) => {
  if (!credentials) return null;

  const CredentialDisplay = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 1.5rem 0;

    div {
      background: #f6f9fc;
      padding: 0.75rem;
      border-radius: 4px;
      border: 1px solid #e6ebf1;
    }
    span {
      font-weight: 500;
      color: #6b7c93;
      display: block;
      margin-bottom: 0.25rem;
    }
    strong {
      font-family: "Courier New", Courier, monospace;
      color: #0a2540;
    }
  `;

  const Warning = styled.p`
    color: ${({ theme }) => theme.error};
    font-weight: bold;
    background: #ffebe6;
    padding: 1rem;
    border-radius: 6px;
  `;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {loading ? (
        <p>Loading...</p>
      ) : credentials ? (
        <>
          <h2>Client Credentials for {credentials.subaccountName}</h2>

          {credentials.message.includes("New") && (
            <Warning>
              Please copy the password now. You will not be able to see it again
              after closing this window.
            </Warning>
          )}

          <CredentialDisplay>
            <div>
              <span>Username</span>
              <strong>{credentials.username}</strong>
            </div>
            <div>
              <span>Password</span>
              <strong>{credentials.password}</strong>
            </div>
          </CredentialDisplay>

          <p style={{ color: "#6b7c93" }}>{credentials.message}</p>

          <ResetButton onClick={() => onReset(credentials.subaccountId)}>
            Reset Password
          </ResetButton>
        </>
      ) : null}
    </Modal>
  );
};

export default SubaccountsPage;
