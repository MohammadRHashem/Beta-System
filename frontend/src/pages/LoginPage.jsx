import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styled from 'styled-components';

const LoginContainer = styled.div` /* Add styles for your login form */ `;

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
            setError(err.response?.data?.message || 'Failed to log in.');
        }
    };

    return (
        <LoginContainer>
            <h2>Login to Beta Suite</h2>
            <form onSubmit={handleSubmit}>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
                <button type="submit">Login</button>
                {error && <p style={{color: 'red'}}>{error}</p>}
            </form>
            {/* Optional: Add a link to the register page */}
        </LoginContainer>
    );
};

export default LoginPage;