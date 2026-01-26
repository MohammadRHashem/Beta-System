import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const PortalImpersonate = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
        const params = new URLSearchParams(hash);
        const token = params.get('token');
        const clientParam = params.get('client');

        if (!token || !clientParam) {
            navigate('/portal/login', { replace: true });
            return;
        }

        let client = null;
        try {
            client = JSON.parse(clientParam);
        } catch (error) {
            client = null;
        }

        sessionStorage.setItem('portalAuthToken', token);
        sessionStorage.setItem('portalImpersonation', 'true');
        if (client) {
            sessionStorage.setItem('portalClient', JSON.stringify(client));
        }

        navigate('/portal/dashboard', { replace: true });
    }, [navigate]);

    return <div style={{ padding: '2rem' }}>Launching client portal...</div>;
};

export default PortalImpersonate;
