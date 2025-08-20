import React from 'react';
import { Routes, Route } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Import Page Components
import LoginPage from './pages/LoginPage';
// import RegisterPage from './pages/RegisterPage'; // You can create this if you ever need it
import MainLayout from './pages/MainLayout.jsx'; // The main dashboard component

// A simple loading spinner component
const LoadingContainer = styled.div`
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.5rem;
    color: ${({ theme }) => theme.primary};
`;

const App = () => {
    const { loading } = useAuth();

    // While the AuthContext is checking localStorage for a token,
    // show a simple loading message to prevent a "flicker" effect.
    if (loading) {
        return <LoadingContainer>Loading Application...</LoadingContainer>;
    }

    return (
        <Routes>
            {/* PUBLIC ROUTES */}
            <Route path="/login" element={<LoginPage />} />
            {/* Uncomment the line below if you create a RegisterPage */}
            {/* <Route path="/register" element={<RegisterPage />} /> */}
            
            {/* PROTECTED ROUTES */}
            {/* The "/*" is a wildcard that matches all other routes. */}
            {/* The entire MainLayout is wrapped in the ProtectedRoute component. */}
            <Route 
                path="/*"
                element={
                    <ProtectedRoute>
                        <MainLayout />
                    </ProtectedRoute>
                } 
            />
        </Routes>
    );
};

export default App;