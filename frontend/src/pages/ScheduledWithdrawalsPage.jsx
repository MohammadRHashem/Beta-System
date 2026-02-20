import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { FaCalendarAlt, FaEdit, FaPlus, FaTrash, FaBolt } from 'react-icons/fa';
import { format, parseISO } from 'date-fns';
import Modal from '../components/Modal';
import {
    getScheduledWithdrawals,
    createScheduledWithdrawal,
    updateScheduledWithdrawal,
    deleteScheduledWithdrawal,
    toggleScheduledWithdrawal,
    withdrawNowScheduledWithdrawal,
    getSubaccounts
} from '../services/api';
import { usePermissions } from '../context/PermissionContext';

const PageContainer = styled.div`display: flex; flex-direction: column; gap: 2rem;`;
const Header = styled.div`display: flex; justify-content: space-between; align-items: center;`;
const Card = styled.div`background: #fff; padding: 1.5rem 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);`;
const Button = styled.button`
    background-color: ${({ theme, color }) => color === 'primary' ? theme.primary : theme.secondary};
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
    th { background-color: ${({ theme }) => theme.background}; }
    td.actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 1.5rem;
        font-size: 1.1rem;
        svg {
            cursor: pointer;
            color: ${({ theme }) => theme.lightText};
            &:hover { color: ${({ theme }) => theme.primary}; }
        }
    }
`;
const InlineActionButton = styled.button`
    background-color: ${({ theme }) => theme.primary};
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0.45rem 0.7rem;
    font-size: 0.8rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;
const SwitchContainer = styled.label`position: relative; display: inline-block; width: 50px; height: 28px;`;
const SwitchInput = styled.input`
    opacity: 0;
    width: 0;
    height: 0;
    &:checked + span { background-color: ${({ theme }) => theme.secondary}; }
    &:checked + span:before { transform: translateX(22px); }
    &:disabled + span { cursor: not-allowed; background-color: #e9ecef; opacity: 0.7; }
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
const StatusBadge = styled.span`
    padding: 0.3rem 0.6rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.8rem;
    color: #fff;
    background-color: ${({ status }) => {
        if (status === 'success') return '#00C49A';
        if (status === 'failed') return '#DE350B';
        if (status === 'skipped') return '#6B7C93';
        return '#A0AEC0';
    }};
`;
const ScheduleInfo = styled.div`font-size: 0.9rem; span { display: block; color: #6B7C93; font-size: 0.8rem; }`;
const ModalForm = styled.form`display: flex; flex-direction: column; gap: 1.5rem;`;
const InputGroup = styled.div`display: flex; flex-direction: column; gap: 0.5rem;`;
const Label = styled.label`font-weight: 500;`;
const Input = styled.input`padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; font-size: 1rem;`;
const Select = styled.select`padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; font-size: 1rem; background: #fff;`;
const Fieldset = styled.fieldset`border: 1px solid #eee; border-radius: 4px; padding: 1rem; display: flex; flex-wrap: wrap; gap: 1rem;`;
const Legend = styled.legend`padding: 0 0.5em; font-weight: 500; color: #6B7C93;`;
const DayButton = styled.button`
    padding: 0.5rem 0.75rem;
    border: 1px solid ${({ theme, selected }) => selected ? theme.secondary : theme.border};
    background: ${({ theme, selected }) => selected ? '#e6fff9' : '#fff'};
    color: ${({ theme, selected }) => selected ? theme.secondary : theme.text};
    border-radius: 20px;
    font-weight: 600;
    cursor: pointer;
`;

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const daysOfWeekFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const parseDays = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
};

const formatSchedule = (schedule) => {
    const time = String(schedule.scheduled_at_time || '').substring(0, 5);
    if (schedule.schedule_type === 'ONCE') {
        return `Once on ${format(parseISO(schedule.scheduled_at_date), 'MMM dd, yyyy')} at ${time}`;
    }
    if (schedule.schedule_type === 'DAILY') {
        return `Daily at ${time}`;
    }
    if (schedule.schedule_type === 'WEEKLY') {
        const dayIndexes = parseDays(schedule.scheduled_days_of_week);
        if (dayIndexes.length === 0) return `Weekly at ${time} (No days selected)`;
        return `Weekly on ${dayIndexes.map((d) => daysOfWeek[d]).join(', ')} at ${time}`;
    }
    return 'Unknown';
};

