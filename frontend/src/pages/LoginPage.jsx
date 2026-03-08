import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styled from 'styled-components';
import { FiGrid, FiLock, FiUser } from 'react-icons/fi';

const AuthPageContainer = styled.div`
    width: 100vw;
    height: 100vh;
    padding: 1rem;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    align-items: center;
    background:
      radial-gradient(circle at 14% 0%, rgba(13, 168, 143, 0.2), transparent 36%),
      radial-gradient(circle at 88% 14%, rgba(65, 120, 224, 0.16), transparent 30%),
      ${({ theme }) => theme.background};
`;

const AuthFormContainer = styled.div`
    width: 100%;
    max-width: 430px;
    padding: 2rem 1.7rem 1.6rem;
    background: ${({ theme }) => theme.surface};
    border-radius: 22px;
    border: 1px solid ${({ theme }) => theme.border};
    box-shadow: ${({ theme }) => theme.shadowMd};
`;

const Title = styled.h1`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  font-size: 1.6rem;
  color: ${({ theme }) => theme.primary};
  margin-bottom: 1.7rem;
  svg { color: ${({ theme }) => theme.secondary}; }
`;

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const InputWrap = styled.div`
    position: relative;
    display: flex;
    align-items: center;
`;

const InputIcon = styled.span`
    position: absolute;
    left: 0.75rem;
    display: inline-flex;
    color: ${({ theme }) => theme.lightText};
`;

const Input = styled.input`
    padding: 0.72rem 0.85rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;
    font-size: 0.95rem;
    width: 100%;
    padding-left: 2.3rem;
`;

const Button = styled.button`
    padding: 0.72rem 0.9rem;
    border: 1px solid transparent;
    background-color: ${({ theme }) => theme.primary};
    color: white;
    font-size: 0.95rem;
    font-weight: 800;
    border-radius: 10px;
    cursor: pointer;
    transition: transform 0.2s ease, filter 0.2s ease;
    &:hover {
      transform: translateY(-1px);
      filter: brightness(1.05);
    }
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
                <Title><FiGrid /> Beta Suite</Title>
                <Form onSubmit={handleSubmit}>
                    <InputWrap>
                        <InputIcon><FiUser /></InputIcon>
                        <Input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required />
                    </InputWrap>
                    <InputWrap>
                        <InputIcon><FiLock /></InputIcon>
                        <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
                    </InputWrap>
                    <Button type="submit">Login</Button>
                    {error && <ErrorMessage>{error}</ErrorMessage>}
                </Form>
            </AuthFormContainer>
        </AuthPageContainer>
    );
};

export default LoginPage;
