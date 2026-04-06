import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import api from '../services/api';
import Modal from '../components/Modal';
import { usePermissions } from '../context/PermissionContext';
import { FaEdit, FaImage, FaTrash, FaUpload } from 'react-icons/fa';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    height: 100%;
    min-height: 0;
    overflow: auto;
`;

const Card = styled.div`
    background: ${({ theme }) => theme.surface};
    padding: 1.1rem 1.2rem 1rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.border};
    box-shadow: ${({ theme }) => theme.shadowMd};
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex-shrink: 0;

    &:last-child {
        flex: 1;
    }
`;

const Form = styled.form`
    display: flex;
    gap: 1rem;
    align-items: flex-end;
    flex-wrap: wrap;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-grow: 1;
    min-width: 220px;
`;

const Label = styled.label`
    font-weight: 500;
    color: ${({ theme }) => theme.text};
`;

const Input = styled.input`
    padding: 0.68rem 0.72rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    font-size: 0.95rem;
`;

const Select = styled.select`
    padding: 0.68rem 0.72rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    font-size: 0.95rem;
    background: ${({ theme }) => theme.surface};
`;

const Textarea = styled.textarea`
    padding: 0.68rem 0.72rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    font-size: 0.95rem;
    min-height: 100px;
    font-family: inherit;
    resize: vertical;
`;

const Button = styled.button`
    background-color: ${({ theme, $variant }) => {
        if ($variant === 'secondary') return theme.surfaceAlt;
        return theme.secondary;
    }};
    color: ${({ theme, $variant }) => ($variant === 'secondary' ? theme.text : 'white')};
    border: 1px solid ${({ theme }) => theme.border};
    padding: 0.66rem 1rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;

    &:disabled {
        background-color: ${({ theme }) => theme.borderStrong};
        color: white;
        cursor: not-allowed;
    }
`;

const TableWrapper = styled.div`
    width: 100%;
    overflow: auto;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;
    min-height: 0;
    flex: 1;
`;

const RulesTable = styled.table`
    width: 100%;
    min-width: 920px;
    border-collapse: collapse;
    margin-top: 0.8rem;
    font-size: 0.9rem;

    th, td {
        padding: 0.78rem 0.85rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
        vertical-align: middle;
    }

    th {
        background-color: ${({ theme }) => theme.background};
        font-size: 0.84rem;
        letter-spacing: 0.01em;
        white-space: nowrap;
    }

    td.actions .actions-wrap {
        display: inline-flex;
        align-items: center;
        gap: 1rem;
        font-size: 1.1rem;
        line-height: 1;
    }

    td.actions .actions-wrap svg {
        cursor: pointer;
    }

    td.actions .actions-wrap svg:hover {
        color: ${({ theme }) => theme.primary};
    }
`;

const TypeBadge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.24rem 0.55rem;
    border-radius: 999px;
    background: ${({ theme, $type }) => ($type === 'image' ? theme.primary : theme.surfaceAlt)};
    color: ${({ theme, $type }) => ($type === 'image' ? '#fff' : theme.text)};
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: capitalize;
`;

const MediaCell = styled.div`
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 260px;
`;

const Thumbnail = styled.div`
    width: 64px;
    height: 64px;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.border};
    background: ${({ theme }) => theme.surfaceAlt};
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${({ theme }) => theme.lightText};
    flex-shrink: 0;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
`;

const MediaMeta = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
    min-width: 0;
`;

const MediaName = styled.span`
    font-weight: 700;
    word-break: break-word;
`;

const Muted = styled.span`
    color: ${({ theme }) => theme.lightText};
    font-size: 0.82rem;
`;

const UploadButton = styled.button`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-height: 42px;
    padding: 0.7rem 0.95rem;
    border-radius: 8px;
    border: 1px dashed ${({ theme }) => theme.borderStrong};
    background: ${({ theme }) => theme.surfaceAlt};
    color: ${({ theme }) => theme.text};
    cursor: pointer;
    font-weight: 700;
`;

const HiddenFileInput = styled.input.attrs({ type: 'file', accept: 'image/*' })`
    display: none;
`;

const PreviewPanel = styled.div`
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;
    background: ${({ theme }) => theme.surfaceAlt};
`;

const PreviewImage = styled.div`
    width: 78px;
    height: 78px;
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.border};
    background: ${({ theme }) => theme.surface};
    flex-shrink: 0;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
`;

const HelpText = styled.span`
    color: ${({ theme }) => theme.lightText};
    font-size: 0.82rem;
`;

const ModalContentForm = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const ActionsRow = styled.div`
    display: flex;
    gap: 0.7rem;
    justify-content: flex-end;