const ScheduledWithdrawalsPage = () => {
    const { hasPermission } = usePermissions();
    const canView = hasPermission('subaccount:withdrawals:view');
    const canCreate = hasPermission('subaccount:withdrawals:create');
    const canUpdate = hasPermission('subaccount:withdrawals:update');
    const canDelete = hasPermission('subaccount:withdrawals:delete');

    const [loading, setLoading] = useState(true);
    const [schedules, setSchedules] = useState([]);
    const [subaccounts, setSubaccounts] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [withdrawingId, setWithdrawingId] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [schedulesRes, subaccountsRes] = await Promise.all([
                canView ? getScheduledWithdrawals() : Promise.resolve({ data: [] }),
                getSubaccounts()
            ]);
            setSchedules(schedulesRes.data || []);
            setSubaccounts((subaccountsRes.data || []).filter((s) => s.account_type === 'xpayz'));
        } catch (error) {
            alert('Failed to fetch scheduled withdrawals.');
        } finally {
            setLoading(false);
        }
    }, [canView]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenModal = (schedule = null) => {
        setEditingSchedule(schedule);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditingSchedule(null);
        setIsModalOpen(false);
    };

    const handleSave = async (formData) => {
        try {
            if (editingSchedule) {
                if (!canUpdate) return;
                await updateScheduledWithdrawal(editingSchedule.id, formData);
            } else {
                if (!canCreate) return;
                await createScheduledWithdrawal(formData);
            }
            await fetchData();
            handleCloseModal();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to save schedule.');
        }
    };

    const handleDelete = async (id) => {
        if (!canDelete) return;
        if (!window.confirm('Are you sure you want to delete this scheduled withdrawal?')) return;
        try {
            await deleteScheduledWithdrawal(id);
            await fetchData();
        } catch (error) {
            alert('Failed to delete schedule.');
        }
    };

    const handleToggle = async (schedule) => {
        if (!canUpdate) return;
        try {
            await toggleScheduledWithdrawal(schedule.id, !schedule.is_active);
            await fetchData();
        } catch (error) {
            alert('Failed to update schedule status.');
        }
    };

    const handleWithdrawNow = async (schedule) => {
        if (!canUpdate) return;
        if (!window.confirm(`Trigger all-in withdraw now for "${schedule.subaccount_name}"?`)) return;

        setWithdrawingId(schedule.id);
        try {
            const { data } = await withdrawNowScheduledWithdrawal(schedule.id);
            if (data?.message) {
                alert(data.message);
            }
            await fetchData();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to execute manual withdraw.');
        } finally {
            setWithdrawingId(null);
        }
    };

    return (
        <>
            <PageContainer>
                <Header>
                    <h2>Scheduled Withdrawals</h2>
                    {canCreate && (
                        <Button onClick={() => handleOpenModal(null)}>
                            <FaPlus /> New Trigger
                        </Button>
                    )}
                </Header>
                <Card>
                    <p>Every execution is all-in: system fetches live subaccount balance, then withdraws full amount.</p>
                    <Table>
                        <thead>
                            <tr>
                                <th>Active</th>
                                <th>Subaccount</th>
                                <th>Schedule</th>
                                <th>Last Run</th>
                                <th>Last Status</th>
                                {(canUpdate || canDelete) && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="6">Loading...</td></tr>
                            ) : schedules.length === 0 ? (
                                <tr><td colSpan="6">No scheduled withdrawals found.</td></tr>
                            ) : (
                                schedules.map((schedule) => (
                                    <tr key={schedule.id}>
                                        <td>
                                            <SwitchContainer>
                                                <SwitchInput
                                                    type="checkbox"
                                                    checked={!!schedule.is_active}
                                                    onChange={() => handleToggle(schedule)}
                                                    disabled={!canUpdate}
                                                />
                                                <Slider />
                                            </SwitchContainer>
                                        </td>
                                        <td>
                                            <strong>{schedule.subaccount_name}</strong>
                                            <ScheduleInfo>
                                                <span>#{schedule.subaccount_number}</span>
                                            </ScheduleInfo>
                                        </td>
                                        <td>
                                            <ScheduleInfo>
                                                {formatSchedule(schedule)}
                                                <span>Timezone: {schedule.timezone}</span>
                                            </ScheduleInfo>
                                        </td>
                                        <td>{schedule.last_run_at ? format(new Date(schedule.last_run_at), 'dd/MM/yyyy HH:mm') : '-'}</td>
                                        <td>
                                            {schedule.last_status ? <StatusBadge status={schedule.last_status}>{schedule.last_status}</StatusBadge> : '-'}
                                        </td>
                                        {(canUpdate || canDelete) && (
                                            <td className="actions">
                                                {canUpdate && (
                                                    <InlineActionButton
                                                        type="button"
                                                        onClick={() => handleWithdrawNow(schedule)}
                                                        disabled={withdrawingId === schedule.id}
                                                        title="Execute all-in withdraw immediately"
                                                    >
                                                        <FaBolt />
                                                        {withdrawingId === schedule.id ? 'Withdrawing...' : 'Withdraw Now'}
                                                    </InlineActionButton>
                                                )}
                                                {canUpdate && <FaEdit title="Edit" onClick={() => handleOpenModal(schedule)} />}
                                                {canDelete && <FaTrash title="Delete" onClick={() => handleDelete(schedule.id)} />}
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </Table>
                </Card>
            </PageContainer>
            {(canCreate || canUpdate) && (
                <ScheduledWithdrawalModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSave}
                    schedule={editingSchedule}
                    subaccounts={subaccounts}
                />
            )}
        </>
    );
};

const ScheduledWithdrawalModal = ({ isOpen, onClose, onSave, schedule, subaccounts }) => {
    const [formData, setFormData] = useState({
        subaccount_id: '',
        schedule_type: 'ONCE',
        scheduled_at_time: '09:00',
        scheduled_at_date: format(new Date(), 'yyyy-MM-dd'),
        scheduled_days_of_week: [],
        timezone: 'America/Sao_Paulo'
    });

    useEffect(() => {
        if (!isOpen) return;
        if (schedule) {
            setFormData({
                subaccount_id: String(schedule.subaccount_id),
                schedule_type: schedule.schedule_type,
                scheduled_at_time: String(schedule.scheduled_at_time || '').substring(0, 5),
                scheduled_at_date: schedule.scheduled_at_date ? format(parseISO(schedule.scheduled_at_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
                scheduled_days_of_week: parseDays(schedule.scheduled_days_of_week),
                timezone: schedule.timezone || 'America/Sao_Paulo'
            });
            return;
        }
        setFormData({
            subaccount_id: '',
            schedule_type: 'ONCE',
            scheduled_at_time: '09:00',
            scheduled_at_date: format(new Date(), 'yyyy-MM-dd'),
            scheduled_days_of_week: [],
            timezone: 'America/Sao_Paulo'
        });
    }, [isOpen, schedule]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleDayToggle = (dayIndex) => {
        setFormData((prev) => {
            const set = new Set(prev.scheduled_days_of_week || []);
            if (set.has(dayIndex)) set.delete(dayIndex);
            else set.add(dayIndex);
            return { ...prev, scheduled_days_of_week: Array.from(set).sort((a, b) => a - b) };
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...formData,
            subaccount_id: parseInt(formData.subaccount_id, 10)
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="700px">
            <h2>{schedule ? 'Edit Scheduled Withdrawal' : 'Create Scheduled Withdrawal'}</h2>
            <ModalForm onSubmit={handleSubmit}>
                <InputGroup>
                    <Label>XPayz Subaccount</Label>
                    <Select name="subaccount_id" value={formData.subaccount_id} onChange={handleChange} required>
                        <option value="" disabled>Select subaccount...</option>
                        {subaccounts.map((subaccount) => (
                            <option key={subaccount.id} value={subaccount.id}>
                                {subaccount.name} (#{subaccount.subaccount_number})
                            </option>
                        ))}
                    </Select>
                </InputGroup>

                <Fieldset>
                    <Legend>Schedule Type</Legend>
                    <label><input type="radio" name="schedule_type" value="ONCE" checked={formData.schedule_type === 'ONCE'} onChange={handleChange} /> One Time</label>
                    <label><input type="radio" name="schedule_type" value="DAILY" checked={formData.schedule_type === 'DAILY'} onChange={handleChange} /> Daily</label>
                    <label><input type="radio" name="schedule_type" value="WEEKLY" checked={formData.schedule_type === 'WEEKLY'} onChange={handleChange} /> Weekly</label>
                </Fieldset>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <InputGroup>
                        <Label>Time ({formData.timezone})</Label>
                        <Input type="time" name="scheduled_at_time" value={formData.scheduled_at_time} onChange={handleChange} required />
                    </InputGroup>
                    {formData.schedule_type === 'ONCE' && (
                        <InputGroup>
                            <Label>Date</Label>
                            <Input type="date" name="scheduled_at_date" value={formData.scheduled_at_date} onChange={handleChange} required />
                        </InputGroup>
                    )}
                </div>

                {formData.schedule_type === 'WEEKLY' && (
                    <Fieldset>
                        <Legend>Days of Week</Legend>
                        {daysOfWeekFull.map((dayName, index) => (
                            <DayButton key={dayName} type="button" selected={formData.scheduled_days_of_week.includes(index)} onClick={() => handleDayToggle(index)}>
                                {dayName}
                            </DayButton>
                        ))}
                    </Fieldset>
                )}

                <InputGroup>
                    <Label>Timezone</Label>
                    <Select name="timezone" value={formData.timezone} onChange={handleChange} required>
                        <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                    </Select>
                </InputGroup>

                <Button type="submit" color="primary" style={{ alignSelf: 'flex-end', marginTop: '1rem' }}>
                    <FaCalendarAlt /> Save Trigger
                </Button>
            </ModalForm>
        </Modal>
    );
};

export default ScheduledWithdrawalsPage;
