import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styled from 'styled-components';
import { FaWhatsapp } from 'react-icons/fa';

const AuthPageContainer = styled.div`
    width: 100vw;
    height: 100vh;
    padding: 1rem;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: ${({ theme }) => theme.background};
`;

const AuthFormContainer = styled.div`
    width: 100%;
    max-width: 400px;
    padding: 2rem 1.7rem 1.6rem;
    background: #fff;
    border-radius: 14px;
    border: 1px solid rgba(9, 30, 66, 0.08);
    box-shadow: 0 14px 30px rgba(9, 30, 66, 0.12);
`;

const Title = styled.h1`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  font-size: 1.7rem;
  color: ${({ theme }) => theme.primary};
  margin-bottom: 1.5rem;
  svg { color: ${({ theme }) => theme.secondary}; }
`;

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const Input = styled.input`
    padding: 0.72rem 0.85rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    font-size: 0.95rem;
`;

const Button = styled.button`
    padding: 0.72rem 0.9rem;
    border: none;
    background-color: ${({ theme }) => theme.primary};
    color: white;
    font-size: 0.95rem;
    font-weight: bold;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.2s;
    &:hover { background-color: #081e35; }
`;

const ErrorMessage = styled.p`
    color: ${({ theme }) => theme.error};
    text-align: center;
    margin-top: 1rem;
    font-size: 0.9rem;
`;

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await login(username, password);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to log in. Please check your credentials.');
        }
    };

    return (
        <AuthPageContainer>
            <AuthFormContainer>
                <Title><FaWhatsapp /> Beta Suite</Title>
                <Form onSubmit={handleSubmit}>
                    <Input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required />
                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
                    <Button type="submit">Login</Button>
                    {error && <ErrorMessage>{error}</ErrorMessage>}
                </Form>
            </AuthFormContainer>
        </AuthPageContainer>
    );
};

export default LoginPage;