`;

const buildAbbreviationFormData = ({ trigger, type, response, file }) => {
    const formData = new FormData();
    formData.append('trigger', trigger.trim());
    formData.append('type', type);
    formData.append('response', response);
    if (file) {
        formData.append('media', file);
    }
    return formData;
};

const renderMediaSummary = (abbr) => {
    if (abbr.type !== 'image') {
        return abbr.response || '-';
    }

    return (
        <MediaCell>
            <Thumbnail>
                {abbr.media_url ? <img src={abbr.media_url} alt={abbr.media_original_filename || abbr.trigger} /> : <FaImage />}
            </Thumbnail>
            <MediaMeta>
                <MediaName>{abbr.media_original_filename || 'Uploaded image'}</MediaName>
                <Muted>{abbr.response || 'No caption'}</Muted>
            </MediaMeta>
        </MediaCell>
    );
};

const AbbreviationsPage = () => {
    const { hasPermission } = usePermissions();
    const canEdit = hasPermission('settings:edit_abbreviations');

    const [abbreviations, setAbbreviations] = useState([]);
    const [trigger, setTrigger] = useState('');
    const [type, setType] = useState('text');
    const [response, setResponse] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAbbr, setEditingAbbr] = useState(null);
    const [editingType, setEditingType] = useState('text');
    const [editingResponse, setEditingResponse] = useState('');
    const [editingFile, setEditingFile] = useState(null);
    const [isUpdating, setIsUpdating] = useState(false);

    const createFileInputRef = useRef(null);
    const editFileInputRef = useRef(null);

    const selectedFileName = useMemo(() => selectedFile?.name || '', [selectedFile]);
    const editingFileName = useMemo(() => editingFile?.name || '', [editingFile]);

    const resetCreateForm = () => {
        setTrigger('');
        setType('text');
        setResponse('');
        setSelectedFile(null);
        if (createFileInputRef.current) {
            createFileInputRef.current.value = '';
        }
    };

    const fetchAbbrs = async () => {
        try {
            const { data } = await api.get('/abbreviations');
            setAbbreviations(data);
        } catch (error) {
            console.error('Failed to fetch abbreviations:', error);
        }
    };

    useEffect(() => {
        fetchAbbrs();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!trigger.trim()) {
            alert('Trigger is required.');
            return;
        }
        if (type === 'text' && !response.trim()) {
            alert('Text abbreviations need a response.');
            return;
        }
        if (type === 'image' && !selectedFile) {
            alert('Please upload an image for this abbreviation.');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = buildAbbreviationFormData({
                trigger,
                type,
                response,
                file: type === 'image' ? selectedFile : null
            });
            await api.post('/abbreviations', payload, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert('Abbreviation created successfully!');
            resetCreateForm();
            fetchAbbrs();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to create abbreviation.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this abbreviation?')) return;

        try {
            await api.delete(`/abbreviations/${id}`);
            alert('Abbreviation deleted successfully.');
            fetchAbbrs();
        } catch (_error) {
            alert('Failed to delete abbreviation.');
        }
    };

    const openEditModal = (abbr) => {
        setEditingAbbr(abbr);
        setEditingType(abbr.type || 'text');
        setEditingResponse(abbr.response || '');
        setEditingFile(null);
        if (editFileInputRef.current) {
            editFileInputRef.current.value = '';
        }
        setIsModalOpen(true);
    };

    const closeEditModal = () => {
        setIsModalOpen(false);
        setEditingAbbr(null);
        setEditingType('text');
        setEditingResponse('');
        setEditingFile(null);
        if (editFileInputRef.current) {
            editFileInputRef.current.value = '';
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        if (!editingAbbr) return;

        if (!editingAbbr.trigger?.trim()) {
            alert('Trigger is required.');
            return;
        }
        if (editingType === 'text' && !editingResponse.trim()) {
            alert('Text abbreviations need a response.');
            return;
        }
        if (editingType === 'image' && !editingFile && !editingAbbr.media_url) {
            alert('Image abbreviations need an uploaded image.');
            return;
        }

        setIsUpdating(true);
        try {
            const payload = buildAbbreviationFormData({
                trigger: editingAbbr.trigger,
                type: editingType,
                response: editingResponse,
                file: editingType === 'image' ? editingFile : null
            });
            await api.put(`/abbreviations/${editingAbbr.id}`, payload, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert('Abbreviation updated successfully!');
            closeEditModal();
            fetchAbbrs();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to update abbreviation.');
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <>
            <PageContainer>
                {canEdit && (
                    <Card>
                        <h3>Create New Abbreviation</h3>
                        <Form onSubmit={handleSubmit}>
                            <InputGroup>
                                <Label>Trigger</Label>
                                <Input
                                    type="text"
                                    placeholder="e.g., pic"
                                    value={trigger}
                                    onChange={(e) => setTrigger(e.target.value)}
                                />
                                <HelpText>The bot triggers only when the whole message exactly matches this value.</HelpText>
                            </InputGroup>

                            <InputGroup>
                                <Label>Type</Label>
                                <Select value={type} onChange={(e) => setType(e.target.value)}>
                                    <option value="text">Text</option>
                                    <option value="image">Image</option>
                                </Select>
                            </InputGroup>

                            <InputGroup style={{ minWidth: type === 'image' ? '320px' : '380px' }}>
                                <Label>{type === 'image' ? 'Caption' : 'Full Response'}</Label>
                                <Textarea
                                    placeholder={type === 'image' ? 'Optional caption to send with the image...' : 'The full message to replace the trigger...'}
                                    value={response}
                                    onChange={(e) => setResponse(e.target.value)}
                                />
                            </InputGroup>

                            {type === 'image' && (
                                <InputGroup style={{ minWidth: '280px' }}>
                                    <Label>Image Upload</Label>
                                    <HiddenFileInput
                                        ref={createFileInputRef}
                                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                    />
                                    <UploadButton type="button" onClick={() => createFileInputRef.current?.click()}>
                                        <FaUpload /> {selectedFile ? 'Change Image' : 'Upload Image'}
                                    </UploadButton>
                                    {selectedFileName ? (
                                        <PreviewPanel>
                                            <PreviewImage>
                                                <FaImage />
                                            </PreviewImage>
                                            <MediaMeta>
                                                <MediaName>{selectedFileName}</MediaName>
                                                <Muted>Selected for upload</Muted>
                                            </MediaMeta>
                                        </PreviewPanel>
                                    ) : (
                                        <HelpText>Upload the image the bot should send when the trigger is used.</HelpText>
                                    )}
                                </InputGroup>
                            )}

                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Saving...' : 'Add Abbreviation'}
                            </Button>
                        </Form>
                    </Card>
                )}

                <Card>
                    <h3>Existing Abbreviations</h3>
                    <TableWrapper>
                        <RulesTable>
                            <thead>
                                <tr>
                                    <th>Trigger</th>
                                    <th>Type</th>
                                    <th>Response / Media</th>
                                    {canEdit && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {abbreviations.map((abbr) => (
                                    <tr key={abbr.id}>
                                        <td>{abbr.trigger}</td>
                                        <td>
                                            <TypeBadge $type={abbr.type}>
                                                {abbr.type === 'image' && <FaImage />}
                                                {abbr.type || 'text'}
                                            </TypeBadge>
                                        </td>
                                        <td>{renderMediaSummary(abbr)}</td>
                                        {canEdit && (
                                            <td className="actions">
                                                <div className="actions-wrap">
                                                    <FaEdit onClick={() => openEditModal(abbr)} title="Edit" />
                                                    <FaTrash onClick={() => handleDelete(abbr.id)} title="Delete" />
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </RulesTable>
                    </TableWrapper>
                </Card>
            </PageContainer>

            <Modal isOpen={isModalOpen} onClose={closeEditModal} maxWidth="760px">
                {editingAbbr && (
                    <ModalContentForm onSubmit={handleUpdate}>
                        <h2 style={{ margin: 0 }}>Edit Abbreviation</h2>

                        <InputGroup>
                            <Label>Trigger</Label>
                            <Input
                                type="text"
                                value={editingAbbr.trigger}
                                onChange={(e) => setEditingAbbr({ ...editingAbbr, trigger: e.target.value })}
                            />
                        </InputGroup>

                        <InputGroup>
                            <Label>Type</Label>
                            <Select value={editingType} onChange={(e) => setEditingType(e.target.value)}>
                                <option value="text">Text</option>
                                <option value="image">Image</option>
                            </Select>
                        </InputGroup>

                        <InputGroup>
                            <Label>{editingType === 'image' ? 'Caption' : 'Full Response'}</Label>
                            <Textarea
                                value={editingResponse}
                                placeholder={editingType === 'image' ? 'Optional caption to send with the image...' : 'The full message to replace the trigger...'}
                                onChange={(e) => setEditingResponse(e.target.value)}
                            />
                        </InputGroup>

                        {editingType === 'image' && (
                            <InputGroup>
                                <Label>Image Upload</Label>
                                <HiddenFileInput
                                    ref={editFileInputRef}
                                    onChange={(e) => setEditingFile(e.target.files?.[0] || null)}
                                />
                                <UploadButton type="button" onClick={() => editFileInputRef.current?.click()}>
                                    <FaUpload /> {editingFile ? 'Change Image' : 'Upload Replacement Image'}
                                </UploadButton>

                                {editingFileName ? (
                                    <PreviewPanel>
                                        <PreviewImage>
                                            <FaImage />
                                        </PreviewImage>
                                        <MediaMeta>
                                            <MediaName>{editingFileName}</MediaName>
                                            <Muted>New image selected</Muted>
                                        </MediaMeta>
                                    </PreviewPanel>
                                ) : editingAbbr.media_url ? (
                                    <PreviewPanel>
                                        <PreviewImage>
                                            <img src={editingAbbr.media_url} alt={editingAbbr.media_original_filename || editingAbbr.trigger} />
                                        </PreviewImage>
                                        <MediaMeta>
                                            <MediaName>{editingAbbr.media_original_filename || 'Current image'}</MediaName>
                                            <Muted>{editingResponse || 'No caption'}</Muted>
                                        </MediaMeta>
                                    </PreviewPanel>
                                ) : (
                                    <HelpText>Upload an image for this abbreviation.</HelpText>
                                )}
                            </InputGroup>
                        )}

                        <ActionsRow>
                            <Button type="button" $variant="secondary" onClick={closeEditModal}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isUpdating}>
                                {isUpdating ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </ActionsRow>
                    </ModalContentForm>
                )}
            </Modal>
        </>
    );
};

export default AbbreviationsPage;
