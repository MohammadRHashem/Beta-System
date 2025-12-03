import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { FaPlus, FaEdit, FaTrash } from 'react-icons/fa';
import { format, parseISO } from 'date-fns';
import {
    getScheduledBroadcasts, createSchedule, updateSchedule,
    deleteSchedule, toggleSchedule, getBatches, getTemplates // <-- Import getTemplates
} from '../services/api';
import Modal from '../components/Modal';

// ... (All styled components remain exactly the same)
const PageContainer = styled.div` display: flex; flex-direction: column; gap: 2rem; `;
const Header = styled.div` display: flex; justify-content: space-between; align-items: center; `;
const Card = styled.div` background: #fff; padding: 1.5rem 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); `;
const Button = styled.button` background-color: ${({ theme, color }) => color === 'primary' ? theme.primary : theme.secondary}; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 0.5rem; `;
const Table = styled.table` width: 100%; border-collapse: collapse; margin-top: 1.5rem; th, td { padding: 1rem; text-align: left; border-bottom: 1px solid ${({ theme }) => theme.border}; } th { background-color: ${({ theme }) => theme.background}; } td.actions { display: flex; gap: 1.5rem; font-size: 1.1rem; svg { cursor: pointer; color: ${({ theme }) => theme.lightText}; &:hover { color: ${({ theme }) => theme.primary}; } } } `;
const SwitchContainer = styled.label` position: relative; display: inline-block; width: 50px; height: 28px; `;
const SwitchInput = styled.input` opacity: 0; width: 0; height: 0; &:checked + span { background-color: ${({ theme }) => theme.secondary}; } &:checked + span:before { transform: translateX(22px); } `;
const Slider = styled.span` position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; &:before { position: absolute; content: ""; height: 20px; width: 20px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; } `;
const ScheduleInfo = styled.div` font-size: 0.9rem; span { display: block; color: #6B7C93; font-size: 0.8rem; } `;
const ModalForm = styled.form` display: flex; flex-direction: column; gap: 1.5rem; `;
const InputGroup = styled.div` display: flex; flex-direction: column; gap: 0.5rem; `;
const Label = styled.label` font-weight: 500; `;
const Input = styled.input` padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; font-size: 1rem; `;
const Select = styled.select` padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; font-size: 1rem; background: #fff; `;
const Textarea = styled.textarea` padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; font-size: 1rem; min-height: 120px; font-family: inherit; &:disabled { background: #f6f9fc; color: #6b7c93; } `;
const Fieldset = styled.fieldset` border: 1px solid #eee; border-radius: 4px; padding: 1rem; display: flex; flex-wrap: wrap; gap: 1rem; `;
const Legend = styled.legend` padding: 0 0.5em; font-weight: 500; color: #6B7C93; `;
const DayButton = styled.button` padding: 0.5rem 0.75rem; border: 1px solid ${({ theme, selected }) => selected ? theme.secondary : theme.border}; background: ${({ theme, selected }) => selected ? '#e6fff9' : '#fff'}; color: ${({ theme, selected }) => selected ? theme.secondary : theme.text}; border-radius: 20px; font-weight: 600; cursor: pointer; `;

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const daysOfWeekFull = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ScheduledBroadcastsPage = () => {
    const [schedules, setSchedules] = useState([]);
    const [batches, setBatches] = useState([]);
    const [templates, setTemplates] = useState([]); // <-- NEW STATE FOR TEMPLATES
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // --- UPDATED to fetch templates as well ---
            const [schedulesRes, batchesRes, templatesRes] = await Promise.all([
                getScheduledBroadcasts(), 
                getBatches(),
                getTemplates()
            ]);
            setSchedules(schedulesRes.data);
            setBatches(batchesRes.data);
            setTemplates(templatesRes.data); // <-- SET TEMPLATES
        } catch (error) {
            alert("Failed to fetch page data.");
        } finally {
            setLoading(false);
        }
    }, []);

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
                await updateSchedule(editingSchedule.id, formData);
            } else {
                await createSchedule(formData);
            }
            fetchData();
            handleCloseModal();
        } catch (error) {
            alert(error.response?.data?.message || "Failed to save schedule.");
        }
    };
    
    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this schedule?")) {
            try {
                await deleteSchedule(id);
                fetchData();
            } catch (error) {
                alert("Failed to delete schedule.");
            }
        }
    };

    const handleToggle = async (schedule) => {
        try {
            await toggleSchedule(schedule.id, !schedule.is_active);
            fetchData();
        } catch (error) {
            alert("Failed to update schedule status.");
        }
    };

    const formatSchedule = (s) => {
        const time = s.scheduled_at_time.substring(0, 5);
        if (s.schedule_type === 'ONCE') {
            return `Once on ${format(parseISO(s.scheduled_at_date), 'MMM dd, yyyy')} at ${time}`;
        }
        if (s.schedule_type === 'DAILY') {
            return `Daily at ${time}`;
        }
        // Corrected and more robust code
        if (s.schedule_type === 'WEEKLY') {
            // Check if scheduled_days_of_week is an array and not empty
            if (Array.isArray(s.scheduled_days_of_week) && s.scheduled_days_of_week.length > 0) {
                const selectedDays = s.scheduled_days_of_week.map(d => daysOfWeek[d]).join(', ');
                return `Weekly on ${selectedDays} at ${time}`;
            }
            // Fallback for invalid or empty data to prevent crashes
            return `Weekly at ${time} (No days selected)`;
        }
        return 'Unknown';
    };

    return (
        <>
            <PageContainer>
                <Header>
                    <h2>Scheduled Broadcasts</h2>
                    <Button onClick={() => handleOpenModal(null)}><FaPlus /> New Schedule</Button>
                </Header>
                <Card>
                    <p>Automate your broadcasts by creating schedules. The system will automatically send the message to the selected batch based on the time and recurrence you set.</p>
                    <Table>
                        <thead>
                            <tr>
                                <th>Active</th>
                                <th>Batch Name</th>
                                <th>Schedule</th>
                                <th>Message</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5">Loading schedules...</td></tr>
                            ) : schedules.length === 0 ? (
                                <tr><td colSpan="5">No schedules created yet.</td></tr>
                            ) : (
                                schedules.map(s => (
                                    <tr key={s.id}>
                                        <td>
                                            <SwitchContainer>
                                                <SwitchInput type="checkbox" checked={!!s.is_active} onChange={() => handleToggle(s)} />
                                                <Slider />
                                            </SwitchContainer>
                                        </td>
                                        <td>{s.batch_name}</td>
                                        <td>
                                            <ScheduleInfo>
                                                {formatSchedule(s)}
                                                <span>Timezone: {s.timezone}</span>
                                            </ScheduleInfo>
                                        </td>
                                        <td style={{ maxWidth: '300px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{s.message}</td>
                                        <td className="actions">
                                            <FaEdit onClick={() => handleOpenModal(s)} />
                                            <FaTrash onClick={() => handleDelete(s.id)} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </Table>
                </Card>
            </PageContainer>
            <ScheduleModal 
                isOpen={isModalOpen} 
                onClose={handleCloseModal} 
                onSave={handleSave} 
                schedule={editingSchedule} 
                batches={batches}
                templates={templates} // <-- PASS TEMPLATES TO MODAL
            />
        </>
    );
};

const ScheduleModal = ({ isOpen, onClose, onSave, schedule, batches, templates }) => {
    const [formData, setFormData] = useState({
        batch_id: '', message: '', schedule_type: 'ONCE',
        scheduled_at_time: '09:00', scheduled_at_date: format(new Date(), 'yyyy-MM-dd'),
        scheduled_days_of_week: [], timezone: 'America/Sao_Paulo'
    });
    const [selectedTemplateId, setSelectedTemplateId] = useState(''); // <-- NEW STATE

    useEffect(() => {
        if (schedule) {
            setFormData({
                batch_id: schedule.batch_id,
                message: schedule.message,
                schedule_type: schedule.schedule_type,
                scheduled_at_time: schedule.scheduled_at_time.substring(0, 5),
                scheduled_at_date: schedule.scheduled_at_date ? format(parseISO(schedule.scheduled_at_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
                scheduled_days_of_week: schedule.scheduled_days_of_week ? JSON.parse(schedule.scheduled_days_of_week) : [],
                timezone: schedule.timezone
            });
            setSelectedTemplateId(''); // Reset template selection when editing
        } else {
            setFormData({
                batch_id: '', message: '', schedule_type: 'ONCE',
                scheduled_at_time: '09:00', scheduled_at_date: format(new Date(), 'yyyy-MM-dd'),
                scheduled_days_of_week: [], timezone: 'America/Sao_Paulo'
            });
            setSelectedTemplateId('');
        }
    }, [schedule, isOpen]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleDayToggle = (dayIndex) => {
        const days = new Set(formData.scheduled_days_of_week);
        if (days.has(dayIndex)) {
            days.delete(dayIndex);
        } else {
            days.add(dayIndex);
        }
        setFormData({ ...formData, scheduled_days_of_week: Array.from(days).sort() });
    };

    // --- NEW: Handler for template selection ---
    const handleTemplateChange = (e) => {
        const templateId = e.target.value;
        setSelectedTemplateId(templateId);
        if (templateId) {
            const selected = templates.find(t => t.id.toString() === templateId);
            if (selected) {
                setFormData(prev => ({ ...prev, message: selected.text }));
            }
        } else {
            // Cleared template selection, so clear message for custom input
            setFormData(prev => ({ ...prev, message: '' }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="700px">
            <h2>{schedule ? 'Edit Schedule' : 'Create New Schedule'}</h2>
            <ModalForm onSubmit={handleSubmit}>
                <InputGroup>
                    <Label>Batch</Label>
                    <Select name="batch_id" value={formData.batch_id} onChange={handleChange} required>
                        <option value="" disabled>Select a batch...</option>
                        {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                </InputGroup>
                
                {/* === NEW MESSAGE SECTION === */}
                <InputGroup>
                    <Label>Message Template (Optional)</Label>
                    <Select value={selectedTemplateId} onChange={handleTemplateChange}>
                        <option value="">-- Type a Custom Message Below --</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                </InputGroup>
                <InputGroup>
                    <Label>Message Content</Label>
                    <Textarea 
                        name="message" 
                        value={formData.message} 
                        onChange={handleChange} 
                        required 
                        placeholder="Type a custom message or select a template..."
                        disabled={!!selectedTemplateId} // Textarea is disabled if a template is selected
                    />
                </InputGroup>
                {/* ========================== */}

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
                        <Legend>Days of the Week</Legend>
                        {daysOfWeekFull.map((day, index) => (
                            <DayButton key={index} type="button" selected={formData.scheduled_days_of_week.includes(index)} onClick={() => handleDayToggle(index)}>
                                {day}
                            </DayButton>
                        ))}
                    </Fieldset>
                )}
                <Button type="submit" color="primary" style={{ alignSelf: 'flex-end', marginTop: '1rem' }}>Save Schedule</Button>
            </ModalForm>
        </Modal>
    );
};

export default ScheduledBroadcastsPage;